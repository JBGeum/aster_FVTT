import { prepareActiveEffectCategories } from "../helpers/effects.mjs";
import {
  checkBagCapacity,
  checkStorageAdd,
  EQUIP_SLOT_CONTAINERS,
  isEquipSlotContainer,
} from "../helpers/inventory-capacity.mjs";
import { CRAFT_TREE } from "../helpers/craft-tree.mjs";
import { prereqMet, sumCost, canAcquire, canRelease } from "../helpers/craft-cost.mjs";
import { validateCraft, craftItem, getCraftRequiresBaseList } from "../helpers/craft-item.mjs";
import { computeSpellRoll, getAbilityTotal, isSpecialty } from "../helpers/spell-roll.mjs";
import { detectCritFumble, computePenalties } from "../helpers/roll-result.mjs";
import { pickDiceDialog } from "../helpers/dice-select.mjs";
import { getTargetedTokens } from "../helpers/target-select.mjs";
import {
  DAMAGE_STATUSES,
  applyCureStatus,
  applyCureAllStatus,
  applyDamageAndStatus,
  applyHealHealth,
} from "../aster.mjs";
import { lookupUnisonEffect, getUnisonDescription } from "../helpers/unison-table.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class AsterActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["aster", "sheet", "actor"],
    position: { width: 960, height: 800 },
    window: { resizable: true },
    actions: {
      cellClick: AsterActorSheet.#onCellClick,
      itemUnplace: AsterActorSheet.#onItemUnplace,
      foodSelect: AsterActorSheet.#onFoodSelect,
      picnicDeclare: AsterActorSheet.#onPicnicDeclare,
      combatAction: AsterActorSheet.#onCombatAction,
      npcActionUse: AsterActorSheet.#onNpcActionUse,
      rollDodge: AsterActorSheet.#onRollDodge,
      rollHit: AsterActorSheet.#onRollHit,
      unisonAttack: AsterActorSheet.#onUnisonAttack,
      itemChat: AsterActorSheet.#onItemChat,
      itemEdit: AsterActorSheet.#onItemEdit,
      itemDelete: AsterActorSheet.#onItemDelete,
      consumableUse: AsterActorSheet.#onConsumableUse,
      revive: AsterActorSheet.#onRevive,
      equipmentEquip: AsterActorSheet.#onEquipmentEquip,
      equipmentUnequip: AsterActorSheet.#onEquipmentUnequip,
      toggleSkill: AsterActorSheet.#onToggleSkill,
      craftReset: AsterActorSheet.#onCraftReset,
      craftLockToggle: AsterActorSheet.#onCraftLockToggle,
      craftItemOpen: AsterActorSheet.#onCraftItemOpen,
      spellCast: AsterActorSheet.#onSpellCast,
      spellCastWithExtra: AsterActorSheet.#onSpellCastWithExtra,
      recordPrev: AsterActorSheet.#onRecordPrev,
      recordNext: AsterActorSheet.#onRecordNext,
      recordAdd: AsterActorSheet.#onRecordAdd,
      recordDelete: AsterActorSheet.#onRecordDelete,
      ablRoll: AsterActorSheet.#onAblRoll,
      emoRoll: AsterActorSheet.#onEmoRoll,
      itemCreate: AsterActorSheet.#onItemCreate,
    },
  };

  static #formConfig = {
    handler: AsterActorSheet.#onSubmit,
    submitOnChange: true,
    closeOnSubmit: false,
  };

  static PARTS = {
    character: {
      template: "systems/aster/templates/actor/actor-character-sheet.html",
      forms: { form: AsterActorSheet.#formConfig },
    },
    npc: {
      template: "systems/aster/templates/actor/actor-npc-sheet.html",
      forms: { form: AsterActorSheet.#formConfig },
    },
  };

  tabGroups = { main: "character", sub: "inventory" };

  get title() {
    return this.actor.name;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = [this.document.type];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const actorData = this.actor.toObject(false);
    context.actor = this.actor;
    context.system = actorData.system;
    context.flags = actorData.flags;
    context.items = this.actor.items.map((i) => i.toObject(false));
    context.effects = prepareActiveEffectCategories(this.actor.effects);
    context.rollData = this.actor.getRollData();
    context.config = CONFIG.ASTER;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.editable = this.isEditable;
    context.owner = this.actor.isOwner;

    if (this.actor.type === "character") {
      this._prepareCharacterData(context);
      this._prepareItems(context);
      this._prepareInventory(context);
      this._prepareCraft(context);
      this._prepareSpellList(context);
      this._prepareRecord(context);
      context.combatContext = this.#buildCombatContext();
      context.reviveContext = this.#buildReviveContext();
    } else if (this.actor.type === "npc") {
      this._prepareItems(context);
      // N3 — combat 영역 활성 (PC 패턴 정합). #buildCombatContext는 actor 무관 동작:
      // AP 표시·공통 액션 disabled 상태를 PC와 동일하게 노출한다. unisonReady는 NPC에
      // 설정되지 않으므로 합체기 관련 필드는 자연히 false(발동 후보에서도 제외).
      context.combatContext = this.#buildCombatContext();
      // N2 — npcAction(스킬 표)과 일반 items 분리. 대상 라벨은 미리 지역화.
      // combatDisabled는 시전 버튼 disabled용 — 각 행에서 부모 combatContext를 `../`로 참조하면
      // prettier HTML 파서가 실패하므로 행 컨텍스트에 미리 평면화한다.
      context.npcActions = context.items
        .filter((i) => i.type === "npcAction")
        .map((i) => ({
          ...i,
          targetLabel: game.i18n.localize(`ASTER.npcAction.target.${i.system.targetType}`),
          combatDisabled: context.combatContext.disabled,
        }));
      context.npcItems = context.items.filter((i) => i.type !== "npcAction");
    }

    return context;
  }

  /**
   * 전투 탭 컨텍스트. 활성 Combat에서 이 액터의 Combatant를 찾아 AP·라운드 사용 상태를 노출.
   * @returns {{inCombat:boolean, disabled:boolean, ap:number, combatantId?:string, defendUsed?:boolean, chargeUsed?:boolean}}
   */
  #buildCombatContext() {
    const combat = game.combat;
    if (!combat?.started) return { inCombat: false, disabled: true, ap: 0 };

    const combatant = combat.combatants.find((c) => c.actor?.id === this.actor.id);
    if (!combatant) return { inCombat: false, disabled: true, ap: 0 };

    const usage = combatant.getFlag("aster", "actionsThisRound") ?? {};
    // 합체기 발동 조건: 본인 unisonReady && 다른 unisonReady PC 1명 이상.
    const unisonReady = combatant.getFlag("aster", "unisonReady") === true;
    const otherUnisonReady = combat.combatants.some(
      (c) =>
        c.id !== combatant.id &&
        c.actor?.type === "character" &&
        c.getFlag("aster", "unisonReady") === true,
    );
    return {
      inCombat: true,
      disabled: false,
      ap: combatant.getFlag("aster", "actionPoint") ?? 0,
      combatantId: combatant.id,
      defendUsed: (usage.defend ?? 0) >= 1,
      chargeUsed: (usage.charge ?? 0) >= 1,
      focusActive: combatant.getFlag("aster", "focusActive") === true,
      unisonReady,
      canUnison: unisonReady && otherUnisonReady,
      // 템플릿 `{{disabled}}` 헬퍼가 truthy를 disabled로 변환하므로 부정값을 컨텍스트에서 미리 계산.
      disableUnison: !(unisonReady && otherUnisonReady),
    };
  }

  /**
   * 협력 회복 컨텍스트 (R2, 룰북 535~537). 건강 0 = 행동불능.
   * 탐색 페이즈에서만 협력 회복 가능 — 피크닉(D20)·포만 감소와 동일하게 currentPhase로 판정.
   * 클라이막스(전투) 페이즈는 회복 불가 안내만 (룰북 537, 전투 종료 자동 회복은 별도 STEP).
   * @returns {{isFallen:boolean, canRevive:boolean, inCombatBlocked:boolean}}
   */
  #buildReviveContext() {
    const isFallen = (this.actor.system.health?.value ?? 0) === 0;
    const phase = game.settings.get("aster", "currentPhase");
    return {
      isFallen,
      canRevive: isFallen && phase === "exploration",
      inCombatBlocked: isFallen && phase === "climax",
    };
  }

  _prepareCharacterData(context) {
    for (const [k, v] of Object.entries(context.system.ability)) {
      v.label = game.i18n.localize(CONFIG.ASTER.ability[k]) ?? k;
    }
    for (const [k, v] of Object.entries(context.system.aster)) {
      v.label = game.i18n.localize(CONFIG.ASTER.aster[k]) ?? k;
    }
    context.rollModeNormal = context.system.rollMode === "normal";
    context.rollModeVs = context.system.rollMode === "vs";
  }

  _prepareInventory(context) {
    const bag = this.actor.items.find((i) => i.type === "bag") ?? null;
    const food = this.actor.items.find((i) => i.type === "food") ?? null;

    const inBag = bag
      ? this.actor.items.filter(
          (i) => ["consumable", "equipment"].includes(i.type) && i.system.container === bag.id,
        )
      : [];

    const inStorage = this.actor.items.filter(
      (i) => ["consumable", "equipment"].includes(i.type) && !i.system.container,
    );

    const storageLimit = this.actor.system.storage?.limit ?? 0;

    const bagGrid = bag?.system.grid ?? { cols: 6, rows: 4 };
    const cells = bag
      ? Array.from({ length: bagGrid.cols * bagGrid.rows }, (_, i) => ({
          index: i,
          x: i % bagGrid.cols,
          y: Math.floor(i / bagGrid.cols),
          light: (Math.floor(i / bagGrid.cols) + (i % bagGrid.cols)) % 2 === 0,
        }))
      : [];

    const inBagLabel = game.i18n.localize("ASTER.inventory.inBag");
    const inStorageLabel = game.i18n.localize("ASTER.inventory.inStorage");

    // 장비 슬롯 — container 예약값(equip-1/equip-2)에 해당 equipment 매핑 (I1c, 룰북 269 2칸).
    const equipSlots = EQUIP_SLOT_CONTAINERS.map((slotId) => {
      const it = this.actor.items.find(
        (i) => i.type === "equipment" && i.system.container === slotId,
      );
      return {
        slotId,
        item: it ? { id: it.id, name: it.name, img: it.img } : null,
      };
    });

    context.inv = {
      equipSlots,
      bag: bag
        ? {
            id: bag.id,
            name: bag.name,
            grid: bagGrid,
            cells,
            items: inBag.map((i) => ({
              id: i.id,
              name: i.name,
              img: i.img,
              w: i.system.size?.w ?? 1,
              h: i.system.size?.h ?? 1,
              x: i.system.grid?.x ?? 0,
              y: i.system.grid?.y ?? 0,
            })),
          }
        : null,
      food: food ? { id: food.id, name: food.name, img: food.img } : null,
      storage: {
        count: inStorage.length,
        limit: storageLimit,
        over: inStorage.length > storageLimit,
      },
      allItems: [
        ...inBag.map((i) => ({
          id: i.id,
          name: i.name,
          img: i.img,
          location: "bag",
          locationLabel: inBagLabel,
          canUse: AsterActorSheet.#consumableHasHeal(i),
          summary: AsterActorSheet.#inventorySummary(i),
          isEquipment: i.type === "equipment",
          isMagicToolInactive: AsterActorSheet.#isMagicToolInactive(i),
        })),
        ...inStorage.map((i) => ({
          id: i.id,
          name: i.name,
          img: i.img,
          location: "storage",
          locationLabel: inStorageLabel,
          canUse: AsterActorSheet.#consumableHasHeal(i),
          summary: AsterActorSheet.#inventorySummary(i),
          isEquipment: i.type === "equipment",
          isMagicToolInactive: AsterActorSheet.#isMagicToolInactive(i),
        })),
      ],
    };
  }

  _prepareCraft(context) {
    const acquired = this.actor.system.craft?.acquired ?? {};
    const craftLocked = this.actor.system.craft?.locked ?? false;
    const resources = {
      material: this.actor.system.material ?? 0,
      aster: {
        red: this.actor.system.aster?.red?.value ?? 0,
        blue: this.actor.system.aster?.blue?.value ?? 0,
        green: this.actor.system.aster?.green?.value ?? 0,
        yellow: this.actor.system.aster?.yellow?.value ?? 0,
        white: this.actor.system.aster?.white?.value ?? 0,
      },
    };

    // 선행 깊이 계산 (depth 0 = 선행 없음, col = depth + 1)
    const nodeMap = Object.fromEntries(CRAFT_TREE.nodes.map((n) => [n.id, n]));
    const depthCache = {};
    const nodeDepth = (id) => {
      if (depthCache[id] !== undefined) return depthCache[id];
      const n = nodeMap[id];
      if (!n || n.requires.length === 0) return (depthCache[id] = 0);
      return (depthCache[id] = Math.max(...n.requires.map(nodeDepth)) + 1);
    };

    // 카테고리별로 label 기준 체인 그룹화 + col 계산
    const byCat = {};
    const chainMap = {};
    const chainOrder = {};
    for (const cat of CRAFT_TREE.categories) {
      byCat[cat.id] = {
        ...cat,
        chains: [],
        nodes: [],
        colCount: 1,
        isFamiliar: cat.id === "familiar",
      };
      chainMap[cat.id] = {};
      chainOrder[cat.id] = [];
    }

    for (const node of CRAFT_TREE.nodes) {
      const isAcquired = acquired[node.id] === true;
      const unlocked = prereqMet(node.id, acquired);
      const isLocked = !unlocked && !isAcquired;
      const col = nodeDepth(node.id) + 1;
      const displayNode = {
        ...node,
        acquired: isAcquired,
        unlocked,
        locked: isLocked,
        // 선행 미충족(isLocked)이거나 탭이 잠긴 경우 체크박스를 비활성화한다.
        disabledAttr: isLocked || craftLocked ? "disabled" : "",
        costLabel: _formatCraftCost(node.cost),
        col,
      };
      if (col > byCat[node.category].colCount) byCat[node.category].colCount = col;
      byCat[node.category].nodes.push(displayNode);
      if (!chainMap[node.category][node.label]) {
        chainMap[node.category][node.label] = [];
        chainOrder[node.category].push(node.label);
      }
      chainMap[node.category][node.label].push(displayNode);
    }

    for (const cat of CRAFT_TREE.categories) {
      byCat[cat.id].chains = chainOrder[cat.id].map((lbl) => chainMap[cat.id][lbl]);
    }

    const cost = sumCost(acquired);

    const asterColors = ["red", "blue", "green", "yellow", "white"];
    const asterHaveTotal = asterColors.reduce((s, c) => s + (resources.aster[c] ?? 0), 0);
    const asterUsedTotal =
      cost.aster.red + cost.aster.blue + cost.aster.green + cost.aster.yellow + cost.anyAster;

    const summaryColumns = [
      ...asterColors.map((c) => ({
        key: c,
        labelKey: `ASTER.aster.${c}`,
        have: resources.aster[c] ?? 0,
        used: cost.aster[c],
        haveEmpty: false,
        usedEmpty: false,
        editable: true,
        inputName: `system.aster.${c}.value`,
      })),
      {
        key: "material",
        label: "마테리얼",
        have: resources.material ?? 0,
        used: cost.material,
        haveEmpty: false,
        usedEmpty: false,
        editable: true,
        inputName: "system.material",
      },
      {
        key: "any",
        label: "임의",
        have: null,
        used: cost.anyAster,
        haveEmpty: true,
        usedEmpty: false,
        editable: false,
      },
      {
        key: "self",
        label: "자속성",
        have: null,
        used: null,
        haveEmpty: true,
        usedEmpty: true,
        editable: false,
      },
      {
        key: "total",
        label: "총합",
        have: asterHaveTotal,
        used: asterUsedTotal,
        haveEmpty: false,
        usedEmpty: false,
        editable: false,
      },
    ];

    context.craft = {
      categories: CRAFT_TREE.categories.map((c) => byCat[c.id]),
      cost,
      resources,
      summaryColumns,
      locked: craftLocked,
      lockIcon: craftLocked ? "fa-lock" : "fa-lock-open",
      lockTitle: craftLocked ? "ASTER.craft.unlock" : "ASTER.craft.lock",
    };
  }

  #craftWarn(reasons, dependents) {
    const map = {
      PREREQ: "ASTER.craft.warn.PREREQ",
      MATERIAL_SHORT: "ASTER.craft.warn.MATERIAL_SHORT",
      ASTER_TOTAL_SHORT: "ASTER.craft.warn.ASTER_SHORT",
      ASTER_RED_SHORT: "ASTER.craft.warn.ASTER_SHORT",
      ASTER_BLUE_SHORT: "ASTER.craft.warn.ASTER_SHORT",
      ASTER_GREEN_SHORT: "ASTER.craft.warn.ASTER_SHORT",
      ASTER_YELLOW_SHORT: "ASTER.craft.warn.ASTER_SHORT",
      HAS_DEPENDENTS: "ASTER.craft.warn.HAS_DEPENDENTS",
      ALREADY: "ASTER.craft.warn.ALREADY",
      FAMILIAR_ONE: "ASTER.craft.warn.FAMILIAR_ONE",
    };
    const key = map[reasons[0]] ?? "ASTER.craft.warn.GENERIC";
    let msg = game.i18n.localize(key);
    if (reasons[0] === "HAS_DEPENDENTS" && dependents?.length) {
      msg += " (" + dependents.join(", ") + ")";
    }
    ui.notifications.warn(msg);
  }

  _prepareItems(context) {
    const features = [];
    for (const i of context.items) {
      i.img = i.img || CONST.DEFAULT_TOKEN;
      if (i.type === "feature") features.push(i);
    }
    context.features = features;
  }

  _prepareSpellList(context) {
    const spells = this.actor.items.filter((i) => i.type === "spell");
    context.spells = spells.map((s) => ({
      id: s.id,
      name: s.name,
      img: s.img,
      color: s.system.color,
      ability: s.system.ability,
      target: s.system.target,
      formula: this.#formatFormula(s), // "녹+박식(12)"
    }));
  }

  #formatFormula(spell) {
    const c = spell.system.color ? game.i18n.localize(`ASTER.aster.${spell.system.color}`) : "?";
    const a = spell.system.ability
      ? game.i18n.localize(`ASTER.ability.${spell.system.ability}`)
      : "?";
    return `${c}+${a}(${spell.system.target ?? "?"})`;
  }

  _prepareRecord(context) {
    // 상단 고정 배경 (born/past/purpose)
    context.features = this.actor.system.features;

    // 세션 기록 카드 (record 아이템) — 책 넘기기
    const records = this.actor.items.filter((i) => i.type === "record");
    context.records = records.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.system.city,
      alert: r.system.alert,
      felka: r.system.felka,
      scenarioCount: r.system.scenarioCount,
      favor: r.system.favor,
      scenes: r.system.scenes,
      people: r.system.people,
      memo: r.system.memo,
      updatedAt: r.system.updatedAt,
    }));
    context.recordCount = records.length;
    // _recordIndex는 현재 페이지(비영속 인스턴스 상태)
    context.currentIndex = Math.min(this._recordIndex ?? 0, Math.max(0, records.length - 1));
    context.currentRecord = context.records[context.currentIndex] ?? null;
    context.currentPage = records.length ? context.currentIndex + 1 : 0;
    // disabled 속성은 미리 계산(템플릿 태그 속성에 블록 헬퍼 사용 불가)
    context.recordPrevDisabled = context.currentIndex <= 0 ? "disabled" : "";
    context.recordNextDisabled = context.currentIndex >= records.length - 1 ? "disabled" : "";
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // 탭 초기 상태 적용 (data-action="tab" 클릭은 ApplicationV2가 자동 처리).
    // NPC 시트는 탭 없는 flat 폼이라 매칭 요소가 없다 — changeTab은 요소 부재 시 throw하므로
    // 해당 탭 네비가 실제로 렌더된 경우에만 호출한다.
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      if (this.element.querySelector(`[data-group="${group}"][data-tab="${tab}"]`)) {
        this.changeTab(tab, group, { force: true });
      }
    }

    // craft 탭 자원 input은 메인 탭과 같은 필드(system.aster.*, system.material)를 가리킨다.
    // 폼 name으로 두면 한 form 안에 같은 name이 둘이 되어 제출 시 값이 배열로 묶여 검증 오류가 난다.
    // 따라서 name 없이 직접 update로 처리한다.
    for (const input of this.element.querySelectorAll(".craft-res-input")) {
      input.addEventListener("change", (ev) => {
        const field = ev.currentTarget.dataset.field;
        if (!field) return;
        const value = Number(ev.currentTarget.value);
        this.actor.update({ [field]: Number.isFinite(value) ? value : 0 });
      });
    }
  }

  #cellToXY(cellIndex, grid) {
    return { x: cellIndex % grid.cols, y: Math.floor(cellIndex / grid.cols) };
  }

  #clampStart(x, y, size, grid) {
    const w = size?.w ?? 1;
    const h = size?.h ?? 1;
    return {
      x: Math.max(0, Math.min(x, grid.cols - w)),
      y: Math.max(0, Math.min(y, grid.rows - h)),
    };
  }

  async #promptItemChoice(candidates) {
    const options = candidates
      .map(
        (i) =>
          `<option value="${i.id}">${i.name} (${i.system.size?.w ?? 1}×${i.system.size?.h ?? 1})</option>`,
      )
      .join("");
    const content = `<select name="choice" style="width:100%">${options}</select>`;
    return foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.inventory.choose") },
      content,
      ok: {
        label: game.i18n.localize("ASTER.inventory.place"),
        callback: (_event, button) => button.form.elements.choice.value,
      },
    }).catch(() => null);
  }

  static async #onCellClick(_event, target) {
    const bag = this.actor.items.find((i) => i.type === "bag");
    if (!bag) return;
    const grid = bag.system.grid;
    const cellIndex = Number(target.dataset.cellIndex);
    const { x, y } = this.#cellToXY(cellIndex, grid);

    const candidates = this.actor.items.filter(
      (i) => ["consumable", "equipment"].includes(i.type) && !i.system.container,
    );
    if (!candidates.length) {
      ui.notifications.info(game.i18n.localize("ASTER.inventory.noCandidate"));
      return;
    }

    const choiceId = await this.#promptItemChoice(candidates);
    if (!choiceId) return;
    const item = this.actor.items.get(choiceId);

    const start = this.#clampStart(x, y, item.system.size, grid);

    const itemsInBag = this.actor.items
      .filter((i) => i.system.container === bag.id && ["consumable", "equipment"].includes(i.type))
      .map((i) => ({ size: i.system.size }));
    const cap = checkBagCapacity({
      newItemSize: item.system.size,
      itemsInBag,
      grid,
    });
    if (!cap.ok) {
      const msg = cap.reasons.map((r) => game.i18n.localize(`ASTER.inventory.warn.${r}`)).join(" ");
      ui.notifications.warn(msg);
    }

    await item.update({ "system.container": bag.id, "system.grid": start });
  }

  static async #onItemUnplace(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;

    const currentCount = this.actor.items.filter(
      (i) => ["consumable", "equipment"].includes(i.type) && !i.system.container,
    ).length;
    const limit = this.actor.system.storage?.limit ?? 0;
    const { allowed } = checkStorageAdd({ currentCount, limit });
    if (!allowed) {
      ui.notifications.warn(game.i18n.localize("ASTER.inventory.warn.STORAGE_FULL"));
      return;
    }
    await item.update({ "system.container": "", "system.grid": { x: 0, y: 0 } });
  }

  static async #onFoodSelect(_event, _target) {
    // food 선택 로직: STEP5에서 확장
  }

  /**
   * 피크닉. 탐색 페이즈에서만 가능 (룰북 502).
   * GM 수락 단계 없이 본인 포만을 즉시 회복하고, PC 화자로 결과 카드를 출력한다.
   */
  static async #onPicnicDeclare(_event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item || item.type !== "food") return;

    // 페이즈 체크 — 탐색 페이즈에서만 가능
    const phase = game.settings.get("aster", "currentPhase");
    if (phase !== "exploration") {
      ui.notifications.warn(game.i18n.localize("ASTER.food.warn.notExploration"));
      return;
    }

    // 포만 회복 (현재값 + restore, max 클램프) — 자동 적용
    const restore = item.system.restore ?? 0;
    const cur = this.actor.system.satiety?.value ?? 0;
    const max = this.actor.system.satiety?.max ?? 20;
    const next = Math.min(max, cur + restore);
    await this.actor.update({ "system.satiety.value": next });

    const bonusEffect = item.system.bonusEffect ?? "";
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/aster/templates/chat/picnic-card.html",
      {
        actorName: this.actor.name,
        itemName: item.name,
        itemImg: item.img,
        restore,
        satietyBefore: cur,
        satietyAfter: next,
        bonusEffect,
        hasBonus: !!bonusEffect.trim(),
      },
    );

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    });
  }

  /**
   * 전투 액션 클릭 처리 (G3-α).
   * 단순 액션은 즉시 AP 차감 + 채팅, 입력 필요 액션은 다이얼로그.
   * 이번 STEP은 AP 차감 + 채팅 안내만 — 다음 라운드 효과·대미지는 텍스트로 수동 추적.
   */
  static async #onRollDodge(_event, _target) {
    await this.actor.rollDodge();
  }

  /** 명중 굴림 (N6, NPC 전용). Actor.rollHit이 PC 호출 시 경고 처리. */
  static async #onRollHit(_event, _target) {
    await this.actor.rollHit();
  }

  static async #onCombatAction(_event, target) {
    const actionKey = target.dataset.actionKey;
    const combat = game.combat;
    if (!combat?.started) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.notInCombat"));
      return;
    }
    const combatant = combat.combatants.find((c) => c.actor?.id === this.actor.id);
    if (!combatant) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.noCombatantForActor"));
      return;
    }

    // 라운드 사용 카운터 — defend/charge는 룰북 1라운드 1회 제한.
    // AP 검사·다이얼로그보다 앞서 차단해야 자원·UX 낭비가 없다.
    const usage = combatant.getFlag("aster", "actionsThisRound") ?? {};
    if ((actionKey === "defend" || actionKey === "charge") && (usage[actionKey] ?? 0) >= 1) {
      ui.notifications.warn(
        game.i18n.format("ASTER.combat.actionUsedThisRound", {
          action: game.i18n.localize(`ASTER.combat.action.${actionKey}`),
        }),
      );
      return;
    }

    const currentAP = combatant.getFlag("aster", "actionPoint") ?? 0;
    let cost;
    let chatExtra;
    let throwTarget = null; // 돌던지기 대상 토큰 (대미지 적용 flag용)
    let chargeChoice = null; // 차지 선택("ap" | "unison") — G3-γ 회수 대상
    let dashX = 0; // 대쉬 입력값 — AE duration.rounds: 1로 다음 라운드 끝까지 system.speed +X

    switch (actionKey) {
      case "throw": {
        // 캔버스 사전 타게팅 — 적 1체만 허용. 시전자가 PC면 적은 NPC, NPC면 적은 PC(N3).
        // 검증 실패 시 자원 소비 없이 종료.
        const enemyType = this.actor.type === "npc" ? "character" : "npc";
        const targets = getTargetedTokens({ required: true, max: 1, allowedTypes: enemyType });
        if (!targets) return;
        throwTarget = targets[0];
        cost = 1;
        chatExtra = game.i18n.format("ASTER.combat.throwEffect", { target: throwTarget.name });
        break;
      }
      case "defend":
        cost = 2;
        chatExtra = game.i18n.localize("ASTER.combat.defendEffect");
        break;
      case "focus":
        cost = 3;
        chatExtra = game.i18n.localize("ASTER.combat.focusEffect");
        break;
      case "dash": {
        const x = await foundry.applications.api.DialogV2.prompt({
          window: { title: game.i18n.localize("ASTER.combat.action.dashTitle") },
          content: `<div class="form-group">
            <label>${game.i18n.localize("ASTER.combat.dashValueLabel")}</label>
            <input type="number" name="x" value="1" min="1" />
          </div>`,
          ok: { callback: (_e, b) => Number(b.form.elements.x.value) || 0 },
        }).catch(() => null);
        if (x === null || x <= 0) return;
        cost = x;
        dashX = x;
        chatExtra = game.i18n.format("ASTER.combat.dashEffect", { x });
        break;
      }
      case "charge": {
        chargeChoice = await foundry.applications.api.DialogV2.prompt({
          window: { title: game.i18n.localize("ASTER.combat.action.chargeTitle") },
          content: `<div class="form-group">
            <label>${game.i18n.localize("ASTER.combat.chargeChooseLabel")}</label>
            <select name="sub">
              <option value="ap">${game.i18n.localize("ASTER.combat.chargeSubAP")}</option>
              <option value="unison">${game.i18n.localize("ASTER.combat.chargeSubUnison")}</option>
            </select>
          </div>`,
          ok: { callback: (_e, b) => b.form.elements.sub.value },
        }).catch(() => null);
        if (!chargeChoice) return;
        cost = 3;
        chatExtra =
          chargeChoice === "ap"
            ? game.i18n.localize("ASTER.combat.chargeEffectAP")
            : game.i18n.localize("ASTER.combat.chargeEffectUnison");
        break;
      }
      case "unisonPrepare":
        cost = 1;
        chatExtra = game.i18n.localize("ASTER.combat.unisonPrepareEffect");
        break;
      default:
        return;
    }

    // AP 부족 검사 (다이얼로그 입력 후 — 대쉬는 X가 보유 AP를 넘을 수 있음)
    if (currentAP < cost) {
      ui.notifications.warn(
        game.i18n.format("ASTER.combat.notEnoughAP", { need: cost, have: currentAP }),
      );
      return;
    }

    await combatant.setFlag("aster", "actionPoint", currentAP - cost);

    // 액션별 후속 flag·효과.
    // - defend: 라운드 카운터 +1, defendActive 켜 다음 대미지 적용 시 자동 차감.
    // - charge: 라운드 카운터 +1, 선택 보존(G3-γ가 다음 라운드 시작 시 회수).
    // - focus: focusActive 켜 다음 한 번의 판정에 다이스 +1 (적용 후 자동 해제).
    // - dash: 1라운드 만료 AE로 system.speed +X — Foundry duration이 자동 만료 처리.
    // - unisonPrepare: 합체기 준비(G4에서 활용).
    if (actionKey === "defend") {
      await combatant.setFlag("aster", "actionsThisRound", {
        ...usage,
        defend: (usage.defend ?? 0) + 1,
      });
      await combatant.setFlag("aster", "defendActive", true);
    } else if (actionKey === "charge") {
      await combatant.setFlag("aster", "actionsThisRound", {
        ...usage,
        charge: (usage.charge ?? 0) + 1,
      });
      await combatant.setFlag("aster", "chargeNextRound", chargeChoice);
    } else if (actionKey === "focus") {
      await combatant.setFlag("aster", "focusActive", true);
    } else if (actionKey === "dash") {
      await this.actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: game.i18n.localize("ASTER.combat.action.dash"),
          img: "icons/svg/lightning.svg",
          changes: [
            {
              key: "system.speed",
              mode: CONST.ACTIVE_EFFECT_MODES.ADD,
              value: dashX,
              priority: 20,
            },
          ],
          // combat 매개는 Foundry 라운드 기반 만료 흐름에 필요(없으면 자동 만료 안 됨).
          duration: { rounds: 1, startRound: combat.round, combat: combat.id },
          flags: { aster: { sourceAction: "dash" } },
        },
      ]);
    } else if (actionKey === "unisonPrepare") {
      await combatant.setFlag("aster", "unisonReady", true);
    }

    const actionName = game.i18n.localize(`ASTER.combat.action.${actionKey}`);

    // 액션별 flag — 돌던지기는 대미지 적용 정보 포함 (1대미지 자동 추출).
    const actionFlag = { type: actionKey };
    if (actionKey === "throw" && throwTarget) {
      // orphan 토큰이면 targetActorId가 null — 버튼 미노출(대미지 적용 불가).
      actionFlag.sourceActorId = this.actor.id;
      actionFlag.targetActorId = throwTarget.actor?.id ?? null;
      actionFlag.targetName = throwTarget.name;
      actionFlag.defaultDamage = 1;
      actionFlag.damageApplied = false;
    }

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/aster/templates/chat/combat-action.html",
      {
        actionName,
        apSpent: game.i18n.format("ASTER.combat.apSpent", { n: cost }),
        chatExtra,
        hasDamageButton: !!actionFlag.targetActorId,
      },
    );

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flags: { aster: { combatAction: actionFlag } },
    });
  }

  /**
   * NPC 스킬(npcAction) 시전 (N3).
   * 흐름: oncePerRound 검사 → 타게팅·X 입력(하이브리드 다이얼로그) → AP 검사 → AP 차감 →
   *       oncePerRound flag 설정 → 효과 적용(damageFormula·addStatus·cureStatus·cureAllStatus) → 시전 카드.
   * AP 진리 원천은 Combatant flag(옵션 A — PC `#onCombatAction`과 통일). `system.ap`은 시트 표시·시드 참고용.
   *
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  `data-item-id`를 가진 시전 버튼
   */
  static async #onNpcActionUse(_event, target) {
    const itemId = target.dataset.itemId;
    const action = this.actor.items.get(itemId);
    if (!action || action.type !== "npcAction") return;

    const sys = action.system;
    const combat = game.combat;
    if (!combat?.started) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.notInCombat"));
      return;
    }
    const combatant = combat.combatants.find((c) => c.actor?.id === this.actor.id);
    if (!combatant) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.noCombatantForActor"));
      return;
    }

    // oncePerRound 검사 — 같은 액션을 이 라운드에 이미 썼는지. AP·다이얼로그보다 앞서 차단(자원·UX 보호).
    const usage = combatant.getFlag("aster", "actionsThisRound") ?? {};
    const usageKey = `npcAction-${itemId}`;
    if (sys.oncePerRound && usage[usageKey]) {
      ui.notifications.warn(
        game.i18n.format("ASTER.npcAction.alreadyUsedThisRound", { name: action.name }),
      );
      return;
    }

    // 1. 하이브리드 다이얼로그 — costVariable 또는 self 이외 대상일 때만.
    let cost = sys.cost;
    let targets = [this.actor]; // self 기본
    const needsDialog = sys.costVariable || sys.targetType !== "self";

    if (needsDialog) {
      // costVariable=true면 X(AP) 입력.
      if (sys.costVariable) {
        const x = await foundry.applications.api.DialogV2.prompt({
          window: {
            title: game.i18n.format("ASTER.npcAction.xInputTitle", { name: action.name }),
          },
          content: `<div class="form-group">
            <label>${game.i18n.localize("ASTER.npcAction.xInputLabel")}</label>
            <input type="number" name="x" value="1" min="1" />
          </div>`,
          ok: { callback: (_e, b) => Number(b.form.elements.x.value) || 0 },
        }).catch(() => null);
        if (x === null || x <= 0) return;
        cost = x;
      }

      // 대상 — NPC가 시전하므로 적은 PC(character). all은 PC 전체.
      if (sys.targetType === "one") {
        const t = getTargetedTokens({ required: true, max: 1, allowedTypes: "character" });
        if (!t) return;
        targets = t.map((tok) => tok.actor).filter(Boolean);
      } else if (sys.targetType === "many") {
        const t = getTargetedTokens({ required: true, max: Infinity, allowedTypes: "character" });
        if (!t) return;
        targets = t.map((tok) => tok.actor).filter(Boolean);
      } else if (sys.targetType === "all") {
        targets = game.actors.filter((a) => a.type === "character");
      }
    }

    // 2. AP 검사 (다이얼로그 입력 후 — costVariable의 X가 보유 AP를 넘을 수 있음).
    const currentAP = combatant.getFlag("aster", "actionPoint") ?? 0;
    if (currentAP < cost) {
      ui.notifications.warn(
        game.i18n.format("ASTER.combat.notEnoughAP", { need: cost, have: currentAP }),
      );
      return;
    }

    // 3. AP 차감
    await combatant.setFlag("aster", "actionPoint", currentAP - cost);

    // 4. oncePerRound flag — `npcAction-{itemId}` 키. PC defend·charge 키와 충돌 없음.
    if (sys.oncePerRound) {
      await combatant.setFlag("aster", "actionsThisRound", { ...usage, [usageKey]: true });
    }

    // N6 — 공격 액션(damageFormula 있음 + targetType !== "self") 시 hit 굴림 통합.
    // hit vs dodge 자동 대결 비교는 영역 외 — GM이 시전 카드의 hit 결과를 PC dodge와 수동 비교.
    let hitResult = null;
    if (sys.damageFormula && sys.targetType !== "self") {
      const hitFormula = this.actor.system.hitFormula?.trim();
      if (hitFormula) {
        // 집중 효과 — combatant의 focusActive flag(checkFocusEffect와 동일 의미). 사용 시 만료.
        const focusActive = combatant.getFlag("aster", "focusActive") === true;
        const fullHitFormula = focusActive ? `${hitFormula} + 1d6` : hitFormula;
        try {
          const hitRoll = new Roll(fullHitFormula);
          await hitRoll.evaluate();
          const hitDice = hitRoll.dice.flatMap((d) => d.values);
          const hitCf = detectCritFumble(hitDice);
          hitResult = {
            formula: hitFormula,
            total: hitRoll.total,
            diceText: hitDice.join(", "),
            isCritical: hitCf.critical,
            isFumble: hitCf.fumble,
          };
          if (focusActive) await combatant.setFlag("aster", "focusActive", false);
        } catch (e) {
          console.warn(
            `[Aster] NPC ${this.actor.name} hitFormula 평가 실패(시전 통합): "${hitFormula}"`,
            e,
          );
          // 시전 자체는 계속 — hit 결과 미표시.
        }
      }
    }

    // 5. 효과 적용
    const effectResults = [];

    // 5-a. damageFormula 또는 addStatus — damageFormula 없고 addStatus만 있으면 amount=0(상태이상만).
    let damageTotal = 0;
    if (sys.damageFormula || sys.addStatus.length > 0) {
      if (sys.damageFormula) {
        const roll = new Roll(sys.damageFormula);
        await roll.evaluate();
        damageTotal = roll.total;
      }
      for (const t of targets) {
        const result = await applyDamageAndStatus(t, damageTotal, sys.addStatus);
        effectResults.push({ targetName: t.name, type: "damage", amount: damageTotal, ...result });
      }
    }

    // 5-b. cureAllStatus 우선, 없으면 cureStatus 배열 루프.
    if (sys.cureAllStatus) {
      const cured = await applyCureAllStatus(targets);
      for (const r of cured) {
        effectResults.push({ targetName: r.actorName, type: "cureAll", curedKeys: r.curedKeys });
      }
    } else if (sys.cureStatus.length > 0) {
      for (const statusKey of sys.cureStatus) {
        const cured = await applyCureStatus(targets, statusKey);
        for (const r of cured) {
          effectResults.push({ targetName: r.actorName, type: "cure", statusKey, cured: r.cured });
        }
      }
    }

    // 6. 시전 카드 (hitResult 포함 — 공격 액션이면 hit 굴림 결과 표시)
    await this.#renderNpcActionCard(action, cost, damageTotal, effectResults, hitResult);
  }

  /**
   * NPC 시전 채팅 카드 렌더. npcAction의 부분 구조화 효과(대미지·상태이상·회복)를 대상별로 표시.
   * 상태이상 키는 badstatus i18n 매핑(bigInj→biginj)으로 지역화해 전달한다.
   *
   * @param {Item} action
   * @param {number} cost  실제 소비 AP
   * @param {number} damageTotal  대미지 굴림 합(없으면 0)
   * @param {Array<object>} effectResults
   * @param {{formula:string,total:number,diceText:string,isCritical:boolean,isFumble:boolean}|null} [hitResult]
   *   공격 액션 hit 굴림 결과(없으면 null — 카드에 hit 영역 미표시).
   */
  async #renderNpcActionCard(action, cost, damageTotal, effectResults, hitResult = null) {
    const sys = action.system;
    const statusLabel = (key) =>
      game.i18n.localize(`ASTER.badstatus.${key === "bigInj" ? "biginj" : key}`);

    const damageResults = effectResults
      .filter((r) => r.type === "damage")
      .map((r) => ({
        targetName: r.targetName,
        hBefore: r.hBefore,
        hAfter: r.hAfter,
        statusApplied: (r.statusApplied ?? []).map(statusLabel),
      }));

    const cureResults = effectResults
      .filter((r) => r.type === "cure" || r.type === "cureAll")
      .map((r) => ({
        targetName: r.targetName,
        curedKeys: r.curedKeys ? r.curedKeys.map(statusLabel) : null,
        statusLabel: r.statusKey ? statusLabel(r.statusKey) : null,
        cured: r.cured,
      }));

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/aster/templates/chat/npc-action-card.html",
      {
        actorName: this.actor.name,
        actionName: action.name,
        apSpent: game.i18n.format("ASTER.combat.apSpent", { n: cost }),
        effect: sys.effect,
        damageFormula: sys.damageFormula,
        damageTotal,
        damageResults,
        cureResults,
        hitResult,
      },
    );

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flags: { aster: { npcAction: { actorId: this.actor.id, actionId: action.id } } },
    });
  }

  /**
   * 합체기 발동(G4, 룰북 615~630). PL이 자기 시트에서 시작 → 페어 → 주속성 → 다이스 → 부속성 자동.
   * 주속성 효과 표는 GM 수동(시스템은 합산값만 안내). 같은 색 페어는 부속성 결정 불가로 차단.
   * 흐름 중 취소 시 flag 변화 없음. 부속성 다이얼로그 취소 시 효과만 미적용(합체기 자체는 완료).
   */
  static async #onUnisonAttack(_event, _target) {
    const combat = game.combat;
    if (!combat?.started) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.notInCombat"));
      return;
    }
    const selfCombatant = combat.combatants.find((c) => c.actor?.id === this.actor.id);
    if (!selfCombatant) return;

    // 시트 disabled 분기를 우회한 직접 호출 방어.
    if (selfCombatant.getFlag("aster", "unisonReady") !== true) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonNotReady"));
      return;
    }

    const candidates = combat.combatants.filter(
      (c) =>
        c.id !== selfCombatant.id &&
        c.actor?.type === "character" &&
        c.getFlag("aster", "unisonReady") === true,
    );
    if (candidates.length === 0) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonNoPair"));
      return;
    }

    const pairOptions = candidates
      .map((c) => `<option value="${c.actor.id}">${c.actor.name}</option>`)
      .join("");
    const pairId = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.combat.unisonPairTitle") },
      content: `<div class="form-group">
        <label>${game.i18n.localize("ASTER.combat.unisonPairLabel")}</label>
        <select name="pair">${pairOptions}</select>
      </div>`,
      ok: { callback: (_e, b) => b.form.elements.pair.value },
    }).catch(() => null);
    if (!pairId) return;
    const pairActor = game.actors.get(pairId);
    const pairCombatant = combat.combatants.find((c) => c.actor?.id === pairId);
    if (!pairActor || !pairCombatant) return;

    const selfColor = this.actor.system.color;
    const pairColor = pairActor.system.color;
    if (!selfColor || !pairColor) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonNoColor"));
      return;
    }
    if (selfColor === pairColor) {
      ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonSameColor"));
      return;
    }

    const colorLabel = (k) => game.i18n.localize(`ASTER.aster.${k}`);
    const mainColor = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.combat.unisonMainColorTitle") },
      content: `<div class="form-group">
        <label>${game.i18n.localize("ASTER.combat.unisonMainColorLabel")}</label>
        <select name="main">
          <option value="${selfColor}">${this.actor.name} — ${colorLabel(selfColor)}</option>
          <option value="${pairColor}">${pairActor.name} — ${colorLabel(pairColor)}</option>
        </select>
      </div>`,
      ok: { callback: (_e, b) => b.form.elements.main.value },
    }).catch(() => null);
    if (!mainColor) return;
    const subColor = mainColor === selfColor ? pairColor : selfColor;

    await this._proceedUnisonDice({
      selfCombatant,
      pairCombatant,
      selfActor: this.actor,
      pairActor,
      mainColor,
      subColor,
    });
  }

  /**
   * 합체기 다이스 굴림 + 차지(unison) 처리. 각 PC가 1d6, 차지 보유 PC는 추가 1d6 후 1개 선택.
   * pickDiceDialog 취소 시 흐름 종료(unisonReady 유지). 완료 시 양쪽 unisonReady → false.
   */
  async _proceedUnisonDice({
    selfCombatant,
    pairCombatant,
    selfActor,
    pairActor,
    mainColor,
    subColor,
  }) {
    const selfRoll = new Roll("1d6");
    await selfRoll.evaluate();
    const pairRoll = new Roll("1d6");
    await pairRoll.evaluate();

    const selfCharge = selfCombatant.getFlag("aster", "chargeNextRound") === "unison";
    const pairCharge = pairCombatant.getFlag("aster", "chargeNextRound") === "unison";

    let selfFinal = selfRoll.total;
    let pairFinal = pairRoll.total;
    const extraInfo = []; // 채팅 카드용 — 차지 추가 다이스 표시

    if (selfCharge) {
      const extraRoll = new Roll("1d6");
      await extraRoll.evaluate();
      const picked = await pickDiceDialog({
        dice: [selfRoll.total, extraRoll.total],
        count: 1,
        title: game.i18n.format("ASTER.combat.unisonChargePickTitle", { actor: selfActor.name }),
      });
      if (!picked) return;
      selfFinal = picked.selected[0];
      extraInfo.push({
        actor: selfActor.name,
        original: selfRoll.total,
        extra: extraRoll.total,
        picked: selfFinal,
      });
      await selfCombatant.setFlag("aster", "chargeNextRound", null);
    }
    if (pairCharge) {
      const extraRoll = new Roll("1d6");
      await extraRoll.evaluate();
      const picked = await pickDiceDialog({
        dice: [pairRoll.total, extraRoll.total],
        count: 1,
        title: game.i18n.format("ASTER.combat.unisonChargePickTitle", { actor: pairActor.name }),
      });
      if (!picked) return;
      pairFinal = picked.selected[0];
      extraInfo.push({
        actor: pairActor.name,
        original: pairRoll.total,
        extra: extraRoll.total,
        picked: pairFinal,
      });
      await pairCombatant.setFlag("aster", "chargeNextRound", null);
    }

    const total = selfFinal + pairFinal;

    // 주속성 효과 자동 적용 — 부속성 다이얼로그 *전*이라 부속성 취소해도 주속성은 적용 보존.
    const mainResult = await this._applyUnisonMainEffect({ mainColor, total });

    await this._applyUnisonSubEffect({
      selfActor,
      pairActor,
      mainColor,
      subColor,
      selfFinal,
      pairFinal,
      total,
      extraInfo,
      mainResult,
    });

    // 양쪽 unisonReady 해제 — 부속성 다이얼로그 취소와 무관하게 합체기 사용은 완료.
    await selfCombatant.setFlag("aster", "unisonReady", false);
    await pairCombatant.setFlag("aster", "unisonReady", false);
  }

  /**
   * 주속성 표 효과 자동 적용.
   * lookup 결과 null이면 자동 적용 안 함 (GM 수동 처리 — 카드에 안내).
   *
   * @returns {Promise<object|null>}  적용 결과 (mainResult) 또는 null (자동 처리 안 함)
   */
  async _applyUnisonMainEffect({ mainColor, total }) {
    const effect = lookupUnisonEffect(mainColor, total);
    // RollTable 플레이버 텍스트 — effect null(합산 3·4 실패)이어도 조회 가능.
    const description = getUnisonDescription(mainColor, total);

    if (!effect) {
      // 효과 자동 적용은 없지만 플레이버 텍스트만 있는 경우 (실패 등).
      return description ? { type: "description-only", description } : null;
    }

    switch (effect.type) {
      case "damage": {
        if (effect.targetType === "enemy-single") {
          // 적표 — 캔버스 타겟 1체 필수
          const targets = getTargetedTokens({
            required: true,
            max: 1,
            allowedTypes: "npc",
          });
          if (!targets) return null; // 검증 실패 — 자동 적용 건너뜀
          const target = targets[0].actor;
          const { hBefore, hAfter } = await applyDamageAndStatus(target, effect.amount, []);
          return {
            type: "damage",
            targetType: "enemy-single",
            targets: [
              { name: target.name, before: hBefore, after: hAfter, delta: hAfter - hBefore },
            ],
            amount: effect.amount,
            selfTurnEnd: effect.selfTurnEnd === true,
            description,
          };
        } else if (effect.targetType === "enemy-all") {
          // 녹표 — Combat 참가 NPC 전체 자동
          const combat = game.combat;
          if (!combat) return null;
          const npcs = combat.combatants.filter((c) => c.actor?.type === "npc").map((c) => c.actor);
          if (npcs.length === 0) return null;
          const targetResults = [];
          for (const npc of npcs) {
            const { hBefore, hAfter } = await applyDamageAndStatus(npc, effect.amount, []);
            targetResults.push({
              name: npc.name,
              before: hBefore,
              after: hAfter,
              delta: hAfter - hBefore,
            });
          }
          return {
            type: "damage",
            targetType: "enemy-all",
            targets: targetResults,
            amount: effect.amount,
            selfTurnEnd: effect.selfTurnEnd === true,
            description,
          };
        }
        return null;
      }
      case "heal": {
        if (effect.targetType === "ally-all") {
          // 청표 — 게임 PC 전체 자동
          const allyPCs = game.actors.filter((a) => a.type === "character");
          const results = await applyHealHealth(allyPCs, effect.amount);
          return {
            type: "heal",
            targetType: "ally-all",
            // applyHealHealth는 actorName 반환 — 카드 렌더링(t.name)과 데미지 결과 형식에 맞춰 정규화.
            // F1: blocked(전투 중 건강 0 차단) 플래그 보존 — 카드에서 해당 PC만 차단 안내.
            targets: results.map((r) => ({
              name: r.actorName,
              before: r.before,
              after: r.after,
              delta: r.delta,
              blocked: r.blocked === true,
            })),
            amount: effect.amount,
            selfTurnEnd: effect.selfTurnEnd === true,
            description,
          };
        }
        return null;
      }

      // 황표 5~11 — Combat 참가 PC 전체에 1라운드 수신 대미지 감소 (G4-β)
      case "damage-reduction": {
        const partyCombatants =
          game.combat?.combatants.filter((c) => c.actor?.type === "character") ?? [];
        const targetNames = [];
        for (const c of partyCombatants) {
          await c.setFlag("aster", "damageReduction", effect.amount);
          await c.setFlag("aster", "damageBlocked", false); // 중복 부착 시 무효 해제
          targetNames.push(c.actor.name);
        }
        return {
          type: "damage-reduction",
          amount: effect.amount,
          targetNames,
          selfTurnEnd: effect.selfTurnEnd === true,
          description,
        };
      }

      // 황표 12+ — Combat 참가 PC 전체에 1라운드 대미지 무효 (G4-β)
      case "damage-block": {
        const partyCombatants =
          game.combat?.combatants.filter((c) => c.actor?.type === "character") ?? [];
        const targetNames = [];
        for (const c of partyCombatants) {
          await c.setFlag("aster", "damageBlocked", true);
          await c.setFlag("aster", "damageReduction", 0); // 무효가 감소 덮어쓰기
          targetNames.push(c.actor.name);
        }
        return {
          type: "damage-block",
          targetNames,
          selfTurnEnd: effect.selfTurnEnd === true,
          description,
        };
      }

      // 청표 12+ — 게임 PC 전체 회복 + 상태이상 전부 치료 (G4-β)
      case "heal-and-cure-all": {
        const allyPCs = game.actors.filter((a) => a.type === "character");
        const healResults = await applyHealHealth(allyPCs, effect.amount);
        const cureResults = await applyCureAllStatus(allyPCs);
        return {
          type: "heal-and-cure-all",
          targetType: "ally-all",
          targets: healResults.map((r) => ({
            name: r.actorName,
            before: r.before,
            after: r.after,
            delta: r.delta,
            blocked: r.blocked === true,
          })),
          amount: effect.amount,
          cureResults,
          selfTurnEnd: effect.selfTurnEnd === true,
          description,
        };
      }

      default:
        return null;
    }
  }

  /**
   * 부속성 효과 디스패처. white(아군 색이지만 합체기 부속성에 표 없음)는 default로 빠져 subResult=null.
   */
  async _applyUnisonSubEffect({
    selfActor,
    pairActor,
    mainColor,
    subColor,
    selfFinal,
    pairFinal,
    total,
    extraInfo,
    mainResult,
  }) {
    let subResult = null;
    switch (subColor) {
      case "red":
        subResult = await this._unisonSubRed();
        break;
      case "blue":
        subResult = await this._unisonSubBlue();
        break;
      case "green":
        subResult = await this._unisonSubGreen();
        break;
      case "yellow":
        subResult = await this._unisonSubYellow();
        break;
      default:
        break;
    }

    await this._renderUnisonCard({
      selfActor,
      pairActor,
      mainColor,
      subColor,
      selfFinal,
      pairFinal,
      total,
      extraInfo,
      mainResult,
      subResult,
    });
  }

  /** 적 부속성: 임의 상태이상 1개 → 아군(시나리오 PC 전체) 회복. 광역 회복이므로 전투 외 PC도 포함. */
  async _unisonSubRed() {
    const statusOptions = DAMAGE_STATUSES.map(
      (s) => `<option value="${s.key}">${game.i18n.localize(`ASTER.badstatus.${s.i18n}`)}</option>`,
    ).join("");
    const statusKey = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.combat.unisonSubRedTitle") },
      content: `<div class="form-group">
        <label>${game.i18n.localize("ASTER.combat.unisonSubRedLabel")}</label>
        <select name="status">${statusOptions}</select>
      </div>`,
      ok: { callback: (_e, b) => b.form.elements.status.value },
    }).catch(() => null);
    if (!statusKey) return null;

    const partyPCs = game.actors.filter((a) => a.type === "character");
    const results = await applyCureStatus(partyPCs, statusKey);
    return { type: "red", statusKey, results };
  }

  /** 청 부속성: 전투 참가 아군 1인 다음 판정 +1d6 — G3-γ focusActive 재사용. */
  async _unisonSubBlue() {
    const combat = game.combat;
    const partyCombatants = combat.combatants.filter((c) => c.actor?.type === "character");
    const allyOptions = partyCombatants
      .map((c) => `<option value="${c.id}">${c.actor.name}</option>`)
      .join("");
    const allyCombatantId = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.combat.unisonSubBlueTitle") },
      content: `<div class="form-group">
        <label>${game.i18n.localize("ASTER.combat.unisonSubBlueLabel")}</label>
        <select name="ally">${allyOptions}</select>
      </div>`,
      ok: { callback: (_e, b) => b.form.elements.ally.value },
    }).catch(() => null);
    if (!allyCombatantId) return null;

    const target = combat.combatants.get(allyCombatantId);
    if (!target?.actor) return null;
    await target.setFlag("aster", "focusActive", true);
    return { type: "blue", actorName: target.actor.name };
  }

  /** 녹 부속성: 전투 참가 아군 1인 민첩 ±20 1라운드 AE — G3-γ 대쉬 AE 패턴 재사용. */
  async _unisonSubGreen() {
    const combat = game.combat;
    const partyCombatants = combat.combatants.filter((c) => c.actor?.type === "character");
    const allyOptions = partyCombatants
      .map((c) => `<option value="${c.id}">${c.actor.name}</option>`)
      .join("");
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.combat.unisonSubGreenTitle") },
      content: `<div class="form-group">
        <label>${game.i18n.localize("ASTER.combat.unisonSubGreenAllyLabel")}</label>
        <select name="ally">${allyOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("ASTER.combat.unisonSubGreenDirectionLabel")}</label>
        <select name="dir"><option value="20">+20</option><option value="-20">-20</option></select>
      </div>`,
      ok: {
        callback: (_e, b) => ({
          allyId: b.form.elements.ally.value,
          delta: Number(b.form.elements.dir.value),
        }),
      },
    }).catch(() => null);
    if (!result) return null;

    const target = combat.combatants.get(result.allyId);
    if (!target?.actor) return null;
    await target.actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("ASTER.combat.unisonSubGreenEffectName"),
        img: "icons/svg/wind.svg",
        changes: [
          {
            key: "system.speed",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: result.delta,
            priority: 20,
          },
        ],
        // combat 매개는 Foundry 라운드 기반 만료 흐름에 필요(dash AE와 동일).
        duration: { rounds: 1, startRound: combat.round, combat: combat.id },
        flags: { aster: { sourceAction: "unisonGreen" } },
      },
    ]);
    return { type: "green", actorName: target.actor.name, delta: result.delta };
  }

  /** 황 부속성: 캔버스 타게팅한 적 1체에 부상/졸림/피로 중 1개 부여. 이미 상태이면 변화 없음. */
  async _unisonSubYellow() {
    const targets = getTargetedTokens({ required: true, max: 1, allowedTypes: "npc" });
    if (!targets) return null;
    const targetActor = targets[0].actor;
    if (!targetActor) return null;

    const allowedKeys = ["injury", "sleepy", "exhaustion"];
    const statusOptions = allowedKeys
      .map((k) => {
        const def = DAMAGE_STATUSES.find((s) => s.key === k);
        return `<option value="${k}">${game.i18n.localize(`ASTER.badstatus.${def?.i18n ?? k}`)}</option>`;
      })
      .join("");
    const statusKey = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.combat.unisonSubYellowTitle") },
      content: `<div class="form-group">
        <label>${game.i18n.localize("ASTER.combat.unisonSubYellowLabel")}</label>
        <select name="status">${statusOptions}</select>
      </div>`,
      ok: { callback: (_e, b) => b.form.elements.status.value },
    }).catch(() => null);
    if (!statusKey) return null;

    const current = targetActor.system.badstatus?.[statusKey] ?? false;
    if (!current) {
      await targetActor.update({ [`system.badstatus.${statusKey}`]: true });
    }
    return { type: "yellow", actorName: targetActor.name, statusKey, applied: !current };
  }

  /** 합체기 결과 카드 — 주속성 색 분기(spell-color-*), 페어·다이스·합산값·부속성 결과·안내문 표시. */
  async _renderUnisonCard({
    selfActor,
    pairActor,
    mainColor,
    subColor,
    selfFinal,
    pairFinal,
    total,
    extraInfo,
    mainResult,
    subResult,
  }) {
    const colorLabel = (k) => game.i18n.localize(`ASTER.aster.${k}`);
    const badstatusLabel = (key) => {
      const def = DAMAGE_STATUSES.find((s) => s.key === key);
      return game.i18n.localize(`ASTER.badstatus.${def?.i18n ?? key}`);
    };
    // 청표 회복 한 줄 — F1 차단(전투 중 건강 0) / 만건강 / 회복 분기. heal·heal-and-cure-all 공용.
    const healLineFor = (t) =>
      t.blocked === true
        ? game.i18n.format("ASTER.combat.unisonHealBlockedLine", { name: t.name })
        : t.delta > 0
          ? game.i18n.format("ASTER.combat.unisonHealLine", {
              name: t.name,
              before: t.before,
              after: t.after,
              delta: t.delta,
            })
          : game.i18n.format("ASTER.combat.unisonHealAlreadyMax", { name: t.name });

    let subResultText = "";
    if (subResult) {
      switch (subResult.type) {
        case "red": {
          const cured = subResult.results.filter((r) => r.cured).map((r) => r.actorName);
          subResultText = game.i18n.format("ASTER.combat.unisonSubRedResult", {
            status: badstatusLabel(subResult.statusKey),
            actors: cured.length
              ? cured.join(", ")
              : game.i18n.localize("ASTER.combat.unisonSubRedNone"),
          });
          break;
        }
        case "blue":
          subResultText = game.i18n.format("ASTER.combat.unisonSubBlueResult", {
            actor: subResult.actorName,
          });
          break;
        case "green":
          subResultText = game.i18n.format("ASTER.combat.unisonSubGreenResult", {
            actor: subResult.actorName,
            delta: subResult.delta > 0 ? `+${subResult.delta}` : `${subResult.delta}`,
          });
          break;
        case "yellow":
          subResultText = game.i18n.format("ASTER.combat.unisonSubYellowResult", {
            target: subResult.actorName,
            status: badstatusLabel(subResult.statusKey),
            applied: subResult.applied
              ? game.i18n.localize("ASTER.combat.unisonAppliedYes")
              : game.i18n.localize("ASTER.combat.unisonAppliedNo"),
          });
          break;
      }
    }

    // 주속성 결과 텍스트 생성 — mainResult null이면 GM 안내(mainTableHint)로 양자택일.
    let mainResultText = "";
    let hasMainResult = false;
    if (mainResult) {
      hasMainResult = true;
      switch (mainResult.type) {
        case "damage": {
          const targetLines = mainResult.targets
            .map((t) =>
              game.i18n.format("ASTER.combat.unisonDamageLine", {
                name: t.name,
                before: t.before,
                after: t.after,
                delta: t.delta,
              }),
            )
            .join("<br>");
          mainResultText = game.i18n.format("ASTER.combat.unisonMainDamageText", {
            amount: mainResult.amount,
            targets: targetLines,
          });
          break;
        }
        case "heal": {
          const targetLines = mainResult.targets.map(healLineFor).join("<br>");
          mainResultText = game.i18n.format("ASTER.combat.unisonMainHealText", {
            amount: mainResult.amount,
            targets: targetLines,
          });
          break;
        }

        // 황표 5~11 — 수신 대미지 감소
        case "damage-reduction": {
          mainResultText = game.i18n.format("ASTER.combat.unisonYellowReductionText", {
            amount: mainResult.amount,
            targets: mainResult.targetNames.join(", "),
          });
          break;
        }

        // 황표 12+ — 대미지 무효
        case "damage-block": {
          mainResultText = game.i18n.format("ASTER.combat.unisonYellowBlockText", {
            targets: mainResult.targetNames.join(", "),
          });
          break;
        }

        // 청표 12+ — 회복 + 상태이상 전부 치료
        case "heal-and-cure-all": {
          const healLines = mainResult.targets.map(healLineFor).join("<br>");
          const cureLines = mainResult.cureResults
            .filter((r) => r.curedKeys.length > 0)
            .map((r) =>
              game.i18n.format("ASTER.combat.unisonCureLine", {
                name: r.actorName,
                keys: r.curedKeys.map((k) => badstatusLabel(k)).join(", "),
              }),
            )
            .join("<br>");
          const cureSection = cureLines
            ? `<br>${game.i18n.localize("ASTER.combat.unisonCureSection")}<br>${cureLines}`
            : "";
          mainResultText =
            game.i18n.format("ASTER.combat.unisonHealAndCureText", {
              amount: mainResult.amount,
              targets: healLines,
            }) + cureSection;
          break;
        }
      }
    }

    // RollTable 플레이버 텍스트 통합 (G4-γ).
    if (mainResult?.type === "description-only") {
      // 효과 없이 텍스트만 (합산 3·4 실패 등) — hasMainResult를 켜서 GM 힌트 대신 텍스트 표시.
      hasMainResult = true;
      mainResultText = mainResult.description;
    } else if (mainResult?.description) {
      // 효과 결과 *앞*에 플레이버 텍스트 (룰북 서사 → 시스템 적용 순서).
      mainResultText = `<em class="unison-flavor">${mainResult.description}</em><br>${mainResultText}`;
    }

    // 자해 안내 (합산 2) — 효과는 적용, 행동완료는 GM 수동.
    // RollTable description에 "행동완료" 텍스트가 이미 포함되면 시스템 라인 중복 출력 방지.
    const hasSelfTurnEnd = mainResult?.selfTurnEnd === true;
    const descIncludesSelfWarn = mainResult?.description?.includes("행동완료") === true;
    const showSelfTurnEndLine = hasSelfTurnEnd && !descIncludesSelfWarn;

    const selfExtra = extraInfo.find((e) => e.actor === selfActor.name);
    const pairExtra = extraInfo.find((e) => e.actor === pairActor.name);

    const cardData = {
      title: game.i18n.localize("ASTER.combat.unisonAttackTitle"),
      pairLabel: game.i18n.format("ASTER.combat.unisonPairLine", {
        self: selfActor.name,
        pair: pairActor.name,
      }),
      mainColor,
      subColor,
      mainLabel: game.i18n.localize("ASTER.combat.unisonMainLabel"),
      subLabel: game.i18n.localize("ASTER.combat.unisonSubLabel"),
      mainColorLabel: colorLabel(mainColor),
      subColorLabel: colorLabel(subColor),
      selfActorName: selfActor.name,
      pairActorName: pairActor.name,
      selfFinal,
      pairFinal,
      total,
      selfExtra: !!selfExtra,
      selfOriginal: selfExtra?.original,
      selfExtraDice: selfExtra?.extra,
      pairExtra: !!pairExtra,
      pairOriginal: pairExtra?.original,
      pairExtraDice: pairExtra?.extra,
      totalLabel: game.i18n.localize("ASTER.combat.unisonTotalLabel"),
      // 자동 적용 완료 시 GM 안내 숨김 — hasMainResult ↔ mainTableHint 양자택일.
      mainTableHint: hasMainResult
        ? null
        : game.i18n.format("ASTER.combat.unisonMainTableHint", {
            color: colorLabel(mainColor),
            total,
          }),
      hasMainResult,
      mainEffectLabel: game.i18n.format("ASTER.combat.unisonMainEffectLabel", {
        color: colorLabel(mainColor),
      }),
      mainResultText,
      subResult,
      subEffectLabel: game.i18n.format("ASTER.combat.unisonSubEffectLabel", {
        color: colorLabel(subColor),
      }),
      subResultText,
      dodgeBlockNote: game.i18n.localize("ASTER.combat.unisonDodgeBlocked"),
      turnEndNote: game.i18n.localize("ASTER.combat.unisonTurnEnd"),
      hasSelfTurnEnd,
      showSelfTurnEndLine,
      selfTurnEndLine: showSelfTurnEndLine
        ? game.i18n.format("ASTER.combat.unisonSelfTurnEndLine", {
            self: selfActor.name,
            pair: pairActor.name,
          })
        : null,
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/aster/templates/chat/unison-attack.html",
      cardData,
    );

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: selfActor }),
    });
  }

  static async #onItemChat(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<b>${item.name}</b>`,
    });
  }

  static async #onItemEdit(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    item?.sheet.render(true);
  }

  static async #onItemDelete(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASTER.inventory.deleteConfirm") },
      content: `<p>${game.i18n.format("ASTER.inventory.deleteMsg", { name: item.name })}</p>`,
    });
    if (confirmed) await item.delete();
  }

  /**
   * 인벤토리 리스트 행에 표시할 타입별 핵심 요약 한 줄.
   * consumable: 회복 효과 요약 / equipment: 효과(보정) 텍스트.
   */
  static #inventorySummary(item) {
    if (item.type === "consumable") {
      const sys = item.system;
      const parts = [];
      if ((sys.healHealth ?? 0) > 0) parts.push(`건강 +${sys.healHealth}`);
      if (sys.cureAllStatus === true) parts.push("상태이상 전체");
      else if ((sys.cureStatus?.length ?? 0) > 0) parts.push(`상태이상 ${sys.cureStatus.length}`);
      return parts.join(" · ");
    }
    if (item.type === "equipment") return item.system.effect ?? "";
    return "";
  }

  /**
   * 마법구인데 장비란에 없어 효과가 비활성인지 (I1c, 룰북 807).
   * 인벤토리 리스트에 "효과 비활성" 안내를 표시할 조건.
   */
  static #isMagicToolInactive(item) {
    return (
      item.type === "equipment" &&
      item.system.type === "magicTool" &&
      !isEquipSlotContainer(item.system.container)
    );
  }

  /** consumable이 회복 효과(건강·상태이상·일괄)를 하나라도 가지면 true — "사용" 버튼 노출 조건. */
  static #consumableHasHeal(item) {
    if (item?.type !== "consumable") return false;
    const sys = item.system;
    return (
      (sys.healHealth ?? 0) > 0 || (sys.cureStatus?.length ?? 0) > 0 || sys.cureAllStatus === true
    );
  }

  static async #onConsumableUse(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await AsterActorSheet.useConsumable(this.actor, item);
  }

  /**
   * consumable 사용 — 회복 효과 적용 후 아이템 삭제 (R1).
   * 인벤토리 리스트의 "사용" 버튼과 아이템 시트의 "사용" 버튼에서 공용 호출.
   * 효과는 합체기 회복 헬퍼 3종 재사용. 대상은 자기 자신(self)만.
   * @param {Actor} actor
   * @param {Item} item
   */
  static async useConsumable(actor, item) {
    if (!actor || item?.type !== "consumable") return;
    const sys = item.system;

    const results = {
      itemName: item.name,
      itemImg: item.img,
      healed: null,
      statusCured: [],
      allCured: false,
      curedKeys: [],
    };

    // 1. 건강 회복 (max 클램프는 applyHealHealth 내부 처리)
    if ((sys.healHealth ?? 0) > 0) {
      const healResults = await applyHealHealth([actor], sys.healHealth);
      results.healed = healResults[0] ?? null;
    }

    // 2. 상태이상 회복 — cureAllStatus 우선, 없으면 cureStatus 개별 처리
    if (sys.cureAllStatus === true) {
      const cureResults = await applyCureAllStatus([actor]);
      results.allCured = true;
      results.curedKeys = cureResults[0]?.curedKeys ?? [];
    } else if ((sys.cureStatus?.length ?? 0) > 0) {
      for (const statusKey of sys.cureStatus) {
        const cureResults = await applyCureStatus([actor], statusKey);
        if (cureResults[0]?.cured) results.statusCured.push(statusKey);
      }
    }

    // 3. 결과 카드 → 4. 아이템 삭제 (소비)
    await AsterActorSheet.#renderConsumableCard(actor, results);
    await item.delete();
  }

  static async #renderConsumableCard(actor, results) {
    const badstatusLabel = (key) => {
      const def = DAMAGE_STATUSES.find((s) => s.key === key);
      return game.i18n.localize(`ASTER.badstatus.${def?.i18n ?? key}`);
    };

    let healLine = null;
    if (results.healed) {
      if (results.healed.blocked === true) {
        // F1: 전투 중 행동불능 PC는 건강 회복 차단 (아이템은 소비됨)
        healLine = game.i18n.localize("ASTER.consumable.healBlockedLine");
      } else if (results.healed.delta > 0) {
        healLine = game.i18n.format("ASTER.consumable.healLine", {
          before: results.healed.before,
          after: results.healed.after,
          delta: results.healed.delta,
        });
      } else {
        healLine = game.i18n.localize("ASTER.consumable.alreadyMax");
      }
    }

    // join 헬퍼가 없으므로 카드 데이터 단계에서 미리 문자열로 합친다.
    const cardData = {
      title: game.i18n.format("ASTER.consumable.usedTitle", { item: results.itemName }),
      itemName: results.itemName,
      itemImg: results.itemImg,
      actorName: actor.name,
      healLine,
      allCured: results.allCured,
      hasAllCuredKeys: results.curedKeys.length > 0,
      allCuredKeysText: results.curedKeys.map(badstatusLabel).join(", "),
      hasStatusCured: results.statusCured.length > 0,
      statusCuredText: results.statusCured.map(badstatusLabel).join(", "),
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/aster/templates/chat/consumable-card.html",
      cardData,
    );

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  static async #onRevive(_event, _target) {
    await AsterActorSheet.requestRevive(this.actor);
  }

  /**
   * 협력 회복 흐름 (R2, 룰북 535) — 탐색 중 PC 전원(행동불능 PC 본인 포함) 포만 -2 후 본인 건강 1로 회복.
   * 모든 검증(페이즈·행동불능·포만)을 다이얼로그 *전*에 끝내 진행 후 실패가 없도록 한다.
   * R1 useConsumable과 같은 공용 static 함수 패턴.
   * @param {Actor} fallenActor  행동불능 상태인 PC
   */
  static async requestRevive(fallenActor) {
    if (!fallenActor) return;

    // 1. 페이즈 — 탐색 중만. 클라이막스(전투)는 룰북 537 차단 안내, 그 외 페이즈는 탐색 전용 안내.
    const phase = game.settings.get("aster", "currentPhase");
    if (phase !== "exploration") {
      const key =
        phase === "climax" ? "ASTER.revive.inCombatBlocked" : "ASTER.revive.explorationOnly";
      ui.notifications.warn(game.i18n.localize(key));
      return;
    }

    // 2. 행동불능(건강 0) 확인
    if ((fallenActor.system.health?.value ?? 0) !== 0) {
      ui.notifications.warn(game.i18n.localize("ASTER.revive.notFallen"));
      return;
    }

    // 3. 대상 PC 전체 — 룰북 "전원"(행동불능 PC 본인 포함)
    const allPCs = game.actors.filter((a) => a.type === "character");
    if (allPCs.length === 0) {
      ui.notifications.warn(game.i18n.localize("ASTER.revive.noActors"));
      return;
    }

    // 4. 포만 부족 검사 — 한 명이라도 < 2면 차단 (본인이 원인일 수도 있음)
    const insufficient = allPCs.filter((a) => (a.system.satiety?.value ?? 0) < 2);
    if (insufficient.length > 0) {
      ui.notifications.warn(
        game.i18n.format("ASTER.revive.satietyInsufficient", {
          actors: insufficient.map((a) => a.name).join(", "),
        }),
      );
      return;
    }

    // 5. 확인 다이얼로그 — content는 인라인(코드베이스 다이얼로그 관례)
    const rows = allPCs
      .map((a) => {
        const before = a.system.satiety?.value ?? 0;
        return `<li><strong>${a.name}</strong>: ${before} → <span class="after">${before - 2}</span></li>`;
      })
      .join("");
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASTER.revive.confirmTitle") },
      content: `<div class="revive-confirm">
        <p>${game.i18n.localize("ASTER.revive.confirmIntro1")}</p>
        <p><strong>${fallenActor.name}</strong>${game.i18n.localize("ASTER.revive.confirmIntro2")}</p>
        <p class="cost-intro">${game.i18n.localize("ASTER.revive.confirmCost")}</p>
        <ul class="satiety-preview">${rows}</ul>
        <p class="proceed-q">${game.i18n.localize("ASTER.revive.confirmProceed")}</p>
      </div>`,
    }).catch(() => false);
    if (!confirmed) return;

    // 6. 포만 -2 일괄 + 건강 1 갱신
    const satietyResults = [];
    for (const pc of allPCs) {
      const before = pc.system.satiety?.value ?? 0;
      const after = before - 2; // 검사 통과했으니 >= 0
      await pc.update({ "system.satiety.value": after });
      satietyResults.push({ name: pc.name, before, after });
    }
    await fallenActor.update({ "system.health.value": 1 });

    // 7. 결과 카드
    await AsterActorSheet.#renderReviveCard(fallenActor, satietyResults);
  }

  static async #renderReviveCard(fallenActor, satietyResults) {
    const cardData = {
      title: game.i18n.localize("ASTER.revive.cardTitle"),
      fallenLine: game.i18n.format("ASTER.revive.fallenLine", { name: fallenActor.name }),
      satietyLines: satietyResults.map((r) =>
        game.i18n.format("ASTER.revive.satietyLine", {
          name: r.name,
          before: r.before,
          after: r.after,
        }),
      ),
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/aster/templates/chat/revive-card.html",
      cardData,
    );

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: fallenActor }),
    });
  }

  static async #onEquipmentEquip(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item?.type !== "equipment") return;
    await AsterActorSheet.equipItem(this.actor, item);
  }

  static async #onEquipmentUnequip(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item?.type !== "equipment") return;
    await AsterActorSheet.unequipItem(item);
  }

  /**
   * 장비 — 비어있는 장비 슬롯으로 이동(container를 equip-N으로). 슬롯이 모두 차면 안내 후 차단.
   * 빈 슬롯 자동 선택 — PL은 슬롯 번호를 고르지 않는다 (D17 container 패턴 확장, 룰북 269).
   * @param {Actor} actor
   * @param {Item} item
   */
  static async equipItem(actor, item) {
    const used = new Set(
      actor.items
        .filter((i) => i.type === "equipment" && isEquipSlotContainer(i.system.container))
        .map((i) => i.system.container),
    );
    const emptySlot = EQUIP_SLOT_CONTAINERS.find((s) => !used.has(s));
    if (!emptySlot) {
      ui.notifications.warn(game.i18n.localize("ASTER.equipment.slotsFull"));
      return;
    }
    await item.update({ "system.container": emptySlot, "system.grid": { x: 0, y: 0 } });
  }

  /** 해제 — 장비 슬롯의 아이템을 창고(container "")로 복귀. */
  static async unequipItem(item) {
    await item.update({ "system.container": "", "system.grid": { x: 0, y: 0 } });
  }

  static async #onToggleSkill(_event, target) {
    const skillId = target.dataset.skillId;
    const acquired = foundry.utils.deepClone(this.actor.system.craft?.acquired ?? {});
    const isAcquired = acquired[skillId] === true;

    if (!isAcquired) {
      const node = CRAFT_TREE.nodes.find((n) => n.id === skillId);
      if (!node) return;

      // 사역마 카테고리 배타 취득 검사
      if (node.category === "familiar") {
        const hasOther = CRAFT_TREE.nodes.some(
          (n) => n.category === "familiar" && n.id !== skillId && acquired[n.id],
        );
        if (hasOther) {
          target.checked = false;
          this.#craftWarn(["FAMILIAR_ONE"]);
          return;
        }
      }

      const r = canAcquire(skillId, acquired);
      if (!r.ok) {
        target.checked = false;
        this.#craftWarn(r.reasons);
        return;
      }

      // 취득 + 비용 차감: 고정색 + 마테리얼만 자동 차감(음수 허용). 임의색(anyAster)은 수동 조정.
      const update = { [`system.craft.acquired.${skillId}`]: true };
      const shortList = [];
      for (const c of ["red", "blue", "green", "yellow"]) {
        const amount = node.cost.aster[c];
        if (amount > 0) {
          const newVal = (this.actor.system.aster?.[c]?.value ?? 0) - amount;
          update[`system.aster.${c}.value`] = newVal;
          if (newVal < 0) {
            shortList.push(
              game.i18n.format("ASTER.craft.warn.NEGATIVE", {
                resource: game.i18n.localize(`ASTER.aster.${c}`),
                value: newVal,
              }),
            );
          }
        }
      }
      if (node.cost.material > 0) {
        const newMat = (this.actor.system.material ?? 0) - node.cost.material;
        update["system.material"] = newMat;
        if (newMat < 0) {
          shortList.push(
            game.i18n.format("ASTER.craft.warn.NEGATIVE", {
              resource: game.i18n.localize("ASTER.label.material"),
              value: newMat,
            }),
          );
        }
      }
      await this.actor.update(update);
      // 음수가 된 자원은 차단하지 않고 알림으로 수정 유도(음수 허용 정책).
      if (shortList.length) ui.notifications.warn(shortList.join(" / "));
    } else {
      const r = canRelease(skillId, acquired);
      if (!r.ok) {
        target.checked = true;
        this.#craftWarn(r.reasons, r.dependents);
        return;
      }
      // 환불: 차감의 거울 동작(anyAster 제외). ObjectField는 update 시 병합이라 키 삭제(-=)나
      // 빈/부분 객체 덮어쓰기가 동작하지 않는다. 해제는 해당 키를 false로 덮어쓴다(취득 패턴의 거울).
      // 모든 craft 헬퍼·표시가 `=== true`/truthy로 읽고 sumCost는 `if (!val) continue`라 false는 미취득과 동일.
      const node = CRAFT_TREE.nodes.find((n) => n.id === skillId);
      const update = { [`system.craft.acquired.${skillId}`]: false };
      if (node) {
        for (const c of ["red", "blue", "green", "yellow"]) {
          const amount = node.cost.aster[c];
          if (amount > 0) {
            update[`system.aster.${c}.value`] = (this.actor.system.aster?.[c]?.value ?? 0) + amount;
          }
        }
        if (node.cost.material > 0) {
          update["system.material"] = (this.actor.system.material ?? 0) + node.cost.material;
        }
      }
      await this.actor.update(update);
    }
  }

  static async #onCraftReset(_event, _target) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASTER.craft.reset") },
      content: game.i18n.localize("ASTER.craft.resetConfirm"),
    }).catch(() => false);
    if (!ok) return;

    const acquired = this.actor.system.craft?.acquired ?? {};
    if (Object.keys(acquired).length === 0) return;

    // 취득 노드 비용 합계로 일괄 환불(anyAster는 차감 대상이 아니었으므로 환불도 제외).
    // ObjectField는 update 시 병합이라 빈 객체 덮어쓰기·키 삭제(-=)가 동작하지 않는다.
    // 취득 키를 각각 false로 덮어쓴다(sumCost는 false를 건너뛰고 표시·헬퍼는 `=== true`로 읽음).
    const cost = sumCost(acquired);
    const update = {};
    for (const k of Object.keys(acquired)) update[`system.craft.acquired.${k}`] = false;
    for (const c of ["red", "blue", "green", "yellow"]) {
      if (cost.aster[c] > 0) {
        update[`system.aster.${c}.value`] =
          (this.actor.system.aster?.[c]?.value ?? 0) + cost.aster[c];
      }
    }
    if (cost.material > 0) {
      update["system.material"] = (this.actor.system.material ?? 0) + cost.material;
    }
    await this.actor.update(update);
  }

  static async #onCraftLockToggle(_event, _target) {
    const locked = this.actor.system.craft?.locked ?? false;
    await this.actor.update({ "system.craft.locked": !locked });
  }

  static async #onCraftItemOpen(_event, _target) {
    await AsterActorSheet.openCraftDialog(this.actor);
  }

  /**
   * C1 아이템 제작 다이얼로그 (PL 주도). 기존 아이템 드래그 시 빈 칸 자동 채움 + 실시간 비용 표시.
   * 확정 시 검증 → 부족하면 확인(D14 음수 허용) → 자원 차감 + 창고에 신규 아이템 생성.
   * @param {Actor} actor
   */
  static async openCraftDialog(actor) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("ASTER.craft.openCraftItem") },
      position: { width: 540 },
      content: _renderCraftDialogContent(),
      render: (_event, dialog) => _wireCraftDialog(dialog, actor),
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("ASTER.craft.confirm"),
          default: true,
          callback: (_e, _b, dialog) => _collectCraftDraft(dialog.element),
        },
        { action: "cancel", label: game.i18n.localize("ASTER.craft.cancel") },
      ],
    }).catch(() => null);

    // 취소·입력 오류(이름 누락·JSON 오류)면 객체가 아님.
    if (!result || typeof result !== "object") return;

    const validation = validateCraft(result, actor);
    if (!validation.ok) {
      const proceed = await _confirmCraftShortage(validation);
      if (!proceed) return;
    }
    const item = await craftItem(actor, result);
    if (item) {
      ui.notifications.info(game.i18n.format("ASTER.craft.success", { name: item.name }));
    }
  }

  static async #onSpellCast(_event, target) {
    const spell = this.actor.items.get(target.dataset.itemId);
    if (!spell) return;

    // 선택적 캔버스 타게팅 — 타겟 있으면 카드에 표시, 없으면 자기 강화 마법으로 진행.
    const targets = getTargetedTokens({ required: false, max: 1 });
    if (targets === null) return; // 타겟 초과 — 경고 출력됨
    const targetInfo = targets.length
      ? { name: targets[0].name, id: targets[0].id, actorId: targets[0].actor?.id ?? null }
      : null;

    // 마법명 클릭 — 추가 다이스 0, 2d6 즉시 판정 (기존 동작 유지).
    const roll = new Roll("2d6");
    await roll.evaluate();
    const dice = roll.dice[0].results.map((r) => r.result);

    await this.#processSpellRoll(spell, roll, dice, [], {
      color: spell.system.color,
      n: 0,
      targetInfo,
    });
  }

  static async #onSpellCastWithExtra(_event, target) {
    const spell = this.actor.items.get(target.dataset.itemId);
    if (!spell) return;

    const sys = spell.system;
    const color = sys.color;
    if (!color) {
      ui.notifications.warn(game.i18n.localize("ASTER.spell.warn.noColor"));
      return;
    }

    // 선택적 캔버스 타게팅 — 자원 소비 전에 검증 (초과 시 종료).
    const targets = getTargetedTokens({ required: false, max: 1 });
    if (targets === null) return;
    const targetInfo = targets.length
      ? { name: targets[0].name, id: targets[0].id, actorId: targets[0].actor?.id ?? null }
      : null;

    const haveAster = this.actor.system.aster?.[color]?.value ?? 0;
    const colorLabel = game.i18n.localize(`ASTER.aster.${color}`);

    // 다이얼로그: 추가 다이스 개수 (룰: 마법 속성 색 아스테르 1개당 다이스 1개. 보유량 한도).
    const n = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.spell.extraTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.format("ASTER.spell.extraHaveAster", { color: colorLabel, n: haveAster })}</label>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.spell.extraN")}</label>
          <input type="number" name="n" value="1" min="0" max="${haveAster}" />
        </div>
      `,
      ok: {
        label: game.i18n.localize("ASTER.spell.castLabel"),
        callback: (_e, b) => Number(b.form.elements.n.value) || 0,
      },
    }).catch(() => null);

    if (n === null) return; // 취소
    if (n < 0 || n > haveAster) {
      ui.notifications.warn(
        game.i18n.format("ASTER.spell.warn.notEnoughAster", {
          color: colorLabel,
          need: n,
          have: haveAster,
        }),
      );
      return;
    }

    // 자원 차감 (n=0이면 차감 없음). 룰: 판정 전 소비.
    if (n > 0) {
      await this.actor.update({ [`system.aster.${color}.value`]: haveAster - n });
    }

    // 굴림: (2+n)d6 한 번에
    const roll = new Roll(`${2 + n}d6`);
    await roll.evaluate();
    const allDice = roll.dice[0].results.map((r) => r.result);

    // 다이스 선택 — 3개+면 다이얼로그(2개 선택), 2개면 그대로 통과 (룰: "2개를 고른 후 판단").
    let pick = await pickDiceDialog({
      dice: allDice,
      count: 2,
      title: game.i18n.format("ASTER.spell.pickTitle", { name: spell.name }),
      hint: game.i18n.localize("ASTER.spell.pickHint"),
    });

    // 잘못된 선택(2개 아님) 시 1회 재시도
    if (!pick) {
      pick = await pickDiceDialog({ dice: allDice, count: 2 });
      if (!pick) {
        // 취소 — 자원은 이미 차감됨(정책 A: 환불 안 함).
        ui.notifications.info(game.i18n.localize("ASTER.spell.cancelled"));
        return;
      }
    }

    await this.#processSpellRoll(spell, roll, pick.selected, pick.discarded, {
      color,
      n,
      targetInfo,
    });
  }

  /**
   * 마법판정 공통 처리 — 선택된 2개로 달성치/대성공·대실패 산출, 카드 생성, 졸림 자동 해제.
   * @param {Item} spell
   * @param {Roll} roll                 평가 완료된 Roll (채팅 첨부용)
   * @param {number[]} selectedDice     달성치에 합산할 2개
   * @param {number[]} extraDice        선택 제외된 다이스 (표시 전용, 계산 제외)
   * @param {{color:string, n:number}} ctx
   */
  async #processSpellRoll(spell, roll, selectedDice, extraDice, ctx) {
    const sys = spell.system;
    const abilityTotal = getAbilityTotal(this.actor, sys.ability);
    const specialty = isSpecialty(this.actor, sys.color);
    const targetVal = sys.target ?? 0;

    // 대미지 적용 정보 (캔버스 타겟이 있을 때만 버튼 노출 — 자동 추출 없음, GM 입력).
    const spellCast = {
      sourceActorId: this.actor.id,
      targetActorId: ctx.targetInfo?.actorId ?? null,
      targetName: ctx.targetInfo?.name ?? null,
      defaultDamage: 0,
      damageApplied: false,
    };

    // 보정 통합: 졸림 + 포만 (페이즈 무관, 모든 판정에 적용).
    const penalties = computePenalties(this.actor);

    // 선택 A: extraDice는 합산하지 않고(빈 배열 전달) 카드에서 별도 표시.
    // 선택된 2개의 합만 diceTotal로 넘긴다.
    const diceTotal = selectedDice.reduce((a, b) => a + b, 0);
    const result = computeSpellRoll({
      diceTotal,
      abilityValue: abilityTotal,
      specialty,
      extraDice: [],
      target: targetVal,
      penalties,
    });

    // 대성공/대실패는 선택된 2개로 판단 (룰: "2개를 고른 후 판단").
    const cf = detectCritFumble(selectedDice);
    const finalSuccess = cf.critical || (!cf.fumble && result.success);

    // effect의 인라인 문법(@ability.*, [[/r ...]])을 Foundry 표준으로 치환
    const effectEnriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      sys.effect ?? "",
      { rollData: this.actor.getRollData() },
    );

    const cardData = {
      spellId: spell.id,
      actorId: this.actor.id,
      name: spell.name,
      img: spell.img,
      color: sys.color,
      formula: this.#formatFormula(spell),
      target: targetVal,
      achievement: result.achievement,
      success: finalSuccess,
      isCritical: cf.critical,
      isFumble: cf.fumble,
      isPC: this.actor.type === "character",
      breakdown: result.breakdown,
      diceText: selectedDice.join(", "),
      discardedDiceText: extraDice.length ? extraDice.join(", ") : "",
      extraN: ctx.n,
      extraColor: ctx.color,
      extraColorLabel: ctx.n > 0 ? game.i18n.localize(`ASTER.aster.${ctx.color}`) : "",
      targetInfo: ctx.targetInfo ?? null,
      spellCast,
      effect: sys.effect,
      effectEnriched,
      alert: sys.alert,
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/aster/templates/chat/spell-card.html",
      cardData,
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      rolls: [roll],
      sound: CONFIG.sounds.dice,
      content,
      flags: { aster: { spellCard: true, spellId: spell.id, actorId: this.actor.id, spellCast } },
    });

    // 졸림 자동 해제: 룰 "한 번 판정에 실패하면 해제" — 일반 마법판정 실패에만 적용.
    // AE는 actor의 _onUpdate hook에서 자동 삭제됨 (C-1 동기화).
    if (penalties.sleepy < 0 && !finalSuccess) {
      await this.actor.update({ "system.badstatus.sleepy": false });
    }

    // 포만 자동 감소: 탐색 페이즈만, 판정 시 -1 (배고픔이면 -2). PC만.
    await this.actor._decreaseSatietyIfExploration();
  }

  static #onRecordPrev(_event, _target) {
    this._recordIndex = Math.max(0, (this._recordIndex ?? 0) - 1);
    this.render();
  }

  static #onRecordNext(_event, _target) {
    const count = this.actor.items.filter((i) => i.type === "record").length;
    this._recordIndex = Math.min(count - 1, (this._recordIndex ?? 0) + 1);
    this.render();
  }

  static async #onRecordAdd(_event, _target) {
    await Item.create(
      { name: game.i18n.localize("ASTER.record.newName"), type: "record" },
      { parent: this.actor },
    );
    // 새로 추가된 마지막 카드로 이동
    this._recordIndex = this.actor.items.filter((i) => i.type === "record").length - 1;
    this.render();
  }

  static async #onRecordDelete(_event, target) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASTER.record.delete") },
      content: game.i18n.localize("ASTER.record.deleteConfirm"),
    }).catch(() => false);
    if (!ok) return;
    await this.actor.items.get(target.dataset.itemId)?.delete();
    this._recordIndex = Math.max(0, (this._recordIndex ?? 0) - 1);
    this.render();
  }

  static async #onItemCreate(_event, target) {
    if (!this.isEditable) return;
    const type = target.dataset.type;
    const data = foundry.utils.duplicate(target.dataset);
    const name = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const itemData = { name, type, system: data };
    delete itemData.system["type"];
    return Item.create(itemData, { parent: this.actor });
  }

  static #onAblRoll(_event, target) {
    const { ability, label } = target.dataset;
    this.actor.rollAbility(ability, label, {});
  }

  static #onEmoRoll(_event, target) {
    const { label } = target.dataset;
    this.actor.rollEmotion(label, {});
  }

  static async #onSubmit(_event, _form, formData) {
    await this.actor.update(formData.object);

    // NPC AP를 시트에서 수정하면 Combatant flag(actionPoint)도 동기화한다.
    // AP 진리 원천은 flag(N4 옵션 A)라, 동기 없으면 시트 표시·액션 실행이 수정값을 반영하지 못한다.
    if (this.actor.type === "npc" && game.combat?.started) {
      const combatant = game.combat.combatants.find((c) => c.actor?.id === this.actor.id);
      const apValue = foundry.utils.getProperty(formData.object, "system.ap.value");
      if (combatant && apValue != null) {
        await combatant.setFlag("aster", "actionPoint", Number(apValue) || 0);
      }
    }
  }
}

function _formatCraftCost(cost) {
  const parts = [];
  if (cost.material) parts.push(`◆${cost.material}`);
  const a = cost.aster;
  if (a.red || a.blue || a.green || a.yellow)
    parts.push(`◇${a.red}/${a.blue}/${a.green}/${a.yellow}`);
  if (cost.anyAster) parts.push(`◇임의 ${cost.anyAster}`);
  return parts.join(" ");
}

/* -------------------------------------------- */
/*  C1 아이템 제작 다이얼로그 헬퍼              */
/* -------------------------------------------- */

const CRAFT_ITEM_TYPES = ["consumable", "equipment", "bag", "food"];
// material[1..5] 색 키 — 비용/보유 표시용.
const CRAFT_COST_COLORS = ["red", "blue", "green", "yellow", "white"];

/** 제작 다이얼로그 content(HTML 문자열). 종류·드롭영역·이름·material[6]·효과·전제·비용 미리보기. */
function _renderCraftDialogContent() {
  const L = (k) => game.i18n.localize(k);
  const typeOptions = CRAFT_ITEM_TYPES.map(
    (t) => `<option value="${t}">${L(`ASTER.itemType.${t}`)}</option>`,
  ).join("");
  const matCells = Array.from({ length: 6 }, (_v, i) => {
    return `<label class="material-cell"><span class="material-lbl">${L(
      `ASTER.item.material.label${i}`,
    )}</span><input type="number" name="material.${i}" value="0" min="0" /></label>`;
  }).join("");

  // craftRequires 드롭다운 — 카테고리별 optgroup, 라벨은 i18n(가마솥·조각대 등), 값은 base id.
  const categoryLabels = Object.fromEntries(CRAFT_TREE.categories.map((c) => [c.id, c.label]));
  const byCategory = new Map();
  for (const item of getCraftRequiresBaseList()) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  const baseOptions = Array.from(byCategory.entries())
    .map(([cat, items]) => {
      const opts = items.map((it) => `<option value="${it.base}">${L(it.label)}</option>`).join("");
      return `<optgroup label="${L(categoryLabels[cat] ?? cat)}">${opts}</optgroup>`;
    })
    .join("");

  return `<div class="craft-dialog">
    <div class="form-group">
      <label>${L("ASTER.craft.itemType")}</label>
      <select name="itemType">${typeOptions}</select>
    </div>
    <div class="craft-drop-area" data-craft-drop="true"
         style="border:1px dashed #888;border-radius:4px;padding:8px;text-align:center;margin:6px 0;">
      <p>${L("ASTER.craft.dropHint")}</p>
    </div>
    <div class="form-group">
      <label>${L("ASTER.item.name")}</label>
      <input type="text" name="name" value="" />
    </div>
    <div class="form-group">
      <label>재료</label>
      <div class="material-grid flexrow align-center">${matCells}</div>
    </div>
    <div class="form-group">
      <label>${L("ASTER.item.effect")}</label>
      <input type="text" name="effect" value="" />
    </div>
    <div class="form-group">
      <label>${L("ASTER.craft.requiresLabel")}</label>
      <div class="craft-requires-rows"></div>
      <button type="button" data-craft-action="addRequires" class="craft-requires-add">
        + ${L("ASTER.craft.requiresAdd")}
      </button>
      <template class="craft-requires-row-template">
        <div class="craft-requires-row flexrow align-center">
          <select name="requires-base">
            <option value="">${L("ASTER.craft.requiresSelect")}</option>
            ${baseOptions}
          </select>
          <input type="number" name="requires-level" value="0" min="0" style="width:60px;" />
          <button type="button" data-craft-action="removeRequires"
                  title="${L("ASTER.craft.requiresRemove")}">×</button>
        </div>
      </template>
    </div>
    <div class="craft-cost-preview"></div>
  </div>`;
}

/** 다이얼로그 렌더 후 드롭 영역 + 실시간 비용 리스너 부착. */
function _wireCraftDialog(dialog, actor) {
  const el = dialog.element;
  const drop = el.querySelector("[data-craft-drop]");
  if (drop) {
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", async (event) => {
      event.preventDefault();
      drop.classList.remove("drag-over");
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (data?.type !== "Item") return;
      const source = await fromUuid(data.uuid);
      if (!source) return;
      if (!CRAFT_ITEM_TYPES.includes(source.type)) {
        ui.notifications.warn(game.i18n.localize("ASTER.craft.invalidType"));
        return;
      }
      _fillCraftDraftFromItem(el, source);
      _updateCraftCostPreview(el, actor);
    });
  }

  for (const input of el.querySelectorAll('input[name^="material."]')) {
    input.addEventListener("input", () => _updateCraftCostPreview(el, actor));
  }
  _updateCraftCostPreview(el, actor);

  // craftRequires 동적 행 — "추가"는 템플릿 복제, "제거"는 이벤트 위임(동적 생성 행 대응).
  const rowsContainer = el.querySelector(".craft-requires-rows");
  const template = el.querySelector(".craft-requires-row-template");
  const addBtn = el.querySelector('[data-craft-action="addRequires"]');
  if (addBtn && rowsContainer && template) {
    addBtn.addEventListener("click", () => {
      rowsContainer.appendChild(template.content.cloneNode(true));
    });
  }
  if (rowsContainer) {
    rowsContainer.addEventListener("click", (event) => {
      const btn = event.target.closest('[data-craft-action="removeRequires"]');
      if (btn) btn.closest(".craft-requires-row")?.remove();
    });
  }
}

/** 드래그된 아이템 정보로 입력 칸 자동 채움 (원본은 변경 안 됨 — 참조만). */
function _fillCraftDraftFromItem(el, source) {
  const sys = source.system ?? {};
  el.querySelector('select[name="itemType"]').value = source.type;
  el.querySelector('input[name="name"]').value = source.name;
  for (let i = 0; i < 6; i++) {
    const input = el.querySelector(`input[name="material.${i}"]`);
    if (input) input.value = sys.material?.[i] ?? 0;
  }
  const effectInput = el.querySelector('input[name="effect"]');
  if (effectInput) effectInput.value = sys.effect ?? "";

  // craftRequires — 기존 행 모두 제거 후 source의 각 전제마다 행 생성.
  // base가 CRAFT_TREE에 없으면 드롭다운은 미선택(빈 값)으로 남고 레벨만 채워진다(PL이 보정).
  const rowsContainer = el.querySelector(".craft-requires-rows");
  const template = el.querySelector(".craft-requires-row-template");
  if (rowsContainer && template) {
    rowsContainer.innerHTML = "";
    for (const [base, level] of Object.entries(sys.craftRequires ?? {})) {
      const frag = template.content.cloneNode(true);
      const row = frag.querySelector(".craft-requires-row");
      row.querySelector('select[name="requires-base"]').value = base;
      row.querySelector('input[name="requires-level"]').value = level;
      rowsContainer.appendChild(frag);
    }
  }
}

/** material 입력 6칸을 정수 배열로 읽기. */
function _readMaterialInputs(el) {
  const material = [];
  for (let i = 0; i < 6; i++) {
    const v = parseInt(el.querySelector(`input[name="material.${i}"]`)?.value, 10);
    material.push(Number.isFinite(v) ? v : 0);
  }
  return material;
}

/** 실시간 비용 표시 갱신 — 보유보다 큰 항목은 *부족* 표시. */
function _updateCraftCostPreview(el, actor) {
  const preview = el.querySelector(".craft-cost-preview");
  if (!preview) return;
  const mat = _readMaterialInputs(el);
  const aster = actor.system.aster ?? {};
  const have = {
    material: actor.system.material ?? 0,
    ...Object.fromEntries(CRAFT_COST_COLORS.map((c) => [c, aster[c]?.value ?? 0])),
  };
  const L = (k) => game.i18n.localize(k);
  const lines = [];
  const pushLine = (label, cost, haveVal) => {
    if (cost <= 0) return;
    const short = cost > haveVal;
    lines.push(
      `<span class="cost-line${short ? " short" : ""}">${label} -${cost}${
        short ? ` (${L("ASTER.craft.short")})` : ""
      }</span>`,
    );
  };
  pushLine(L("ASTER.item.material.label0"), mat[0], have.material);
  CRAFT_COST_COLORS.forEach((c, i) => pushLine(L(`ASTER.aster.${c}`), mat[i + 1], have[c]));
  preview.innerHTML = lines.length
    ? lines.join(" ")
    : `<span class="cost-line none">${L("ASTER.craft.noCost")}</span>`;
}

/** 입력값 수집 → draft 객체. 이름 누락·JSON 오류면 알림 후 null. */
function _collectCraftDraft(el) {
  const type = el.querySelector('select[name="itemType"]').value;
  const name = el.querySelector('input[name="name"]').value.trim();
  if (!name) {
    ui.notifications.warn(game.i18n.localize("ASTER.craft.nameRequired"));
    return null;
  }
  const material = _readMaterialInputs(el);

  // craftRequires — 모든 행 순회. 미선택·레벨 0 행은 제외. 같은 base 중복 시 마지막 값.
  const craftRequires = {};
  for (const row of el.querySelectorAll(".craft-requires-row")) {
    const base = row.querySelector('select[name="requires-base"]')?.value;
    const level = parseInt(row.querySelector('input[name="requires-level"]')?.value, 10);
    if (!base || !Number.isFinite(level) || level <= 0) continue;
    craftRequires[base] = level;
  }

  const effect = el.querySelector('input[name="effect"]')?.value ?? "";
  return { name, type, system: { material, craftRequires, effect } };
}

/** 자원·전제 부족 시 그래도 진행할지 확인 (D14 음수 허용 정책). */
function _confirmCraftShortage(validation) {
  const L = (k) => game.i18n.localize(k);
  const lines = [];
  if (validation.reasons.includes("CRAFT_REQUIRES_NOT_MET")) {
    const miss = validation.missing
      .map((m) => `${m.base} Lv${m.requiredLevel} (보유 ${m.have})`)
      .join(", ");
    lines.push(game.i18n.format("ASTER.craft.shortageRequires", { requires: miss }));
  }
  if (validation.reasons.includes("MATERIAL_SHORT")) lines.push(L("ASTER.craft.shortageMaterial"));
  for (const c of CRAFT_COST_COLORS) {
    if (validation.reasons.includes(`ASTER_${c.toUpperCase()}_SHORT`)) {
      lines.push(game.i18n.format("ASTER.craft.shortageAster", { color: L(`ASTER.aster.${c}`) }));
    }
  }
  return foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ASTER.craft.openCraftItem") },
    content: `<div class="craft-shortage"><p>${L("ASTER.craft.shortage")}</p><ul>${lines
      .map((l) => `<li>${l}</li>`)
      .join("")}</ul></div>`,
  }).catch(() => false);
}

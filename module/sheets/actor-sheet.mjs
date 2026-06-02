import { prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { checkBagCapacity, checkStorageAdd } from "../helpers/inventory-capacity.mjs";
import { CRAFT_TREE } from "../helpers/craft-tree.mjs";
import { prereqMet, sumCost, canAcquire, canRelease } from "../helpers/craft-cost.mjs";
import { computeSpellRoll, getAbilityTotal, isSpecialty } from "../helpers/spell-roll.mjs";
import { detectCritFumble, computePenalties } from "../helpers/roll-result.mjs";
import { pickDiceDialog } from "../helpers/dice-select.mjs";
import { getTargetedTokens } from "../helpers/target-select.mjs";

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
      rollDodge: AsterActorSheet.#onRollDodge,
      itemChat: AsterActorSheet.#onItemChat,
      itemEdit: AsterActorSheet.#onItemEdit,
      itemDelete: AsterActorSheet.#onItemDelete,
      toggleSkill: AsterActorSheet.#onToggleSkill,
      craftReset: AsterActorSheet.#onCraftReset,
      craftLockToggle: AsterActorSheet.#onCraftLockToggle,
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
    } else if (this.actor.type === "npc") {
      this._prepareItems(context);
    }

    return context;
  }

  /**
   * 전투 탭 컨텍스트. 활성 Combat에서 이 액터의 Combatant를 찾아 AP를 노출.
   * @returns {{inCombat:boolean, ap:number, combatantId?:string}}
   */
  #buildCombatContext() {
    const combat = game.combat;
    if (!combat?.started) return { inCombat: false, disabled: true, ap: 0 };

    const combatant = combat.combatants.find((c) => c.actor?.id === this.actor.id);
    if (!combatant) return { inCombat: false, disabled: true, ap: 0 };

    return {
      inCombat: true,
      disabled: false,
      ap: combatant.getFlag("aster", "actionPoint") ?? 0,
      combatantId: combatant.id,
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

    context.inv = {
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
        })),
        ...inStorage.map((i) => ({
          id: i.id,
          name: i.name,
          img: i.img,
          location: "storage",
          locationLabel: inStorageLabel,
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

    // 탭 초기 상태 적용 (data-action="tab" 클릭은 ApplicationV2가 자동 처리)
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      this.changeTab(tab, group, { force: true });
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

    const currentAP = combatant.getFlag("aster", "actionPoint") ?? 0;
    let cost;
    let chatExtra;
    let throwTarget = null; // 돌던지기 대상 토큰 (대미지 적용 flag용)

    switch (actionKey) {
      case "throw": {
        // 캔버스 사전 타게팅 — 적(NPC) 1체만 허용. 검증 실패 시 자원 소비 없이 종료.
        const targets = getTargetedTokens({ required: true, max: 1, allowedTypes: "npc" });
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
        chatExtra = game.i18n.format("ASTER.combat.dashEffect", { x });
        break;
      }
      case "charge": {
        const sub = await foundry.applications.api.DialogV2.prompt({
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
        if (!sub) return;
        cost = 3;
        chatExtra =
          sub === "ap"
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

    // 합체기 준비 플래그 (G4에서 활용)
    if (actionKey === "unisonPrepare") {
      await combatant.setFlag("aster", "unisonReady", true);
    }

    const actionName = game.i18n.localize(`ASTER.combat.action.${actionKey}`);

    // 액션별 flag — 돌던지기는 대미지 적용 정보 포함 (1대미지 자동 추출).
    const actionFlag = { type: actionKey };
    let damageBtn = "";
    if (actionKey === "throw" && throwTarget) {
      const targetActorId = throwTarget.actor?.id ?? null;
      actionFlag.sourceActorId = this.actor.id;
      actionFlag.targetActorId = targetActorId;
      actionFlag.targetName = throwTarget.name;
      actionFlag.defaultDamage = 1;
      actionFlag.damageApplied = false;
      // 대상 액터가 식별될 때만 버튼 노출 (orphan 토큰이면 적용 불가).
      if (targetActorId) {
        damageBtn = `<footer class="card-actions damage-actions">
          <button type="button" data-action="apply-damage">${game.i18n.localize("ASTER.damage.applyBtn")}</button>
        </footer>`;
      }
    }

    await ChatMessage.create({
      content: `<div class="aster-chat-card combat-action-card">
        <header class="card-header"><div class="title">
          <div class="name">${actionName}</div>
          <div class="formula">${game.i18n.format("ASTER.combat.apSpent", { n: cost })}</div>
        </div></header>
        <div class="action-effect">${chatExtra}</div>
        ${damageBtn}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flags: { aster: { combatAction: actionFlag } },
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
      // 환불: 차감의 거울 동작(anyAster 제외). ObjectField 키는 삭제 구문(-=)으로 제거.
      const node = CRAFT_TREE.nodes.find((n) => n.id === skillId);
      const update = { [`system.craft.acquired.-=${skillId}`]: null };
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
    // 빈 객체를 머지하면 기존 키가 남으므로, 취득한 키를 각각 삭제 구문(-=)으로 제거.
    const cost = sumCost(acquired);
    const update = {};
    for (const k of Object.keys(acquired)) update[`system.craft.acquired.-=${k}`] = null;
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

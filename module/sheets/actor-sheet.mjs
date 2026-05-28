import { onManageActiveEffect, prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { checkBagCapacity, checkStorageAdd } from "../helpers/inventory-capacity.mjs";
import { CRAFT_TREE } from "../helpers/craft-tree.mjs";
import {
  prereqMet,
  sumCost,
  checkAffordable,
  canAcquire,
  canRelease,
} from "../helpers/craft-cost.mjs";
import { computeSpellRoll, getAbilityTotal, isSpecialty } from "../helpers/spell-roll.mjs";

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
      itemChat: AsterActorSheet.#onItemChat,
      itemEdit: AsterActorSheet.#onItemEdit,
      itemDelete: AsterActorSheet.#onItemDelete,
      toggleSkill: AsterActorSheet.#onToggleSkill,
      craftReset: AsterActorSheet.#onCraftReset,
      spellCast: AsterActorSheet.#onSpellCast,
      recordPrev: AsterActorSheet.#onRecordPrev,
      recordNext: AsterActorSheet.#onRecordNext,
      recordAdd: AsterActorSheet.#onRecordAdd,
      recordDelete: AsterActorSheet.#onRecordDelete,
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
    } else if (this.actor.type === "npc") {
      this._prepareItems(context);
    }

    return context;
  }

  _prepareCharacterData(context) {
    for (const [k, v] of Object.entries(context.system.ability)) {
      v.label = game.i18n.localize(CONFIG.ASTER.ability[k]) ?? k;
    }
    for (const [k, v] of Object.entries(context.system.aster)) {
      v.label = game.i18n.localize(CONFIG.ASTER.aster[k]) ?? k;
    }
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
        disabledAttr: isLocked ? "disabled" : "",
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
    const afford = checkAffordable(acquired, resources);

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
        over: cost.aster[c] > (resources.aster[c] ?? 0),
      })),
      {
        key: "material",
        label: "마테리얼",
        have: resources.material ?? 0,
        used: cost.material,
        haveEmpty: false,
        usedEmpty: false,
        over: cost.material > (resources.material ?? 0),
      },
      {
        key: "any",
        label: "임의",
        have: null,
        used: cost.anyAster,
        haveEmpty: true,
        usedEmpty: false,
        over: false,
      },
      {
        key: "self",
        label: "자속성",
        have: null,
        used: null,
        haveEmpty: true,
        usedEmpty: true,
        over: false,
      },
      {
        key: "total",
        label: "총합",
        have: asterHaveTotal,
        used: asterUsedTotal,
        haveEmpty: false,
        usedEmpty: false,
        over: afford.reasons.includes("ASTER_TOTAL_SHORT"),
      },
    ];

    context.craft = {
      categories: CRAFT_TREE.categories.map((c) => byCat[c.id]),
      overBudget: !afford.ok,
      overReasons: afford.reasons,
      cost,
      resources,
      summaryColumns,
    };
  }

  #craftResources() {
    const a = this.actor.system.aster ?? {};
    return {
      material: this.actor.system.material ?? 0,
      aster: {
        red: a.red?.value ?? 0,
        blue: a.blue?.value ?? 0,
        green: a.green?.value ?? 0,
        yellow: a.yellow?.value ?? 0,
        white: a.white?.value ?? 0,
      },
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
    const html = this.element;

    // 탭 초기 상태 적용 (data-action="tab" 요소가 있으므로 클릭은 ApplicationV2가 자동 처리)
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      this.changeTab(tab, group, { force: true });
    }

    // 아이템 시트 열기
    html.querySelectorAll(".item-edit").forEach((el) =>
      el.addEventListener("click", (ev) => {
        const item = this.actor.items.get(ev.currentTarget.closest(".item")?.dataset.itemId);
        item?.sheet.render(true);
      }),
    );

    if (!this.isEditable) return;

    // 아이템 생성
    html
      .querySelectorAll(".item-create")
      .forEach((el) => el.addEventListener("click", this._onItemCreate.bind(this)));

    // 아이템 삭제
    html.querySelectorAll(".item-delete").forEach((el) =>
      el.addEventListener("click", (ev) => {
        const item = this.actor.items.get(ev.currentTarget.closest(".item")?.dataset.itemId);
        item?.delete().then(() => this.render(false));
      }),
    );

    // 액티브 이펙트
    html
      .querySelectorAll(".effect-control")
      .forEach((el) => el.addEventListener("click", (ev) => onManageActiveEffect(ev, this.actor)));

    // 일반 롤
    html
      .querySelectorAll(".rollable")
      .forEach((el) => el.addEventListener("click", this._onRoll.bind(this)));

    // 판정 옵션: 일반 / 대항
    html.querySelector(".roll-opt-abl")?.addEventListener("click", () => {
      const input = html.querySelector("#roll-dc");
      if (input) input.value = "7";
      this.actor.update({ "system.dc": 7 });
    });
    html.querySelector(".roll-opt-vs")?.addEventListener("click", () => {
      const input = html.querySelector("#roll-dc");
      if (input) input.value = "";
      this.actor.update({ "system.dc": 0 });
    });

    // 능력치 롤
    html
      .querySelectorAll(".abl-roll")
      .forEach((el) => el.addEventListener("click", this._onAblRoll.bind(this)));

    // 정동 판정 롤
    html
      .querySelectorAll(".emo-roll")
      .forEach((el) => el.addEventListener("click", this._onEmoRoll.bind(this)));

    // 핫바 매크로용 드래그
    if (this.actor.isOwner) {
      const onDragStart = (ev) => this._onDragStart(ev);
      html.querySelectorAll("li.item:not(.inventory-header)").forEach((li) => {
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", onDragStart, false);
      });
    }
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = foundry.utils.duplicate(header.dataset);
    const name = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const itemData = { name, type, system: data };
    delete itemData.system["type"];
    return Item.create(itemData, { parent: this.actor });
  }

  _onRoll(event) {
    event.preventDefault();
    const dataset = event.currentTarget.dataset;

    if (dataset.rollType === "item") {
      const item = this.actor.items.get(event.currentTarget.closest(".item")?.dataset.itemId);
      if (item) return item.roll();
    }

    if (dataset.roll) {
      const label = dataset.label ? `[ability] ${dataset.label}` : "";
      const roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get("core", "rollMode"),
      });
      return roll;
    }
  }

  _onAblRoll(event) {
    event.preventDefault();
    const { ability, label } = event.currentTarget.dataset;
    this.actor.rollAbility(ability, label, { event });
  }

  _onEmoRoll(event) {
    event.preventDefault();
    const { aster, label } = event.currentTarget.dataset;
    this.actor.rollEmotion(aster, label, { event });
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

  static async #onItemChat(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<b>${item.name}</b>`,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
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
      // 사역마 카테고리 배타 취득 검사
      const node = CRAFT_TREE.nodes.find((n) => n.id === skillId);
      if (node?.category === "familiar") {
        const hasOther = CRAFT_TREE.nodes.some(
          (n) => n.category === "familiar" && n.id !== skillId && acquired[n.id],
        );
        if (hasOther) {
          target.checked = false;
          this.#craftWarn(["FAMILIAR_ONE"]);
          return;
        }
      }

      const r = canAcquire(skillId, acquired, this.#craftResources());
      if (!r.ok) {
        target.checked = false;
        this.#craftWarn(r.reasons);
        return;
      }
      acquired[skillId] = true;
    } else {
      const r = canRelease(skillId, acquired);
      if (!r.ok) {
        target.checked = true;
        this.#craftWarn(r.reasons, r.dependents);
        return;
      }
      delete acquired[skillId];
    }
    await this.actor.update({ "system.craft.acquired": acquired });
  }

  static async #onCraftReset(_event, _target) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASTER.craft.reset") },
      content: game.i18n.localize("ASTER.craft.resetConfirm"),
    }).catch(() => false);
    if (!ok) return;
    await this.actor.update({ "system.craft.acquired": {} });
  }

  static async #onSpellCast(_event, target) {
    const spell = this.actor.items.get(target.dataset.itemId);
    if (!spell) return;

    const sys = spell.system;
    const abilityTotal = getAbilityTotal(this.actor, sys.ability);
    const specialty = isSpecialty(this.actor, sys.color);
    const targetVal = sys.target ?? 0;

    // 2d6 기본 굴림 (추가 다이스는 채팅 카드 버튼에서 별도 굴림)
    const baseRoll = new Roll("2d6");
    await baseRoll.evaluate();

    const result = computeSpellRoll({
      diceTotal: baseRoll.total,
      abilityValue: abilityTotal,
      specialty,
      extraDice: [],
      target: targetVal,
    });

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
      success: result.success,
      breakdown: result.breakdown,
      diceText: baseRoll.dice[0].results.map((r) => r.result).join(", "),
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
      rolls: [baseRoll],
      sound: CONFIG.sounds.dice,
      content,
      flags: { aster: { spellCard: true, spellId: spell.id, actorId: this.actor.id } },
    });
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

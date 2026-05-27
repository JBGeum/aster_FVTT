import { onManageActiveEffect, prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { checkBagCapacity, checkStorageAdd } from "../helpers/inventory-capacity.mjs";
import { CRAFT_TREE } from "../helpers/craft-tree.mjs";
import { prereqMet, sumCost, checkAffordable } from "../helpers/craft-cost.mjs";

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

    // 카테고리별로 label 기준 체인 그룹화
    const byCat = {};
    const chainMap = {};
    const chainOrder = {};
    for (const cat of CRAFT_TREE.categories) {
      byCat[cat.id] = { ...cat, chains: [] };
      chainMap[cat.id] = {};
      chainOrder[cat.id] = [];
    }

    for (const node of CRAFT_TREE.nodes) {
      const isAcquired = acquired[node.id] === true;
      const unlocked = prereqMet(node.id, acquired);
      const isLocked = !unlocked && !isAcquired;
      const displayNode = {
        ...node,
        acquired: isAcquired,
        unlocked,
        locked: isLocked,
        disabledAttr: isLocked ? "disabled" : "",
        costLabel: _formatCraftCost(node.cost),
      };
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
    const asterTotal =
      cost.aster.red + cost.aster.blue + cost.aster.green + cost.aster.yellow + cost.anyAster;
    const asterHave = Object.values(resources.aster).reduce((s, v) => s + v, 0);

    context.craft = {
      categories: CRAFT_TREE.categories.map((c) => byCat[c.id]),
      overBudget: !afford.ok,
      overReasons: afford.reasons,
      cost,
      resources,
      asterTotal,
      asterHave,
    };
  }

  _prepareItems(context) {
    const features = [];
    const spells = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };

    for (const i of context.items) {
      i.img = i.img || CONST.DEFAULT_TOKEN;
      if (i.type === "feature") features.push(i);
      else if (i.type === "spell" && i.system.spellLevel != null)
        spells[i.system.spellLevel].push(i);
    }

    context.features = features;
    context.spells = spells;
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

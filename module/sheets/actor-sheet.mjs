import { prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { checkBagCapacity, checkStorageAdd, fitsInShape } from "../helpers/inventory-capacity.mjs";
import { equipItem, unequipItem } from "../helpers/equipment.mjs";
import { acquireSkill, resetCraft } from "../helpers/craft-actions.mjs";
import { openCraftDialog } from "../helpers/craft-dialog.mjs";
import { resolveCombatAction, resolveNpcActionUse } from "../helpers/combat-actions.mjs";
import { castSpell, castSpellWithExtra } from "../helpers/spell-cast.mjs";
import { performUnisonAttack } from "../helpers/unison.mjs";
import { buildStatusTooltips, buildSpeedTooltip } from "../helpers/sheet-tooltips.mjs";
import { useConsumable } from "../helpers/consumable.mjs";
import { requestRevive } from "../helpers/revive.mjs";
import { postItemCard } from "../helpers/item-chat.mjs";
import { findCombatantFor } from "../helpers/combatant-match.mjs";
import { buildCombatStateRows } from "../helpers/combat-state-rows.mjs";
import { EFFECT_TARGETS, buildEffectData, stripEffectKeys } from "../helpers/effect-targets.mjs";
import {
  prepareCharacterData,
  prepareInventory,
  prepareCraft,
  prepareItems,
  prepareSpellList,
  prepareRecord,
  buildCombatContext,
  buildReviveContext,
} from "./sheet-context.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class AsterActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["aster", "sheet", "actor"],
    // 높이 고정 — height:"auto"는 탭 전환마다 윈도우를 리사이즈해 화면이 출렁인다.
    // 넘치는 탭은 .tab.active 내부 스크롤로 흡수하고, 수동 리사이즈 값은 유지된다.
    position: { width: 920, height: 920 },
    window: { resizable: true },
    actions: {
      cellClick: AsterActorSheet.#onCellClick,
      itemUnplace: AsterActorSheet.#onItemUnplace,
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
      asterStep: AsterActorSheet.#onAsterStep,
      itemCreate: AsterActorSheet.#onItemCreate,
      effectCreate: AsterActorSheet.#onEffectCreate,
      effectEdit: AsterActorSheet.#onEffectEdit,
      effectDelete: AsterActorSheet.#onEffectDelete,
      effectToggle: AsterActorSheet.#onEffectToggle,
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

  static #SCROLLERS = [
    ".tab.character",
    ".tab.craft",
    ".tab.record",
    ".panel--inv .items",
    ".npc-sheet",
  ];

  #scrollTops = {};

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
    // 입력칸 전용 — toObject(false)는 AE가 적용된 값이라 그대로 저장하면 효과 분이 누적된다.
    context.src = this.actor.toObject().system;
    context.flags = actorData.flags;
    context.items = this.actor.items.map((i) => i.toObject(false));
    context.effects = prepareActiveEffectCategories(this.actor.effects);
    context.hasEffects = this.actor.effects.size > 0;
    context.rollData = this.actor.getRollData();
    context.config = CONFIG.ASTER;
    context.cssClass = this.isEditable ? "editable" : "locked";
    context.editable = this.isEditable;
    context.owner = this.actor.isOwner;
    context.isGM = game.user.isGM;
    context.badstatusTips = buildStatusTooltips();

    if (this.actor.type === "character") {
      prepareCharacterData(this, context);
      prepareItems(this, context);
      prepareInventory(this, context);
      prepareCraft(this, context);
      prepareSpellList(this, context);
      prepareRecord(this, context);
      context.combatContext = buildCombatContext(this);
      context.combatStateRows = buildCombatStateRows(context.combatContext);
      context.reviveContext = buildReviveContext(this);
      context.speedTooltip = buildSpeedTooltip(this.actor.appliedEffects);
    } else if (this.actor.type === "npc") {
      prepareItems(this, context);
      context.combatContext = buildCombatContext(this);
      // 각 행에서 부모 combatContext를 `../`로 참조하면 prettier HTML 파서가 실패하므로
      // 행 컨텍스트에 미리 평면화한다.
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

  _onRender(context, options) {
    super._onRender(context, options);

    // NPC 시트는 탭 없는 flat 폼이라 매칭 요소가 없다 — changeTab은 요소 부재 시 throw하므로
    // 해당 탭 네비가 실제로 렌더된 경우에만 호출한다.
    for (const [group, tab] of Object.entries(this.tabGroups)) {
      if (this.element.querySelector(`[data-group="${group}"][data-tab="${tab}"]`)) {
        this.changeTab(tab, group, { force: true });
      }
    }

    // 탭 클릭 전환을 직접 바인딩한다. 이 시트는 static TABS를 쓰지 않아 ApplicationV2의
    // 네이티브 탭 클릭(_onClickTab)이 바인딩되지 않으므로, data-action="tab" 요소에 직접 건다.
    // (re-render 시 DOM이 교체되므로 리스너 누적 없음.)
    for (const navItem of this.element.querySelectorAll("nav.tabs [data-action='tab']")) {
      navItem.addEventListener("click", (event) => {
        event.preventDefault();
        const { tab, group } = navItem.dataset;
        if (tab && group) this.changeTab(tab, group);
      });
    }

    // changeTab이 .active를 붙인 뒤라야 컨테이너에 overflow가 걸려 scrollTop이 먹는다.
    for (const sel of AsterActorSheet.#SCROLLERS) {
      const el = this.element.querySelector(sel);
      if (!el) continue;
      if (this.#scrollTops[sel]) el.scrollTop = this.#scrollTops[sel];
      el.addEventListener("scroll", () => (this.#scrollTops[sel] = el.scrollTop), {
        passive: true,
      });
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

    // 폼 제출은 system.*만 다뤄 flag는 저장되지 않는다.
    for (const input of this.element.querySelectorAll("[data-ap-input]")) {
      input.addEventListener("change", async (ev) => {
        const combatant = game.combat ? findCombatantFor(game.combat.combatants, this.actor) : null;
        if (!combatant) return;
        const value = Number(ev.currentTarget.value);
        await combatant.setFlag("aster", "actionPoint", Number.isFinite(value) ? value : 0);
      });
    }

    for (const input of this.element.querySelectorAll("[data-combat-flag]")) {
      input.addEventListener("change", async (ev) => {
        const combatant = game.combat ? findCombatantFor(game.combat.combatants, this.actor) : null;
        if (!combatant) return;
        const el = ev.currentTarget;
        const key = el.dataset.combatFlag;
        if (el.type === "checkbox") {
          await combatant.setFlag("aster", key, el.checked);
          return;
        }
        const value = Number(el.value);
        await combatant.setFlag("aster", key, Number.isFinite(value) ? value : 0);
      });
    }

    // 이미지 편집 — data-edit 클릭 시 FilePicker. V2(DocumentSheetV2)는 V1과 달리
    // data-edit 자동 바인딩이 없어 직접 건다(re-render마다 DOM 교체라 리스너 누적 없음).
    // dataset.edit를 update 키로 일반화 — 초상(img) 외 다른 이미지 필드도 커버.
    for (const img of this.element.querySelectorAll("img[data-edit]")) {
      img.addEventListener("click", () => {
        const key = img.dataset.edit;
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: foundry.utils.getProperty(this.document, key),
          callback: (path) => this.document.update({ [key]: path }),
        }).browse();
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
    const content = `<label class="form-label">${game.i18n.localize("ASTER.inventory.itemLabel")}</label>
<select name="choice">${options}</select>`;
    return foundry.applications.api.DialogV2.prompt({
      classes: ["hb-dialog"], // 약초첩 다이얼로그 스킨(_dialog.scss). 다크는 전역 테마 신호로 자동 스왑.
      window: {
        title: game.i18n.localize("ASTER.inventory.choose"),
        icon: "fa-solid fa-wand-sparkles",
      },
      content,
      ok: {
        icon: "fa-solid fa-check",
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

    if (!fitsInShape({ start, size: item.system.size, grid, dead: grid.dead })) {
      ui.notifications.warn(game.i18n.localize("ASTER.inventory.warn.SHAPE_BLOCKED"));
      return;
    }

    const itemsInBag = this.actor.items
      .filter((i) => i.system.container === bag.id && ["consumable", "equipment"].includes(i.type))
      .map((i) => ({ size: i.system.size }));
    const cap = checkBagCapacity({
      newItemSize: item.system.size,
      itemsInBag,
      grid,
      dead: grid.dead,
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

  static async #onPicnicDeclare(_event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item || item.type !== "food") return;

    const phase = game.settings.get("aster", "currentPhase");
    if (phase !== "exploration") {
      ui.notifications.warn(game.i18n.localize("ASTER.food.warn.notExploration"));
      return;
    }

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

  static async #onRollDodge(event, _target) {
    await this.actor.rollDodge({ showDialog: event.shiftKey });
  }

  static async #onRollHit(_event, _target) {
    await this.actor.rollHit();
  }

  static async #onCombatAction(_event, target) {
    await resolveCombatAction({ actor: this.actor, actionKey: target.dataset.actionKey });
  }

  /**
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  `data-item-id`를 가진 시전 버튼
   */
  static async #onNpcActionUse(_event, target) {
    await resolveNpcActionUse({ actor: this.actor, itemId: target.dataset.itemId });
  }

  static async #onUnisonAttack(_event, _target) {
    return performUnisonAttack({ actor: this.actor });
  }

  static async #onItemChat(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await postItemCard(this.actor, item);
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

  static async #onEffectCreate() {
    if (!this.isEditable) return;

    const options = EFFECT_TARGETS.map(
      (t) => `<option value="${t.key}">${game.i18n.localize(t.label)}</option>`,
    ).join("");
    const input = await foundry.applications.api.DialogV2.prompt({
      classes: ["hb-dialog"],
      window: { title: game.i18n.localize("ASTER.effects.add") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.label.name")}</label>
          <input type="text" name="name" value="${game.i18n.localize("ASTER.effects.newName")}" />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.effects.targetLabel")}</label>
          <select name="key">${options}</select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.effects.valueLabel")}</label>
          <input type="number" name="value" value="1" />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.effects.roundsLabel")}</label>
          <input type="number" name="rounds" value="" min="0" />
          <p class="hint">${game.i18n.localize("ASTER.effects.roundsHint")}</p>
        </div>
      `,
      ok: {
        label: game.i18n.localize("ASTER.effects.add"),
        callback: (_e, b) => ({
          name: b.form.elements.name.value.trim(),
          key: b.form.elements.key.value,
          value: Number(b.form.elements.value.value) || 0,
          rounds: Number(b.form.elements.rounds.value) || 0,
        }),
      },
    }).catch(() => null);
    if (!input) return;

    await this.actor.createEmbeddedDocuments("ActiveEffect", [
      buildEffectData({
        ...input,
        name: input.name || game.i18n.localize("ASTER.effects.newName"),
        round: game.combat?.round ?? null,
        combatId: game.combat?.id ?? null,
      }),
    ]);
  }

  static async #onEffectEdit(_event, target) {
    const effect = this.actor.effects.get(target.dataset.effectId);
    effect?.sheet.render(true);
  }

  static async #onEffectDelete(_event, target) {
    if (!this.isEditable) return;
    const effect = this.actor.effects.get(target.dataset.effectId);
    if (!effect) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("ASTER.effects.deleteConfirm") },
      content: `<p>${game.i18n.format("ASTER.effects.deleteMsg", { name: effect.name })}</p>`,
    });
    if (confirmed) await effect.delete();
  }

  static async #onEffectToggle(_event, target) {
    if (!this.isEditable) return;
    const effect = this.actor.effects.get(target.dataset.effectId);
    if (!effect) return;
    await effect.update({ disabled: !effect.disabled });
  }

  static async #onConsumableUse(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await useConsumable(this.actor, item);
  }

  static async #onRevive(_event, _target) {
    await requestRevive(this.actor);
  }

  static async #onEquipmentEquip(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item?.type !== "equipment") return;
    await equipItem(this.actor, item);
  }

  static async #onEquipmentUnequip(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item?.type !== "equipment") return;
    await unequipItem(item);
  }

  static async #onToggleSkill(_event, target) {
    return acquireSkill({ actor: this.actor, skillId: target.dataset.skillId, target });
  }

  static async #onCraftReset(_event, _target) {
    return resetCraft({ actor: this.actor });
  }

  static async #onCraftLockToggle(_event, _target) {
    const locked = this.actor.system.craft?.locked ?? false;
    await this.actor.update({ "system.craft.locked": !locked });
  }

  static async #onCraftItemOpen(_event, _target) {
    await openCraftDialog(this.actor);
  }

  static async #onSpellCast(event, target) {
    const spell = this.actor.items.get(target.dataset.itemId);
    if (!spell) return;
    await castSpell({ actor: this.actor, spell, showDialog: event.shiftKey });
  }

  static async #onSpellCastWithExtra(_event, target) {
    const spell = this.actor.items.get(target.dataset.itemId);
    if (!spell) return;
    await castSpellWithExtra({ actor: this.actor, spell });
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

  static #onAblRoll(event, target) {
    const { ability, label } = target.dataset;
    this.actor.rollAbility(ability, label, { showDialog: event.shiftKey });
  }

  static #onEmoRoll(_event, target) {
    const { label } = target.dataset;
    this.actor.rollEmotion(label, {});
  }

  static async #onAsterStep(_event, target) {
    const key = target.dataset.aster;
    const dir = Number(target.dataset.dir) || 0;
    if (!key || !dir) return;
    const path = `system.aster.${key}.value`;
    const cur = foundry.utils.getProperty(this.actor, path) ?? 0;
    await this.actor.update({ [path]: cur + dir });
  }

  static async #onSubmit(_event, _form, formData) {
    const stripped = stripEffectKeys(
      formData.object,
      this.actor.appliedEffects,
      this.actor,
      this.actor.toObject(),
    );
    await this.actor.update(stripped);
  }
}

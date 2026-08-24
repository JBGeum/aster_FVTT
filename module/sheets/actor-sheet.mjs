import { prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { checkBagCapacity, checkStorageAdd } from "../helpers/inventory-capacity.mjs";
import { equipItem, unequipItem } from "../helpers/equipment.mjs";
import { CRAFT_TREE } from "../helpers/craft-tree.mjs";
import { acquireSkill, resetCraft } from "../helpers/craft-actions.mjs";
import { validateCraft, craftItem, getCraftRequiresBaseList } from "../helpers/craft-item.mjs";
import { resolveCombatAction, resolveNpcActionUse } from "../helpers/combat-actions.mjs";
import { castSpell, castSpellWithExtra } from "../helpers/spell-cast.mjs";
import { performUnisonAttack } from "../helpers/unison.mjs";
import { buildStatusTooltips } from "../helpers/sheet-tooltips.mjs";
import { useConsumable } from "../helpers/consumable.mjs";
import { requestRevive } from "../helpers/revive.mjs";
import { postItemCard } from "../helpers/item-chat.mjs";
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
      asterStep: AsterActorSheet.#onAsterStep,
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
    // 상태이상 칩 호버 툴팁 — PC·NPC 시트 공통(정적 lang 기반).
    context.badstatusTips = buildStatusTooltips();

    if (this.actor.type === "character") {
      prepareCharacterData(this, context);
      prepareItems(this, context);
      prepareInventory(this, context);
      prepareCraft(this, context);
      prepareSpellList(this, context);
      prepareRecord(this, context);
      context.combatContext = buildCombatContext(this);
      context.reviveContext = buildReviveContext(this);
    } else if (this.actor.type === "npc") {
      prepareItems(this, context);
      // unisonReady는 NPC에 설정되지 않으므로 합체기 필드는 자연히 false가 된다.
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
        const combatant = game.combat?.combatants.find((c) => c.actor?.id === this.actor.id);
        if (!combatant) return;
        const value = Number(ev.currentTarget.value);
        await combatant.setFlag("aster", "actionPoint", Number.isFinite(value) ? value : 0);
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

  static async #onFoodSelect(_event, _target) {}

  /**
   * 피크닉. 탐색 페이즈에서만 가능.
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
   * 단순 액션은 즉시 AP 차감 + 채팅, 입력 필요 액션은 다이얼로그.
   */
  static async #onRollDodge(_event, _target) {
    await this.actor.rollDodge();
  }

  /** 명중 굴림 (NPC 전용). */
  static async #onRollHit(_event, _target) {
    await this.actor.rollHit();
  }

  static async #onCombatAction(_event, target) {
    await resolveCombatAction({ actor: this.actor, actionKey: target.dataset.actionKey });
  }

  /**
   * NPC 스킬(npcAction) 시전.
   * AP 진리 원천은 Combatant flag — `system.ap`은 시트 표시·시드 참고용이다.
   *
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  `data-item-id`를 가진 시전 버튼
   */
  static async #onNpcActionUse(_event, target) {
    await resolveNpcActionUse({ actor: this.actor, itemId: target.dataset.itemId });
  }

  /**
   * 합체기 발동. PL이 자기 시트에서 시작 → 페어 → 주속성 → 다이스 → 부속성 자동.
   * 주속성 효과 표는 GM 수동(시스템은 합산값만 안내). 같은 색 페어는 부속성 결정 불가로 차단.
   * 흐름 중 취소 시 flag 변화 없음. 부속성 다이얼로그 취소 시 효과만 미적용(합체기 자체는 완료).
   */
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
    await AsterActorSheet.openCraftDialog(this.actor);
  }

  /**
   * 아이템 제작 다이얼로그. 기존 아이템 드래그 시 빈 칸 자동 채움 + 실시간 비용 표시.
   * 확정 시 검증 → 부족하면 확인(음수 허용) → 자원 차감 + 창고에 신규 아이템 생성.
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
    await castSpell({ actor: this.actor, spell });
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

  static #onAblRoll(event, target) {
    const { ability, label } = target.dataset;
    this.actor.rollAbility(ability, label, { skipDialog: event.shiftKey });
  }

  static #onEmoRoll(_event, target) {
    const { label } = target.dataset;
    this.actor.rollEmotion(label, {});
  }

  /** 원소 친화 증감(±1). 마테리얼은 버튼이 없다(템플릿 제외). */
  static async #onAsterStep(_event, target) {
    const key = target.dataset.aster;
    const dir = Number(target.dataset.dir) || 0;
    if (!key || !dir) return;
    const path = `system.aster.${key}.value`;
    const cur = foundry.utils.getProperty(this.actor, path) ?? 0;
    await this.actor.update({ [path]: cur + dir });
  }

  static async #onSubmit(_event, _form, formData) {
    await this.actor.update(formData.object);
  }
}

/* -------------------------------------------- */
/*  아이템 제작 다이얼로그 헬퍼                 */
/* -------------------------------------------- */

const CRAFT_ITEM_TYPES = ["consumable", "equipment", "bag", "food"];
// material[1..5] 색 키 — 비용/보유 표시용.
const CRAFT_COST_COLORS = ["red", "blue", "green", "yellow", "white"];

/**
 * craftRequires 행 1개의 HTML 문자열. DialogV2가 content의 `<template>`를 새니타이즈로 제거하므로
 * 템플릿 복제 대신 이 함수로 매번 생성한다(추가 버튼·드래그 자동 채움 공용).
 */
function _craftRequiresRowHTML() {
  const L = (k) => game.i18n.localize(k);
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
  return `<div class="craft-requires-row flexrow align-center">
    <select name="requires-base">
      <option value="">${L("ASTER.craft.requiresSelect")}</option>
      ${baseOptions}
    </select>
    <input type="number" name="requires-level" value="0" min="0" style="width:60px;" />
    <button type="button" data-craft-action="removeRequires" title="${L("ASTER.craft.requiresRemove")}">×</button>
  </div>`;
}

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
    </div>
    <div class="craft-cost-preview"></div>
  </div>`;
}

/** 다이얼로그 렌더 후 드롭 영역 + 실시간 비용 리스너 부착. */
function _wireCraftDialog(dialog, actor) {
  // V13 DialogV2 render 콜백 인자가 (event, dialog) 또는 (event, element)로 전달될 수 있어 둘 다 수용.
  const el = dialog?.element ?? dialog;
  if (!el?.querySelector) return;
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

  // craftRequires 동적 행 — 추가·제거를 el 위임 + 캡처 단계로 처리.
  // 캡처 단계: DialogV2가 버블 단계에서 전파를 막아도 클릭을 먼저 받는다(버튼 무반응 회피).
  // 행 생성은 _craftRequiresRowHTML() 문자열 삽입으로 — DialogV2가 `<template>`를 제거하기 때문.
  el.addEventListener(
    "click",
    (event) => {
      const t = event.target;
      if (!t?.closest) return;
      const addBtn = t.closest('[data-craft-action="addRequires"]');
      if (addBtn) {
        event.preventDefault();
        el.querySelector(".craft-requires-rows")?.insertAdjacentHTML(
          "beforeend",
          _craftRequiresRowHTML(),
        );
        return;
      }
      const removeBtn = t.closest('[data-craft-action="removeRequires"]');
      if (removeBtn) {
        event.preventDefault();
        removeBtn.closest(".craft-requires-row")?.remove();
      }
    },
    true,
  );
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
  if (rowsContainer) {
    rowsContainer.innerHTML = "";
    for (const [base, level] of Object.entries(sys.craftRequires ?? {})) {
      rowsContainer.insertAdjacentHTML("beforeend", _craftRequiresRowHTML());
      const row = rowsContainer.lastElementChild;
      const sel = row?.querySelector('select[name="requires-base"]');
      const lvl = row?.querySelector('input[name="requires-level"]');
      if (sel) sel.value = base;
      if (lvl) lvl.value = level;
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

/** 자원·전제 부족 시 그래도 진행할지 확인(음수 허용). */
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

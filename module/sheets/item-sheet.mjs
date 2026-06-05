import { DAMAGE_STATUSES } from "../aster.mjs";
import { AsterActorSheet } from "./actor-sheet.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class AsterItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["aster", "sheet", "item"],
    position: { width: 400, height: 480 },
    window: { resizable: true },
    actions: {
      useConsumable: AsterItemSheet.#onItemConsumableUse,
    },
  };

  static #formConfig = {
    handler: AsterItemSheet.#onSubmit,
    submitOnChange: true,
    closeOnSubmit: false,
  };

  static PARTS = {
    bag: {
      template: "systems/aster/templates/item/item-bag-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    consumable: {
      template: "systems/aster/templates/item/item-consumable-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    equipment: {
      template: "systems/aster/templates/item/item-equipment-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    food: {
      template: "systems/aster/templates/item/item-food-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    spell: {
      template: "systems/aster/templates/item/item-spell-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    feature: {
      template: "systems/aster/templates/item/item-feature-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    record: {
      template: "systems/aster/templates/item/item-record-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
  };

  get title() {
    return this.item.name;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = [this.document.type];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const itemData = this.item.toObject(false);
    context.item = this.item;
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.editable = this.isEditable;
    context.owner = this.item.isOwner;
    context.rollData = this.item.actor?.getRollData() ?? {};
    context.config = CONFIG.ASTER;

    // material[6] 인덱스별 라벨 — 코드에 인덱스 의미가 없어 UI에서 명시(마테리얼 + 적·청·녹·황·백).
    context.materialFields = (this.item.system.material ?? []).map((value, i) => ({
      value,
      label: game.i18n.localize(`ASTER.item.material.label${i}`),
    }));

    if (this.item.type === "consumable") {
      const sys = this.item.system;
      const current = sys.cureStatus ?? [];
      context.cureStatusOptions = DAMAGE_STATUSES.map((s) => ({
        key: s.key,
        label: game.i18n.localize(`ASTER.badstatus.${s.i18n}`),
        checked: current.includes(s.key),
      }));
      // 회복 효과가 하나라도 있을 때만 "사용" 버튼 노출.
      context.showUseButton =
        (sys.healHealth ?? 0) > 0 || current.length > 0 || sys.cureAllStatus === true;
    }

    return context;
  }

  _onRender(_context, _options) {
    super._onRender(_context, _options);

    // cureStatus 다중 체크박스: 같은 name으로 폼 제출 시 FormData가 단일/배열을 일관 처리하지 않아,
    // 체크 상태를 직접 읽어 배열로 update한다 (.craft-res-input 커스텀 리스너 패턴과 동일).
    if (this.item.type === "consumable") {
      const boxes = this.element.querySelectorAll(".cure-status-check");
      for (const box of boxes) {
        box.addEventListener("change", () => {
          const selected = Array.from(boxes)
            .filter((b) => b.checked)
            .map((b) => b.dataset.status);
          this.item.update({ "system.cureStatus": selected });
        });
      }
    }
  }

  static async #onItemConsumableUse(_event, _target) {
    const actor = this.item.parent;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("ASTER.consumable.noActor"));
      return;
    }
    // 효과 적용 + 아이템 삭제는 actor 시트와 공용 로직. 삭제되면 시트는 자동으로 닫힌다.
    await AsterActorSheet.useConsumable(actor, this.item);
  }

  static async #onSubmit(_event, _form, formData) {
    await this.item.update(formData.object);
  }
}

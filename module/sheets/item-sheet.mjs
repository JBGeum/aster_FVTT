const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class AsterItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["aster", "sheet", "item"],
    position: { width: 400, height: 480 },
    window: { resizable: true },
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
      template: "systems/aster/templates/item/item-sheet.html",
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

    return context;
  }

  _onRender(_context, _options) {
    super._onRender(_context, _options);
  }

  static async #onSubmit(_event, _form, formData) {
    await this.item.update(formData.object);
  }
}

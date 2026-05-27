const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class AsterItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["aster", "sheet", "item"],
    position: { width: 400, height: 480 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
  };

  // consumable/equipment/food는 전용 템플릿이 없으므로 item-sheet.html 사용
  static PARTS = {
    bag: { template: "systems/aster/templates/item/item-bag-sheet.html" },
    consumable: { template: "systems/aster/templates/item/item-sheet.html" },
    equipment: { template: "systems/aster/templates/item/item-sheet.html" },
    food: { template: "systems/aster/templates/item/item-sheet.html" },
    spell: { template: "systems/aster/templates/item/item-spell-sheet.html" },
    feature: { template: "systems/aster/templates/item/item-feature-sheet.html" },
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

    return context;
  }

  _onRender(_context, _options) {
    super._onRender(_context, _options);
    // 필요 시 추가 리스너 등록
  }
}

import { BaseItemModel } from "../base-item.mjs";

const fields = foundry.data.fields;

export class EquipmentDataModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      type: new fields.StringField({ initial: "" }),
      size: new fields.ArrayField(new fields.NumberField({ initial: 1, integer: true, min: 1 }), {
        initial: () => [1, 1],
      }),
      container: new fields.StringField({ initial: "" }),
      grid: new fields.SchemaField({
        x: new fields.NumberField({ initial: 0, integer: true }),
        y: new fields.NumberField({ initial: 0, integer: true }),
      }),
    };
  }
}

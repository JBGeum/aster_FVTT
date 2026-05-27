import { BaseItemModel } from "../base-item.mjs";

const fields = foundry.data.fields;

export class ConsumableDataModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      size: new fields.SchemaField({
        w: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
        h: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
      }),
      container: new fields.StringField({ initial: "" }),
      grid: new fields.SchemaField({
        x: new fields.NumberField({ initial: 0, integer: true }),
        y: new fields.NumberField({ initial: 0, integer: true }),
      }),
      timing: new fields.StringField({ initial: "" }),
      mod: new fields.NumberField({ initial: 0, integer: true }),
    };
  }
}

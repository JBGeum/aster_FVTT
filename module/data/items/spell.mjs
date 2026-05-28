import { BaseItemModel } from "../base-item.mjs";

const fields = foundry.data.fields;

export class SpellDataModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(), // material, effect, requirement, description 상속
      ruby: new fields.StringField({ initial: "" }),
      color: new fields.StringField({ initial: "" }), // "red" | "blue" | "green" | "yellow"
      ability: new fields.StringField({ initial: "" }), // active | knowledge | dexterity | worldly
      target: new fields.NumberField({ initial: 7, integer: true }), // 마법 판정 목표치
      alert: new fields.SchemaField({
        min: new fields.NumberField({ initial: 0, integer: true }),
        max: new fields.NumberField({ initial: 0, integer: true }),
      }),
      message: new fields.SchemaField({
        critical: new fields.StringField({ initial: "" }),
        fumble: new fields.StringField({ initial: "" }),
      }),
    };
  }
}

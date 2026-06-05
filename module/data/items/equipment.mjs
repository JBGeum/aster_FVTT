import { BaseItemModel } from "../base-item.mjs";

const fields = foundry.data.fields;

export class EquipmentDataModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      type: new fields.StringField({ initial: "" }),
      size: new fields.SchemaField({
        w: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
        h: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
      }),
      container: new fields.StringField({ initial: "" }),
      grid: new fields.SchemaField({
        x: new fields.NumberField({ initial: 0, integer: true }),
        y: new fields.NumberField({ initial: 0, integer: true }),
      }),

      // C1: 제작 전제 — { [craft 노드 base id]: 최소 레벨 }. 빈 객체면 전제 없음.
      craftRequires: new fields.ObjectField({ initial: () => ({}) }),
    };
  }
}

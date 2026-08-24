import { BaseItemModel } from "../base-item.mjs";

const fields = foundry.data.fields;

export class BagDataModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      storageImg: new fields.StringField({ initial: "" }),
      grid: new fields.SchemaField({
        cols: new fields.NumberField({ initial: 6, integer: true, min: 1 }),
        rows: new fields.NumberField({ initial: 4, integer: true, min: 1 }),
      }),

      // 제작 전제 — { [craft 노드 base id]: 최소 레벨 }. 빈 객체면 전제 없음.
      craftRequires: new fields.ObjectField({ initial: () => ({}) }),
    };
  }
}

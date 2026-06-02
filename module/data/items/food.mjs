import { BaseItemModel } from "../base-item.mjs";

export class FoodDataModel extends BaseItemModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      // 양도 가능한 포만 회복량 (룰북 503)
      restore: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: 0,
        initial: 0,
      }),
      // 양도 불가한 추가효과 — 요리를 만든 PC만 받음 (룰북 503)
      bonusEffect: new fields.StringField({
        required: true,
        nullable: false,
        initial: "",
      }),
    };
  }
}

import { BaseItemModel } from "../base-item.mjs";

export class FoodDataModel extends BaseItemModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      // 양도 가능한 포만 회복량
      restore: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: 0,
        initial: 0,
      }),
      // 양도 불가한 추가효과 — 요리를 만든 PC만 받는다.
      bonusEffect: new fields.StringField({
        required: true,
        nullable: false,
        initial: "",
      }),

      // 제작 전제 — { [craft 노드 base id]: 최소 레벨 }. 빈 객체면 전제 없음.
      craftRequires: new fields.ObjectField({ initial: () => ({}) }),
    };
  }
}

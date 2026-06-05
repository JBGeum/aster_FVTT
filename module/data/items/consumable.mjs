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

      // 회복 효과 (R1) — 합체기 회복 헬퍼(applyHealHealth/applyCureStatus/applyCureAllStatus) 재사용.
      // choices의 5개 키는 aster.mjs DAMAGE_STATUSES와 동기 — 향후 키 추가 시 두 곳 갱신.
      healHealth: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: 0,
        initial: 0,
      }),
      cureStatus: new fields.ArrayField(
        new fields.StringField({
          choices: ["injury", "bigInj", "sleepy", "exhaustion", "hungry"],
        }),
        { initial: [] },
      ),
      // true면 cureStatus 무시하고 5종 전부 회복 (광범위 우선).
      cureAllStatus: new fields.BooleanField({ initial: false }),

      // C1: 제작 전제 — { [craft 노드 base id]: 최소 레벨 }. 빈 객체면 전제 없음.
      craftRequires: new fields.ObjectField({ initial: () => ({}) }),
    };
  }
}

import { BaseActorModel } from "../base-actor.mjs";

const fields = foundry.data.fields;

export class NpcDataModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      cr: new fields.NumberField({ initial: 0, min: 0 }),
      // 이니셔티브 비교용 민첩 — PC는 능력치로 파생되나 NPC는 GM 수동 입력.
      speed: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),

      // 판정 시 new Roll(formula).evaluate()로 평가. 빈 문자열이면 해당 판정 없음.
      hitFormula: new fields.StringField({ initial: "" }), // 명중 (예: "3D6+4")
      dodgeFormula: new fields.StringField({ initial: "" }), // 회피 (예: "2D6+3"). PC dodge 수치와 별개
      apFormula: new fields.StringField({ initial: "" }), // 액션 포인트 (예: "1D6+6")

      // 상태이상 (PC와 동일 5종). DAMAGE_STATUSES 키와 일치해야 회복·대미지 헬퍼가 NPC에도 동작한다.
      badstatus: new fields.SchemaField({
        injury: new fields.BooleanField({ initial: false }),
        bigInj: new fields.BooleanField({ initial: false }),
        sleepy: new fields.BooleanField({ initial: false }),
        exhaustion: new fields.BooleanField({ initial: false }),
        hungry: new fields.BooleanField({ initial: false }),
      }),
    };
  }
}

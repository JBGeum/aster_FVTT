const fields = foundry.data.fields;

// addStatus/cureStatus choices — aster.mjs DAMAGE_STATUSES 5종과 완전 일치.
const STATUS_CHOICES = ["injury", "bigInj", "sleepy", "exhaustion", "hungry"];

/**
 * NPC 스킬(액션) Item 타입. BaseItemModel 비상속 — material·requirement는 무의미.
 * 기계 검증 가능한 효과(대미지·상태이상)는 필드, 자유 표현은 effect/description.
 */
export class NpcActionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // 자유 텍스트
      description: new fields.HTMLField({ initial: "" }),
      effect: new fields.StringField({ initial: "" }),

      // AP 비용 — costVariable=true이면 cost 무시, 시전 시 PL이 X 입력 (룰북 "X" 표기)
      cost: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: 0,
        initial: 0,
      }),
      costVariable: new fields.BooleanField({ initial: false }),

      // 대상 타입 — 표시·검증용. 실제 타게팅은 캔버스에서 한다.
      targetType: new fields.StringField({
        initial: "self",
        choices: ["self", "one", "many", "all"],
      }),

      damageFormula: new fields.StringField({ initial: "" }), // 예: "3D6+4". 빈 문자열이면 대미지 없음
      addStatus: new fields.ArrayField(new fields.StringField({ choices: STATUS_CHOICES }), {
        initial: [],
      }),
      cureStatus: new fields.ArrayField(new fields.StringField({ choices: STATUS_CHOICES }), {
        initial: [],
      }),
      cureAllStatus: new fields.BooleanField({ initial: false }),

      // true면 시전 시 Combatant flag를 검사·설정한다.
      oncePerRound: new fields.BooleanField({ initial: false }),
    };
  }
}

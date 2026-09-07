// @ts-check
import { computeAbilityCheck, formatModifier } from "./ability-check.mjs";

/**
 * 대결(vs) 판정 카드의 렌더 데이터와 `opposedRoll` 플래그를 함께 만든다.
 *
 * @param {object} p
 * @param {{id:string, uuid:string, name:string, type:string}} p.actor
 * @param {string} p.label
 * @param {string} p.ability            플래그 식별자 — 능력키 또는 "dodge"·"hit".
 * @param {number} p.ablValue
 * @param {string|null} [p.formula]     NPC 식. PC는 null이라 템플릿이 능력치 합산 표시로 분기한다.
 * @param {boolean} [p.isDodge]
 * @param {{selected:number[], rawTotal:number}} p.pick
 * @param {{critical:boolean, fumble:boolean}} p.cf
 * @param {{sleepy?:number, satiety?:number, total?:number}} p.penalties
 * @param {number} [p.modifier]
 * @param {boolean} [p.focusApplied]
 * @param {string} p.rollResult
 * @returns {{templateData:object, opposedRoll:object}}
 */
export function buildOpposedCard({
  actor,
  label,
  ability,
  ablValue,
  formula = null,
  isDodge = false,
  pick,
  cf,
  penalties,
  modifier = 0,
  focusApplied = false,
  rollResult,
}) {
  const resultDiceset = pick.selected;
  const total = computeAbilityCheck({
    rawTotal: pick.rawTotal,
    modifier,
    penalties,
    target: null,
  }).achievement;

  return {
    templateData: {
      label,
      ablValue,
      formula,
      result: rollResult,
      total,
      rawTotal: pick.rawTotal,
      penalties,
      modifierText: formatModifier(modifier),
      resultDiceset,
      diceText: resultDiceset.join(", "),
      isCritical: cf.critical,
      isFumble: cf.fumble,
      focusApplied,
      actorId: actor.id,
      actorUuid: actor.uuid,
      actorName: actor.name,
      isPC: actor.type === "character",
      opposed: true, // 전용 카드(roll-critfumble)에서 대결 결합 푸터 유지용
    },
    opposedRoll: {
      actorId: actor.id,
      actorUuid: actor.uuid,
      actorName: actor.name,
      label,
      ability,
      ablValue,
      total,
      dice: resultDiceset,
      isCritical: cf.critical,
      isFumble: cf.fumble,
      isDodge,
    },
  };
}

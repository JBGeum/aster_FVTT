// @ts-check
/**
 * 능력 판정 결과 확정. Foundry Roll 객체와 분리된 순수 함수.
 * @param {object} p
 * @param {number} p.rawTotal        asterRoll 결과 총합. `2d6 + @ablValue`를 한 식으로 굴리므로 능력치가 이미 포함돼 있다.
 * @param {number} [p.modifier]      상황 수정치. 난이도 하향은 달성치 가산으로 표현한다.
 * @param {{sleepy?:number, satiety?:number, total?:number}} [p.penalties]
 *   computePenalties()의 반환을 그대로 넣어도 된다. 기본 { total: 0 }.
 * @param {number|null} p.target     목표치. null이면 성공 판정을 하지 않는다(대결판정).
 * @param {boolean} [p.critical]
 * @param {boolean} [p.fumble]
 * @returns {{achievement:number, success:boolean|null, breakdown:object}}
 */
export function computeAbilityCheck({
  rawTotal,
  modifier = 0,
  penalties = { total: 0 },
  target,
  critical = false,
  fumble = false,
}) {
  const penaltyTotal = penalties.total ?? 0;
  const achievement = rawTotal + modifier + penaltyTotal;
  const success = target == null ? null : critical || (!fumble && achievement >= target);
  return {
    achievement,
    success,
    breakdown: { rawTotal, modifier, penalties, penaltyTotal, target },
  };
}

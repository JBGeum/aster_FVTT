// @ts-check
/**
 * 마법 판정 계산. Foundry Roll 객체와 분리된 순수 함수.
 * @param {object} p
 * @param {number} p.diceTotal       2d6 합(외부에서 굴려 전달)
 * @param {number} p.abilityValue    선택 능력치 total
 * @param {boolean} p.specialty      특기색 일치 여부
 * @param {number[]} [p.extraDice]   아스테르로 추가 굴린 d6 결과 배열(없으면 [])
 * @param {number} p.target          목표치
 * @param {{sleepy?:number, satiety?:number, total?:number}} [p.penalties]
 *   보정 객체. computePenalties()의 반환을 그대로 넣어도 됨. 기본 { total: 0 }.
 * @param {number} [p.modifier]      판정 다이얼로그로 받은 달성치 보정
 * @returns {{ achievement:number, success:boolean, breakdown:object }}
 */
export function computeSpellRoll({
  diceTotal,
  abilityValue,
  specialty,
  extraDice = [],
  target,
  penalties = { total: 0 },
  modifier = 0,
}) {
  const specialtyBonus = specialty ? 1 : 0;
  const extraSum = extraDice.reduce((a, b) => a + b, 0);
  const penaltyTotal = penalties.total ?? 0;
  const achievement =
    diceTotal + abilityValue + specialtyBonus + extraSum + penaltyTotal + modifier;
  return {
    achievement,
    success: achievement >= target,
    breakdown: {
      base: diceTotal,
      ability: abilityValue,
      specialty: specialtyBonus,
      extra: extraSum,
      extraDice,
      target,
      penalties, // 객체 전체 — 카드에서 분기 표시
      penaltyTotal, // 합산 — 카드 요약용
      modifier,
    },
  };
}

export function getAbilityTotal(actor, abilityKey) {
  return actor.system.ability?.[abilityKey]?.total ?? 0;
}

export function isSpecialty(actor, spellColor) {
  const actorColor = actor.system.color ?? "";
  return !!actorColor && actorColor === spellColor;
}

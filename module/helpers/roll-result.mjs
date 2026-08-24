// @ts-check
/**
 * 외부에서 굴린 다이스 결과(number[])를 받아 판단만 하는 순수 함수 모음.
 */

/**
 * 룰: 두 눈 모두 6 → 대성공, 두 눈 모두 1 → 대실패.
 * 3개 이상 굴렸을 경우 호출자가 미리 "고른 2개"를 전달한다.
 *
 * @param {number[]} twoDice 정확히 2개의 d6 결과
 * @returns {{ critical: boolean, fumble: boolean }}
 */
export function detectCritFumble(twoDice) {
  if (!Array.isArray(twoDice) || twoDice.length !== 2) {
    return { critical: false, fumble: false };
  }
  const [a, b] = twoDice;
  return {
    critical: a === 6 && b === 6,
    fumble: a === 1 && b === 1,
  };
}

/**
 * @param {{critical:boolean, fumble:boolean}} cf  detectCritFumble 결과
 * @param {string} fallbackTemplate  crit/fumble이 아닐 때 쓸 평소 카드 경로
 * @returns {string} 렌더할 Handlebars 템플릿 경로
 */
export function critFumbleCardPath(cf, fallbackTemplate) {
  if (cf.critical || cf.fumble) {
    return "systems/aster/templates/chatcard/roll-critfumble.html";
  }
  return fallbackTemplate;
}

/**
 * 룰: 정동판정은 보정 대상 아님 (호출자가 정동판정에서 호출하지 않도록 책임).
 *
 * context.isDodge=true일 때 피로(exhaustion) -3 추가 — 회피 판정에만 적용.
 *
 * fvtt-types의 Actor.system은 커스텀 DataModel 필드를 알지 못해 actor를 구조 타입으로 받는다.
 *
 * @param {{ system: { badstatus?: { sleepy?: boolean, exhaustion?: boolean }, satiety?: { value?: number } } }} actor
 * @param {object} [context]
 * @param {boolean} [context.isDodge=false]  회피 판정 컨텍스트 (피로 -3 적용 여부)
 * @returns {{ sleepy:number, satiety:number, exhaustion:number, total:number }}
 */
export function computePenalties(actor, context = {}) {
  const sleepy = actor.system.badstatus?.sleepy ? -2 : 0;

  const satietyValue = actor.system.satiety?.value ?? 20;
  let satiety = 0;
  if (satietyValue === 0) satiety = -3;
  else if (satietyValue <= 5) satiety = -2;
  else if (satietyValue <= 10) satiety = -1;
  // 11 이상은 0

  const exhaustion = context.isDodge && actor.system.badstatus?.exhaustion ? -3 : 0;

  return {
    sleepy,
    satiety,
    exhaustion,
    total: sleepy + satiety + exhaustion,
  };
}

/**
 * reason 값:
 *  - "activeFumble"       — 능동 대실패 → 수동 자동 승
 *  - "bothCritical"       — 양측 대성공 → 수동 승
 *  - "activeCritical"     — 능동만 대성공 → 능동 승
 *  - "passiveCritical"    — 수동만 대성공 → 수동 승
 *  - "higherAchievement"  — 달성치 우위
 *  - "tieToPassive"       — 동률 (룰북 미명시 기본)
 *
 * @param {object} p
 * @param {number} p.activeAchievement
 * @param {number} p.passiveAchievement
 * @param {{critical:boolean, fumble:boolean}} p.activeCF
 * @param {{critical:boolean, fumble:boolean}} p.passiveCF
 * @returns {{ winner: "active" | "passive", reason: string }}
 */
export function resolveOpposed({ activeAchievement, passiveAchievement, activeCF, passiveCF }) {
  if (activeCF.fumble) return { winner: "passive", reason: "activeFumble" };
  if (activeCF.critical && passiveCF.critical) return { winner: "passive", reason: "bothCritical" };
  if (activeCF.critical) return { winner: "active", reason: "activeCritical" };
  if (passiveCF.critical) return { winner: "passive", reason: "passiveCritical" };
  if (activeAchievement > passiveAchievement)
    return { winner: "active", reason: "higherAchievement" };
  if (passiveAchievement > activeAchievement)
    return { winner: "passive", reason: "higherAchievement" };
  return { winner: "passive", reason: "tieToPassive" };
}

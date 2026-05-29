// @ts-check
/**
 * 판정 결과 헬퍼. Foundry Roll 객체와 분리된 순수 함수.
 * 모든 함수는 외부에서 굴린 다이스 결과(number[])를 입력받아 판단만 수행한다.
 */

/**
 * 대성공/대실패 감지.
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
 * 대결판정 승부 결정.
 * 룰 분기를 사유와 함께 반환한다. 결과 카드에 사유 표시 가능.
 *
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

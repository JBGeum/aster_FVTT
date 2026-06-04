// @ts-check
/**
 * 합체기 주속성 표 (룰북 부록).
 * 합산값(5~11)의 표준 효과 + 특수 케이스(2 자해, 12+)를 정의.
 * 합산 3·4는 정의 없음 → lookup null (실패 텍스트는 G4-γ RollTable에서 처리).
 *
 * - 합산 2: 효과는 정상 적용 + `selfTurnEnd: true` (시전자 2인 다음 라운드 행동완료 안내).
 * - 합산 12+: lookup 함수가 12로 정규화. 적 10/녹 6 단순 대미지, 청 회복+상태이상 전부 치료, 황 무효.
 */
export const UNISON_TABLES = Object.freeze({
  red: {
    2: { type: "damage", amount: 7, targetType: "enemy-single", selfTurnEnd: true },
    5: { type: "damage", amount: 3, targetType: "enemy-single" },
    6: { type: "damage", amount: 3, targetType: "enemy-single" },
    7: { type: "damage", amount: 4, targetType: "enemy-single" },
    8: { type: "damage", amount: 5, targetType: "enemy-single" },
    9: { type: "damage", amount: 6, targetType: "enemy-single" },
    10: { type: "damage", amount: 7, targetType: "enemy-single" },
    11: { type: "damage", amount: 8, targetType: "enemy-single" },
    12: { type: "damage", amount: 10, targetType: "enemy-single" }, // 12+ 정규화
  },
  blue: {
    2: { type: "heal", amount: 8, targetType: "ally-all", selfTurnEnd: true },
    5: { type: "heal", amount: 3, targetType: "ally-all" },
    6: { type: "heal", amount: 5, targetType: "ally-all" },
    7: { type: "heal", amount: 6, targetType: "ally-all" },
    8: { type: "heal", amount: 7, targetType: "ally-all" },
    9: { type: "heal", amount: 7, targetType: "ally-all" },
    10: { type: "heal", amount: 8, targetType: "ally-all" },
    11: { type: "heal", amount: 8, targetType: "ally-all" },
    12: { type: "heal-and-cure-all", amount: 12, targetType: "ally-all" }, // 12+ 특수
  },
  green: {
    2: { type: "damage", amount: 7, targetType: "enemy-single", selfTurnEnd: true },
    5: { type: "damage", amount: 1, targetType: "enemy-all" },
    6: { type: "damage", amount: 2, targetType: "enemy-all" },
    7: { type: "damage", amount: 2, targetType: "enemy-all" },
    8: { type: "damage", amount: 3, targetType: "enemy-all" },
    9: { type: "damage", amount: 3, targetType: "enemy-all" },
    10: { type: "damage", amount: 4, targetType: "enemy-all" },
    11: { type: "damage", amount: 5, targetType: "enemy-all" },
    12: { type: "damage", amount: 6, targetType: "enemy-all" }, // 12+ 정규화
  },
  yellow: {
    2: { type: "damage", amount: 7, targetType: "enemy-single", selfTurnEnd: true },
    5: { type: "damage-reduction", amount: 2, targetType: "ally-all" },
    6: { type: "damage-reduction", amount: 3, targetType: "ally-all" },
    7: { type: "damage-reduction", amount: 3, targetType: "ally-all" },
    8: { type: "damage-reduction", amount: 4, targetType: "ally-all" },
    9: { type: "damage-reduction", amount: 4, targetType: "ally-all" },
    10: { type: "damage-reduction", amount: 5, targetType: "ally-all" },
    11: { type: "damage-reduction", amount: 6, targetType: "ally-all" },
    12: { type: "damage-block", targetType: "ally-all" }, // 12+ 무효 (amount 없음)
  },
});

/**
 * 주속성 표에서 효과 조회.
 * - 합산 2는 selfTurnEnd 메타 포함 (효과는 정상, 자해 안내만 추가).
 * - 합산 3, 4는 정의 없음 → null (호출자가 GM 수동 분기).
 * - 합산 12+는 lookup 내부에서 12로 정규화 (호출자는 합산값 그대로 전달).
 *
 * @param {string} color  주속성 색 ("red" | "blue" | "green" | "yellow" | "black")
 * @param {number} total  다이스 합산값
 * @returns {{type: string, amount?: number, targetType: string, selfTurnEnd?: boolean} | null}
 */
export function lookupUnisonEffect(color, total) {
  const table = UNISON_TABLES[color];
  if (!table) return null;
  // 12+ 정규화 — 합산값이 12 이상이면 12로 처리.
  const lookupKey = total >= 12 ? 12 : total;
  return table[lookupKey] ?? null;
}

// @ts-check
/**
 * 합체기 주속성 표 (룰북 부록).
 * 합산값(5~11)에 대응하는 표준 효과만 정의 — 특수 케이스(2, 3, 4, 12+)는 별도 처리.
 * G4-α 범위: 적·청·녹. 황표는 G4-β에서 추가.
 */
export const UNISON_TABLES = Object.freeze({
  red: {
    5: { type: "damage", amount: 3, targetType: "enemy-single" },
    6: { type: "damage", amount: 3, targetType: "enemy-single" },
    7: { type: "damage", amount: 4, targetType: "enemy-single" },
    8: { type: "damage", amount: 5, targetType: "enemy-single" },
    9: { type: "damage", amount: 6, targetType: "enemy-single" },
    10: { type: "damage", amount: 7, targetType: "enemy-single" },
    11: { type: "damage", amount: 8, targetType: "enemy-single" },
  },
  blue: {
    5: { type: "heal", amount: 3, targetType: "ally-all" },
    6: { type: "heal", amount: 5, targetType: "ally-all" },
    7: { type: "heal", amount: 6, targetType: "ally-all" },
    8: { type: "heal", amount: 7, targetType: "ally-all" },
    9: { type: "heal", amount: 7, targetType: "ally-all" },
    10: { type: "heal", amount: 8, targetType: "ally-all" },
    11: { type: "heal", amount: 8, targetType: "ally-all" },
  },
  green: {
    5: { type: "damage", amount: 1, targetType: "enemy-all" },
    6: { type: "damage", amount: 2, targetType: "enemy-all" },
    7: { type: "damage", amount: 2, targetType: "enemy-all" },
    8: { type: "damage", amount: 3, targetType: "enemy-all" },
    9: { type: "damage", amount: 3, targetType: "enemy-all" },
    10: { type: "damage", amount: 4, targetType: "enemy-all" },
    11: { type: "damage", amount: 5, targetType: "enemy-all" },
  },
  // yellow는 G4-β에서 추가
});

/**
 * 주속성 표에서 효과 조회.
 * 합산값이 표 범위 밖(2, 3, 4, 12+)이거나 정의 없는 색이면 null 반환 → 호출자가 GM 수동 분기.
 *
 * @param {string} color  주속성 색 ("red" | "blue" | "green" | "yellow" | "black")
 * @param {number} total  다이스 합산값
 * @returns {{type: string, amount: number, targetType: string} | null}
 */
export function lookupUnisonEffect(color, total) {
  const table = UNISON_TABLES[color];
  if (!table) return null;
  return table[total] ?? null;
}

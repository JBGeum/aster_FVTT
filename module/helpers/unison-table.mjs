// @ts-check
/**
 * 합산 3·4는 정의 없음 → lookup null (실패 텍스트는 RollTable에서 처리).
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
  const lookupKey = total >= 12 ? 12 : total;
  return table[lookupKey] ?? null;
}

/** 색 키 → RollTable name 접미사 (시스템 식별용 영문). */
const UNISON_TABLE_LABEL = Object.freeze({
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
});

/**
 * RollTable은 초기화 시 compendium에서 world로 import된다.
 *
 * @param {string} color
 * @returns {RollTable | null}
 */
export function getUnisonTable(color) {
  const label = UNISON_TABLE_LABEL[color];
  if (!label) return null;
  return game.tables?.getName(`Unison Table - ${label}`) ?? null;
}

/**
 * RollTable 없거나 매칭 결과 없으면 빈 문자열 (fallback) — 효과 적용과 무관.
 * 12+는 RollTable의 range [12, 99]가 처리하므로 정규화 없이 실제 합산값 전달.
 *
 * @param {string} color
 * @param {number} total  실제 다이스 합산값
 * @returns {string}  플레이버 텍스트 또는 빈 문자열
 */
export function getUnisonDescription(color, total) {
  const table = getUnisonTable(color);
  if (!table) return "";
  const results = table.getResultsForRoll(total);
  if (!results || results.length === 0) return "";
  // V13: 결과 텍스트는 `description`. `text`는 deprecated getter (V15까지 호환).
  return results[0].description ?? results[0].text ?? "";
}

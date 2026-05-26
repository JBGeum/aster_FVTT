/**
 * Aster 기본 능력 판정 굴림.
 * V13: `Roll#evaluate`는 더 이상 `{async: true}` 옵션을 받지 않습니다.
 *
 * @param {number} ablValue
 * @param {object} _rollData
 * @returns {Promise<Roll>}
 */
export async function asterRoll(ablValue, _rollData) {
  const roll = new Roll("2d6 + @ablValue", { ablValue });
  await roll.evaluate();
  return roll;
}

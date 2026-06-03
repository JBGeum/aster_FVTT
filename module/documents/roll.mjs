/**
 * Aster 기본 능력 판정 굴림.
 * V13: `Roll#evaluate`는 더 이상 `{async: true}` 옵션을 받지 않습니다.
 *
 * @param {number} ablValue
 * @param {object} _rollData
 * @param {{baseDice?: number}} [opts]  baseDice는 굴릴 다이스 수 (기본 2, 집중 적용 시 3).
 * @returns {Promise<Roll>}
 */
export async function asterRoll(ablValue, _rollData, { baseDice = 2 } = {}) {
  const roll = new Roll(`${baseDice}d6 + @ablValue`, { ablValue });
  await roll.evaluate();
  return roll;
}

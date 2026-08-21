// @ts-check
/**
 * 정수 범위 [min, max]를 균등하게 굴리는 Roll 식을 만든다.
 * 오프셋은 항상 `min - 1` — 최소치가 1 이하일 때도 범위가 어긋나지 않는다.
 *
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
export function rangeFormula(min, max) {
  const n = max - min + 1;
  if (n === 1) return String(min);
  const offset = min - 1;
  if (offset === 0) return `1d${n}`;
  return `1d${n}${offset > 0 ? `+${offset}` : offset}`;
}

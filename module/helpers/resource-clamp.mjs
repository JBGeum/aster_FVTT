// @ts-check
/**
 * 자원 증감 후 값을 상하한 안으로 맞춘다.
 * 상한은 `max`와 현재값 중 큰 쪽 — 이미 max를 넘긴 값이 증가 조작으로 깎이지 않게 한다.
 *
 * @param {number} before
 * @param {number} delta
 * @param {number} max
 * @returns {{before:number, after:number, delta:number}} delta는 실제 적용된 변화량.
 */
export function clampDelta(before, delta, max) {
  const after = Math.max(0, Math.min(before + delta, Math.max(max, before)));
  return { before, after, delta: after - before };
}

// @ts-check
/**
 * @typedef {{id: string, name: string, value: number, goal: number|null}} Tracker
 */

/**
 * @param {Tracker[]} trackers
 * @param {string} id
 * @param {(t: Tracker) => number} next
 * @returns {{trackers: Tracker[], reached: boolean}}
 */
function replaceValue(trackers, id, next) {
  let reached = false;
  const updated = trackers.map((t) => {
    if (t.id !== id) return t;
    const after = next(t);
    reached = t.goal != null && t.value < t.goal && after >= t.goal;
    return { ...t, value: after };
  });
  return { trackers: updated, reached };
}

/**
 * @param {Tracker[]} trackers
 * @param {string} id
 * @param {number} delta
 * @returns {{trackers: Tracker[], reached: boolean}} reached는 이번 갱신에서 목표에 처음 도달했는지.
 */
export function applyDelta(trackers, id, delta) {
  return replaceValue(trackers, id, (t) => t.value + delta);
}

/**
 * @param {Tracker[]} trackers
 * @param {string} id
 * @param {number} value
 * @returns {{trackers: Tracker[], reached: boolean}} reached는 이번 갱신에서 목표에 처음 도달했는지.
 */
export function applySet(trackers, id, value) {
  return replaceValue(trackers, id, () => value);
}

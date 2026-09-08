// @ts-check

/**
 * @typedef {{red: number, blue: number, green: number, yellow: number, white: number}} Gains
 * @typedef {{actorId: string, name: string, favColor: string|null, gains: Gains,
 *   any: number, bonus: string|null}} Entry
 * @typedef {{names: string[], chips: {color: string, n: number}[], any: number,
 *   bonus: string|null, actorId: string|null}} Row
 */

export const GRANT_COLORS = ["red", "blue", "green", "yellow", "white"];

/** PL이 색을 고르는 자리에는 백을 넣지 않는다. */
export const PICK_COLORS = ["red", "blue", "green", "yellow"];

/**
 * @param {Entry} entry
 * @returns {number}
 */
export function entryTotal(entry) {
  const fixed = GRANT_COLORS.reduce((sum, c) => sum + (entry.gains?.[c] ?? 0), 0);
  return fixed + (entry.any ?? 0);
}

/**
 * 특기 보너스를 더하기 전 입력값으로 판정한다 — 룰의 "1인당 1~5개"는 발생량 규칙이다.
 * @param {Entry[]} entries
 * @returns {{ok: boolean, invalid: {name: string, total: number}[]}}
 */
export function validateGrantEntries(entries) {
  const invalid = entries
    .map((e) => ({ name: e.name, total: entryTotal(e) }))
    .filter((r) => r.total < 1 || r.total > 5);
  return { ok: invalid.length === 0, invalid };
}

/**
 * @param {Entry[]} entries
 * @returns {Entry[]}
 */
export function applySpecialtyBonus(entries) {
  return entries.map((e) => {
    const fav = e.favColor;
    if (!fav || (e.gains?.[fav] ?? 0) <= 0) return { ...e, bonus: null };
    return { ...e, gains: { ...e.gains, [fav]: e.gains[fav] + 1 }, bonus: fav };
  });
}

/**
 * @param {Entry[]} entries
 * @returns {Row[]}
 */
export function buildGrantRows(entries) {
  const chipsOf = (e) =>
    GRANT_COLORS.filter((c) => (e.gains?.[c] ?? 0) > 0).map((c) => ({ color: c, n: e.gains[c] }));

  const first = entries[0];
  const collapsible =
    entries.length > 1 &&
    entries.every(
      (e) =>
        (e.any ?? 0) === 0 &&
        e.bonus == null &&
        GRANT_COLORS.every((c) => (e.gains?.[c] ?? 0) === (first.gains?.[c] ?? 0)),
    );

  if (collapsible) {
    return [
      {
        names: entries.map((e) => e.name),
        chips: chipsOf(first),
        any: 0,
        bonus: null,
        actorId: null,
      },
    ];
  }

  return entries.map((e) => ({
    names: [e.name],
    chips: chipsOf(e),
    any: e.any ?? 0,
    bonus: e.bonus ?? null,
    actorId: e.actorId,
  }));
}

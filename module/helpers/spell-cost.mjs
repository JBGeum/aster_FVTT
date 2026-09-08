// @ts-check

/** 룰 표기 `[X/효과문]의 액션` — X가 AP 수치이거나 "끼어들기"다. */
const COST_TAG = /^\s*\[([^/\]]+)\//;

const INTERRUPT = "끼어들기";

/**
 * @param {string|undefined|null} effect
 * @returns {{ap: number, interrupt: boolean}}
 */
export function parseSpellCost(effect) {
  const match = COST_TAG.exec(effect ?? "");
  if (!match) return { ap: 0, interrupt: false };

  const tag = match[1].trim();
  if (tag === INTERRUPT) return { ap: 0, interrupt: true };
  if (!/^\d+$/.test(tag)) return { ap: 0, interrupt: false };
  return { ap: Number(tag), interrupt: false };
}

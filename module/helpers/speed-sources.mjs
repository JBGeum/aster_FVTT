// @ts-check
/**
 * ActiveEffect가 민첩(`system.speed`)에 더한 몫을 시트 툴팁용 문자열로 만든다.
 * @param {Array<{name?: string, changes?: Array<{key?: string, mode?: number, value?: string|number}>, disabled?: boolean}>} effects
 * @returns {string} `"대쉬 +3, 피로 -3"` — 해당하는 효과가 없으면 빈 문자열
 */
export function formatSpeedSources(effects) {
  const parts = [];
  for (const effect of effects ?? []) {
    if (effect?.disabled) continue;
    for (const change of effect?.changes ?? []) {
      // mode 2 = ACTIVE_EFFECT_MODES.ADD. 곱셈·덮어쓰기는 더한 몫으로 환산할 수 없어 뺀다.
      if (change?.key !== "system.speed" || change?.mode !== 2) continue;
      const delta = Number(change.value);
      if (!Number.isFinite(delta) || delta === 0) continue;
      parts.push(`${effect.name} ${delta > 0 ? "+" : ""}${delta}`);
    }
  }
  return parts.join(", ");
}

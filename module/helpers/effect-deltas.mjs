// @ts-check

/**
 * 효과 이름 옆에 붙일 증감 표기.
 *
 * @param {{key?: string, mode?: number, value?: unknown}[]|null|undefined} changes
 * @returns {string|null}  더하는 값이 없으면 null
 */
export function formatEffectDeltas(changes) {
  const parts = [];
  for (const change of changes ?? []) {
    // mode 2 = ACTIVE_EFFECT_MODES.ADD. 곱셈·덮어쓰기는 더한 몫으로 환산할 수 없어 뺀다.
    if (change?.mode !== 2) continue;
    const delta = Number(change.value);
    if (!Number.isFinite(delta) || delta === 0) continue;
    parts.push(`${delta > 0 ? "+" : ""}${delta}`);
  }
  return parts.length ? parts.join(", ") : null;
}

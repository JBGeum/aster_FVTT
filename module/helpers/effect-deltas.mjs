// @ts-check

/**
 * 효과 이름 옆에 붙일 증감 표기. 대상 라벨은 호출부가 붙인다.
 *
 * @param {{key?: string, mode?: number, value?: unknown}[]|null|undefined} changes
 * @returns {{key: string, text: string}[]}
 */
export function formatEffectDeltas(changes) {
  const parts = [];
  for (const change of changes ?? []) {
    // mode 2 = ACTIVE_EFFECT_MODES.ADD. 곱셈·덮어쓰기는 더한 몫으로 환산할 수 없어 뺀다.
    if (change?.mode !== 2) continue;
    const delta = Number(change.value);
    if (!Number.isFinite(delta) || delta === 0) continue;
    parts.push({ key: change.key ?? "", text: `${delta > 0 ? "+" : ""}${delta}` });
  }
  return parts;
}

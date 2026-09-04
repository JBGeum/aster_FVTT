// @ts-check

/**
 * ActiveEffect가 이번 라운드에 만료됐는지 판정한다.
 *
 * `rounds`가 없는 효과(상태이상 등)는 라운드로 세지 않으므로 만료 대상이 아니다.
 * `startRound`가 없으면 기준이 없어 경과를 셀 수 없다 — 남겨 두고 GM 판단에 맡긴다.
 *
 * @param {number} round  현재 라운드
 * @param {{rounds?: number, startRound?: number}|null|undefined} duration
 * @returns {boolean}
 */
export function isEffectExpired(round, duration) {
  if (!duration?.rounds) return false;
  if (duration.startRound == null) return false;
  return round - duration.startRound >= duration.rounds;
}

/**
 * 라운드 기준이 사라지는 시점(전투 종료)에 남은 라운드 수.
 * 다음 전투가 이 수만큼 다시 세도록 넘겨 주는 값이라, 만료된 효과는 0 이하로 나온다.
 *
 * @param {number} round  기준 라운드
 * @param {{rounds?: number, startRound?: number}|null|undefined} duration
 * @returns {number|null}  rounds 기반이 아니면 null
 */
export function remainingRounds(round, duration) {
  if (!duration?.rounds) return null;
  return duration.rounds - (round - (duration.startRound ?? round));
}

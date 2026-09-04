// @ts-check

/**
 * ActiveEffect가 이번 라운드에 만료됐는지 판정한다.
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
 *
 * @param {number} round  기준 라운드
 * @param {{rounds?: number, startRound?: number}|null|undefined} duration
 * @returns {number|null}  rounds 기반이 아니면 null
 */
export function remainingRounds(round, duration) {
  if (!duration?.rounds) return null;
  return duration.rounds - (round - (duration.startRound ?? round));
}

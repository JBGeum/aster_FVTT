// @ts-check

/**
 * 굴린 다이스 중 일부만 채택했을 때의 달성치.
 * 다이스 합만 교체하므로 굴림 식에 섞인 고정 보정(능력치·NPC 식의 상수)은 그대로 남는다.
 *
 * @param {number} rollTotal        굴림 전체 합 (고정 보정 포함)
 * @param {number[]} allDice        굴린 다이스 전부
 * @param {number[]} selectedDice   달성치에 반영할 다이스
 * @returns {number}
 */
export function rebaseTotal(rollTotal, allDice, selectedDice) {
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  return rollTotal - sum(allDice) + sum(selectedDice);
}

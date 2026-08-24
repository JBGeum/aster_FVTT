/**
 * 집중 효과 조회. Combatant flag를 읽으므로 순수 함수가 아니다.
 */

/**
 * 호출자는 판정을 마친 뒤 반환된 combatant의 flag를 내려 소비 처리한다.
 * 정동판정은 어떤 효과로도 증감되지 않으므로 호출하지 않는다.
 *
 * @param {Actor} actor
 * @returns {{extraDice: 0 | 1, combatant: Combatant | null}}
 */
export function checkFocusEffect(actor) {
  const combat = game.combat;
  if (!combat) return { extraDice: 0, combatant: null };
  const combatant = combat.combatants.find((c) => c.actorId === actor.id);
  if (!combatant) return { extraDice: 0, combatant: null };
  const active = combatant.getFlag("aster", "focusActive") === true;
  return { extraDice: active ? 1 : 0, combatant: active ? combatant : null };
}

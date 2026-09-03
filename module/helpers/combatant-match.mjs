// @ts-check

/**
 * 액터에 해당하는 combatant를 찾는다.
 *
 * 토큰 액터는 tokenId로만 찾고 actorId로 떨어지지 않는다 — 미링크 형제 토큰은 actorId를
 * 공유해서, 폴백하면 남의 combatant를 잡는다.
 *
 * @param {{find: Function}} combatants  배열 또는 Foundry Collection
 * @param {{id: string, token?: {id: string}|null}|null|undefined} actor
 * @returns {any|null}
 */
export function findCombatantFor(combatants, actor) {
  if (!actor) return null;
  const tokenId = actor.token?.id ?? null;
  if (tokenId) return combatants.find((c) => c.tokenId === tokenId) ?? null;
  return combatants.find((c) => c.actorId === actor.id) ?? null;
}

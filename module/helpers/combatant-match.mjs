// @ts-check

/**
 * 원본(월드) 액터로 조회할 때의 후보 목록. 미링크 형제 토큰은 actorId를 공유하므로 여럿이 나온다.
 *
 * @param {{filter: Function}} combatants
 * @param {{id: string}} actor
 * @returns {any[]}
 */
function candidatesByActorId(combatants, actor) {
  return combatants.filter((c) => c.actorId === actor.id);
}

/**
 * 액터에 해당하는 combatant를 찾는다.
 *
 * 토큰 액터는 tokenId로만 찾고 actorId로 떨어지지 않는다 — 미링크 형제 토큰은 actorId를
 * 공유해서, 폴백하면 남의 combatant를 잡는다.
 *
 * 링크된 토큰은 원본과 같은 액터를 가리키므로 원본 시트의 조작 대상으로 맞다.
 * 그래도 가릴 수 없는 경우는 hasAmbiguousCombatants가 판정한다.
 *
 * @param {{find: Function, filter: Function}} combatants  배열 또는 Foundry Collection
 * @param {{id: string, token?: {id: string}|null}|null|undefined} actor
 * @returns {any|null}
 */
export function findCombatantFor(combatants, actor) {
  if (!actor) return null;
  const tokenId = actor.token?.id ?? null;
  if (tokenId) return combatants.find((c) => c.tokenId === tokenId) ?? null;

  const mine = candidatesByActorId(combatants, actor);
  if (mine.length <= 1) return mine[0] ?? null;
  return mine.find((c) => c.token?.actorLink) ?? mine[0];
}

/**
 * 원본 액터로 조회했을 때 어느 토큰을 뜻하는지 가릴 수 없는 상태인지.
 * 링크 선호를 적용하고도 후보가 둘 이상 남으면 참 — 토큰 링크 설정이 빠졌다는 신호다.
 *
 * @param {{filter: Function}} combatants
 * @param {{id: string, token?: {id: string}|null}|null|undefined} actor
 * @returns {boolean}
 */
export function hasAmbiguousCombatants(combatants, actor) {
  if (!actor || actor.token?.id) return false;
  const mine = candidatesByActorId(combatants, actor);
  const linked = mine.filter((c) => c.token?.actorLink);
  return linked.length > 1 || (linked.length === 0 && mine.length > 1);
}

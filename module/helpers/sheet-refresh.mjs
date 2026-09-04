/**
 * 액터와 연결돼 열려 있는 시트를 재렌더.
 *
 * @param {Actor|null|undefined} actor
 */
export function refreshActorSheet(actor) {
  if (!actor) return;
  if (actor.sheet?.rendered) actor.sheet.render(false);
  const base = actor.isToken ? actor.token?.baseActor : null;
  if (base?.sheet?.rendered) base.sheet.render(false);
}

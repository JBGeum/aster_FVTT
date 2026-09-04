/**
 * 액터와 연결돼 열려 있는 시트를 재렌더.
 * 미링크 토큰의 합성 액터와 원본 액터는 시트 인스턴스가 별개라 양쪽을 본다.
 *
 * @param {Actor|null|undefined} actor
 */
export function refreshActorSheet(actor) {
  if (!actor) return;
  if (actor.sheet?.rendered) actor.sheet.render(false);
  const base = actor.isToken ? actor.token?.baseActor : null;
  if (base?.sheet?.rendered) base.sheet.render(false);
}

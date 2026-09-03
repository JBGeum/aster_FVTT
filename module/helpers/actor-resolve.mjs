/**
 * uuid로 액터를 해소하고, 없으면 id로 떨어진다.
 *
 * 미링크 토큰의 합성 액터는 id가 베이스와 같아 game.actors.get으로는 원본이 잡힌다.
 * id 폴백은 uuid가 없던 시절의 채팅 카드를 위한 것이다.
 * strict를 끄지 않으면 fromUuidSync가 해소 실패에 null 대신 throw해 폴백이 닫힌다.
 *
 * @param {{uuid?: string|null, id?: string|null}} ref
 * @returns {Actor|null}
 */
export function resolveActor({ uuid, id }) {
  if (uuid) {
    const doc = foundry.utils.fromUuidSync(uuid, { strict: false });
    if (doc) return doc;
  }
  return id ? game.actors.get(id) : null;
}

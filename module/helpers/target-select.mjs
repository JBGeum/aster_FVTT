/**
 * Foundry 캔버스에서 사용자가 사전 타겟팅(Shift+클릭 등)한 토큰을 가져온다.
 * 검증 실패 시 경고 토스트 + null 반환 → 호출자가 종료 결정.
 *
 * 사용 패턴:
 *   const targets = getTargetedTokens({ required: true, max: 1 });
 *   if (!targets) return;  // 검증 실패 (경고 이미 출력됨)
 *   const enemy = targets[0];
 *
 * @param {object} [opts]
 * @param {boolean} [opts.required=true]  타겟 필수 여부 (false면 빈 배열도 허용)
 * @param {number} [opts.max=1]           최대 타겟 수. 초과 시 검증 실패.
 * @param {number} [opts.min=1]           required=true일 때의 최소 타겟 수.
 * @param {"any"|"character"|"npc"} [opts.allowedTypes="any"]  허용 액터 타입.
 * @returns {Token[]|null}  검증 통과 시 토큰 배열, 실패 시 null.
 */
export function getTargetedTokens({
  required = true,
  max = 1,
  min = 1,
  allowedTypes = "any",
} = {}) {
  const targets = Array.from(game.user?.targets ?? []);

  if (targets.length === 0) {
    if (!required) return []; // 선택적이면 빈 배열 반환
    ui.notifications.warn(game.i18n.localize("ASTER.target.noTarget"));
    return null;
  }

  if (targets.length > max) {
    ui.notifications.warn(game.i18n.format("ASTER.target.tooMany", { max, n: targets.length }));
    return null;
  }

  if (required && targets.length < min) {
    ui.notifications.warn(game.i18n.format("ASTER.target.tooFew", { min, n: targets.length }));
    return null;
  }

  if (allowedTypes !== "any") {
    const invalid = targets.filter((t) => t.actor?.type !== allowedTypes);
    if (invalid.length > 0) {
      ui.notifications.warn(
        game.i18n.format("ASTER.target.wrongType", {
          allowed: allowedTypes,
          names: invalid.map((t) => t.name).join(", "),
        }),
      );
      return null;
    }
  }

  return targets;
}

/**
 * 타겟 토큰들의 표시용 정보 추출 (채팅 카드 작성 시 사용).
 *
 * @param {Token[]} tokens
 * @returns {Array<{id:string, name:string, actorId:string|null}>}
 */
export function describeTargets(tokens) {
  return tokens.map((t) => ({
    id: t.id,
    name: t.name,
    actorId: t.actor?.id ?? null,
  }));
}

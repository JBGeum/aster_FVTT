// @ts-check

/**
 * Effects 탭에 읽기 전용으로 싣는 전투 상태 목록. 켜진 것만 담는다.
 *
 * @param {{inCombat?: boolean, damageReduction?: number, damageBlocked?: boolean,
 *   defendActive?: boolean, focusActive?: boolean, unisonReady?: boolean,
 *   dashPending?: number, unisonGreenPending?: number}|null|undefined} ctx
 *   buildCombatContext의 반환값.
 * @returns {{label: string, detail?: string, value?: number}[]}
 */
export function buildCombatStateRows(ctx) {
  if (!ctx?.inCombat) return [];

  const rows = [];
  if ((ctx.damageReduction ?? 0) > 0) {
    rows.push({ label: "ASTER.combat.state.damageReduction", value: ctx.damageReduction });
  }
  if (ctx.damageBlocked) {
    rows.push({ label: "ASTER.combat.state.damageBlocked", detail: "ASTER.effects.blockedDetail" });
  }
  if (ctx.defendActive) {
    rows.push({ label: "ASTER.combat.state.defendActive", detail: "ASTER.combat.defendEffect" });
  }
  if (ctx.focusActive) {
    rows.push({ label: "ASTER.combat.state.focusActive", detail: "ASTER.combat.focusEffect" });
  }
  if (ctx.unisonReady) {
    rows.push({
      label: "ASTER.combat.state.unisonReady",
      detail: "ASTER.combat.unisonPrepareEffect",
    });
  }
  if (ctx.dashPending) {
    rows.push({ label: "ASTER.combat.state.dashPending", value: ctx.dashPending });
  }
  if (ctx.unisonGreenPending) {
    rows.push({ label: "ASTER.combat.state.unisonGreenPending", value: ctx.unisonGreenPending });
  }
  return rows;
}

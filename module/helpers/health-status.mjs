/**
 * 데미지·회복·상태이상 적용 로직.
 * 건강 차감·회복, 상태이상 부여·해제, 방어/황표 감소를 일관된 인터페이스로 제공한다.
 */

// 대미지 다이얼로그의 상태이상 목록 — { key: badstatus 필드, i18n: ASTER.badstatus.* 키 }.
// 필드명과 i18n 키가 다른 항목(bigInj→biginj) 때문에 매핑을 명시한다.
// 합체기 부속성 처리도 같은 목록을 참조하므로 export.
export const DAMAGE_STATUSES = [
  { key: "injury", i18n: "injury" },
  { key: "bigInj", i18n: "biginj" },
  { key: "sleepy", i18n: "sleepy" },
  { key: "exhaustion", i18n: "exhaustion" },
  { key: "hungry", i18n: "hungry" },
];

/**
 * 상태이상 회복 — 지정 키를 false로 갱신.
 * AE 동기 hook이 false → AE 자동 제거를 처리한다.
 *
 * @param {Actor[]} actors  대상 액터 배열
 * @param {string} statusKey  상태이상 키 (injury, sleepy 등)
 * @returns {Promise<Array<{actorName: string, cured: boolean}>>}
 *   cured=true: 실제 회복(이전 true), false: 변화 없음(이전 false).
 */
export async function applyCureStatus(actors, statusKey) {
  const results = [];
  for (const actor of actors) {
    const current = actor.system.badstatus?.[statusKey] ?? false;
    if (current) {
      await actor.update({ [`system.badstatus.${statusKey}`]: false });
      results.push({ actorName: actor.name, cured: true });
    } else {
      results.push({ actorName: actor.name, cured: false });
    }
  }
  return results;
}

/**
 * 5가지 상태이상 모두 회복 — 청표 12+의 일괄 처리.
 * applyCureStatus를 각 상태이상 키로 호출하지 않고 *단일 update*로 일괄 처리 (성능 + 단일 트랜잭션).
 * false→true 변화 없는 키는 update 객체에 포함 안 됨 (변화 없으면 무 hook).
 *
 * @param {Actor[]} actors  대상 액터 배열
 * @returns {Promise<Array<{actorName: string, curedKeys: string[]}>>}
 */
export async function applyCureAllStatus(actors) {
  const results = [];
  for (const actor of actors) {
    const curedKeys = [];
    const update = {};
    for (const def of DAMAGE_STATUSES) {
      const current = actor.system.badstatus?.[def.key] ?? false;
      if (current) {
        update[`system.badstatus.${def.key}`] = false;
        curedKeys.push(def.key);
      }
    }
    if (Object.keys(update).length > 0) {
      await actor.update(update);
    }
    results.push({ actorName: actor.name, curedKeys });
  }
  return results;
}

/**
 * 건강 회복 — actor 배열의 system.health.value를 amount만큼 증가 (max 클램프).
 *
 * 전투(climax 페이즈) 중 건강 0 PC는 건강 회복 효과를 받지 못한다.
 * 차단된 actor는 결과에 blocked: true로 표시 — 호출자가 카드에 안내. 상태이상 회복은 차단 대상이 아님.
 *
 * @param {Actor[]} actors  대상 액터 배열
 * @param {number} amount  회복량
 * @returns {Promise<Array<{actorName: string, before: number, after: number, delta: number, blocked?: boolean}>>}
 */
export async function applyHealHealth(actors, amount) {
  if (amount <= 0) return [];

  // 전투 중(climax) 건강 0 차단.
  const inClimax = game.settings.get("aster", "currentPhase") === "climax";

  const results = [];
  for (const actor of actors) {
    const before = actor.system.health?.value ?? 0;

    if (inClimax && before === 0) {
      results.push({ actorName: actor.name, before: 0, after: 0, delta: 0, blocked: true });
      continue;
    }

    const max = actor.system.health?.max ?? 999;
    const after = Math.min(max, before + amount);
    if (after !== before) {
      await actor.update({ "system.health.value": after });
    }
    results.push({
      actorName: actor.name,
      before,
      after,
      delta: after - before,
    });
  }
  return results;
}

/**
 * 방어 차감 처리. 대상의 Combatant에 defendActive flag가 있으면 1d6 굴려 amount 차감 후 flag 해제.
 *
 * @param {Actor} targetActor
 * @param {number} amount
 * @returns {Promise<{roll: number, original: number, adjusted: number} | null>}
 *   차감이 일어났으면 결과 객체, 아니면 null (Combat 없음·Combatant 없음·flag 없음).
 */
async function applyDefendReduction(targetActor, amount) {
  const combat = game.combat;
  if (!combat) return null;
  const combatant = combat.combatants.find((c) => c.actor?.id === targetActor.id);
  if (!combatant) return null;
  if (combatant.getFlag("aster", "defendActive") !== true) return null;

  const roll = new Roll("1d6");
  await roll.evaluate();
  const reduction = roll.total;
  const adjusted = Math.max(0, amount - reduction);

  await combatant.setFlag("aster", "defendActive", false);

  return { roll: reduction, original: amount, adjusted };
}

/**
 * 황표 수신 감소·무효 처리.
 * Combatant flag damageReduction(N) 또는 damageBlocked(true) 확인.
 * 방어(`defendActive`, 한 번 소비)와 달리 *1라운드 동안 모든 대미지에 적용* — flag 유지.
 * `_startRound`에서 라운드 시작 시 일괄 해제.
 * - damageBlocked(12+): amount = 0 (완전 무효, 무효 우선).
 * - damageReduction(5~11): amount -= N.
 *
 * @param {Actor} targetActor
 * @param {number} amount
 * @returns {Promise<{type: "block"|"reduction", original: number, reduction?: number, adjusted: number} | null>}
 */
async function applyYellowReduction(targetActor, amount) {
  const combat = game.combat;
  if (!combat) return null;
  const combatant = combat.combatants.find((c) => c.actor?.id === targetActor.id);
  if (!combatant) return null;

  // 무효(12+) 우선 — boolean flag
  if (combatant.getFlag("aster", "damageBlocked") === true) {
    return { type: "block", original: amount, adjusted: 0 };
  }

  // 감소(5~11) — number flag
  const reduction = combatant.getFlag("aster", "damageReduction") ?? 0;
  if (reduction > 0) {
    const adjusted = Math.max(0, amount - reduction);
    return { type: "reduction", original: amount, reduction, adjusted };
  }

  return null;
}

/**
 * 건강 차감 + 상태이상 부여. 상태이상은 false→true만 (AE 자동 동기).
 * amount > 0이면 방어 차감(`defendActive`) 자동 적용 — 상태이상만 부여 시 방어 미소비(룰 정합).
 *
 * @param {Actor} targetActor
 * @param {number} amount
 * @param {string[]} statusList
 * @returns {Promise<{hBefore: number, hAfter: number, statusApplied: string[], defendReduced: {roll:number,original:number,adjusted:number}|null, yellowReduction: {type:"block"|"reduction",original:number,reduction?:number,adjusted:number}|null}>}
 */
export async function applyDamageAndStatus(targetActor, amount, statusList) {
  const hBefore = targetActor.system.health?.value ?? 0;
  let hAfter = hBefore;

  let defendReduced = null;
  if (amount > 0) {
    defendReduced = await applyDefendReduction(targetActor, amount);
    if (defendReduced) amount = defendReduced.adjusted;
  }

  // 황표 수신 감소·무효는 방어 차감 *후* 적용한다.
  let yellowReduction = null;
  if (amount > 0) {
    yellowReduction = await applyYellowReduction(targetActor, amount);
    if (yellowReduction) amount = yellowReduction.adjusted;
  }

  if (amount > 0 && hBefore > 0) {
    hAfter = Math.max(0, hBefore - amount);
    await targetActor.update({ "system.health.value": hAfter });
  }

  const statusApplied = [];
  const statusUpdate = {};
  for (const key of statusList) {
    if (!(targetActor.system.badstatus?.[key] ?? false)) {
      statusUpdate[`system.badstatus.${key}`] = true;
      statusApplied.push(key);
    }
  }
  if (Object.keys(statusUpdate).length > 0) await targetActor.update(statusUpdate);

  return { hBefore, hAfter, statusApplied, defendReduced, yellowReduction };
}

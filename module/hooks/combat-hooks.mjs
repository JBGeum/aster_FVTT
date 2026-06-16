/**
 * 전투 훅 — 전투원 추가/제거·라운드 시작/종료 시 시트 동기화, Combat Tracker AP 표시.
 * import 시 top-level에서 Hooks.on(...)을 등록한다(부수효과).
 */
import { AsterCombat } from "../documents/combat.mjs";

/** 열려 있는 단일 액터 시트를 재렌더 (combat 탭의 전투 중 여부·AP 동기화용). */
function refreshActorSheet(actor) {
  const sheet = actor?.sheet;
  if (sheet?.rendered) sheet.render(false);
}

/** 전투에 속한 모든 전투원의 액터 시트를 재렌더. 전투 시작/종료 시 사용. */
function refreshCombatSheets(combat) {
  for (const c of combat?.combatants ?? []) refreshActorSheet(c.actor);
}

// 액터 추가 시 자동 이니셔티브(=민첩). GM만 처리해 중복 update 방지.
// 시트 재렌더는 모든 클라이언트에서 (combat 탭의 전투 중 표시 동기화).
Hooks.on("createCombatant", async (combatant) => {
  refreshActorSheet(combatant.actor);
  if (!game.user.isGM) return;
  const combat = combatant.parent;
  if (!combat?._autoRollInitiative) return;
  await combat._autoRollInitiative(combatant.id);
});

// 전투원 제거 시 해당 액터 시트 재렌더 (전투 중 표시 해제).
Hooks.on("deleteCombatant", (combatant) => {
  refreshActorSheet(combatant.actor);
});

// 라운드 시작 처리(이니셔티브 갱신 + 액션 포인트 굴림 + 채팅 카드)는
// AsterCombat._onStartRound 오버라이드가 담당한다 — `combatRound`/`combatStart` 훅은
// nextRound의 turn=0 커밋 "이전"에 발화해, 그 안에서 combatant를 수정하면 turn 포인터가
// 직전 라운드 마지막 전투원에 고정되는 버그가 있었다(C>C>C). 라이프사이클 메서드는
// turn 확정 이후 발화하므로 안전하다.
// combatStart 훅은 전투원 시트 재렌더("전투 중" 상태 즉시 반영, 모든 클라이언트)만 담당.
Hooks.on("combatStart", (combat) => {
  if (combat instanceof AsterCombat) refreshCombatSheets(combat);
});

// 전투 종료 시 큰부상 → 부상 전이 (행동완료 시 부상 감소는 AsterCombat._onEndTurn 오버라이드가 처리).
// 전투원 시트를 재렌더해 "전투 중" 상태 해제를 즉시 반영 (모든 클라이언트).
Hooks.on("deleteCombat", async (combat) => {
  if (!(combat instanceof AsterCombat)) return;
  refreshCombatSheets(combat);
  await combat._endCombat();
});

// Combatant flag(AP 등) 변경 시 해당 액터 시트 재렌더 — AP는 Combatant 문서에 있어
// Actor 시트가 자동 갱신되지 않으므로 combat 탭의 AP 표시를 수동 동기화.
Hooks.on("updateCombatant", (combatant, changes) => {
  if (!changes.flags?.aster) return;
  refreshActorSheet(combatant.actor);
});

// Combat Tracker 각 PC 행에 액션 포인트 표시 (flag 변경 시 자동 재렌더로 갱신).
Hooks.on("renderCombatTracker", (_app, element) => {
  const combat = game.combat;
  if (!combat) return;
  // V13 ApplicationV2: element는 HTMLElement.
  for (const row of element.querySelectorAll(".combatant")) {
    const id = row.dataset.combatantId;
    if (!id) continue;
    const c = combat.combatants.get(id);
    if (c?.actor?.type !== "character") continue;
    const ap = c.getFlag("aster", "actionPoint");
    if (ap == null) continue;

    let apEl = row.querySelector(".aster-ap");
    if (!apEl) {
      apEl = document.createElement("span");
      apEl.classList.add("aster-ap");
      apEl.title = game.i18n.localize("ASTER.combat.actionPoints");
      (row.querySelector(".token-initiative") ?? row).appendChild(apEl);
    }
    apEl.textContent = `AP ${ap}`;
  }
});

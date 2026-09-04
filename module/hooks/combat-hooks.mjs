/**
 * import 시 top-level에서 Hooks.on(...)을 등록한다(부수효과).
 */
import { AsterCombat } from "../documents/combat.mjs";
import { refreshActorSheet } from "../helpers/sheet-refresh.mjs";

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

Hooks.on("deleteCombatant", (combatant) => {
  refreshActorSheet(combatant.actor);
});

// 라운드 시작 처리는 AsterCombat._onStartRound가 담당한다 — `combatRound`/`combatStart` 훅은
// nextRound의 turn=0 커밋 이전에 발화해, 그 안에서 combatant를 수정하면 turn 포인터가 흔들린다.
// 여기서는 전투원 시트 재렌더만 담당한다.
Hooks.on("combatStart", (combat) => {
  if (combat instanceof AsterCombat) refreshCombatSheets(combat);
});

Hooks.on("deleteCombat", async (combat) => {
  if (!(combat instanceof AsterCombat)) return;
  refreshCombatSheets(combat);
  await combat._endCombat();
});

// Combatant flag(AP 등) 변경 시 해당 액터 시트 재렌더 — AP는 Combatant 문서에 있어
// Actor 시트가 자동 갱신되지 않으므로 combat 탭의 AP 표시를 수동 동기화.
Hooks.on("updateCombatant", (combatant, changes) => {
  const changed = changes.flags?.aster;
  if (!changed) return;
  // unisonReady만 남의 시트 버튼을 좌우한다 — 나머지는 당사자 시트로 충분.
  if ("unisonReady" in changed) refreshCombatSheets(combatant.parent);
  else refreshActorSheet(combatant.actor);
});

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

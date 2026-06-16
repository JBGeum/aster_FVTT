/**
 * 소생 요청 + 결과 카드.
 */

/**
 * 협력 회복 흐름 (R2, 룰북 535) — 탐색 중 PC 전원(행동불능 PC 본인 포함) 포만 -2 후 본인 건강 1로 회복.
 * 모든 검증(페이즈·행동불능·포만)을 다이얼로그 *전*에 끝내 진행 후 실패가 없도록 한다.
 * R1 useConsumable과 같은 공용 static 함수 패턴.
 * @param {Actor} fallenActor  행동불능 상태인 PC
 */
export async function requestRevive(fallenActor) {
  if (!fallenActor) return;

  // 1. 페이즈 — 탐색 중만. 클라이막스(전투)는 룰북 537 차단 안내, 그 외 페이즈는 탐색 전용 안내.
  const phase = game.settings.get("aster", "currentPhase");
  if (phase !== "exploration") {
    const key =
      phase === "climax" ? "ASTER.revive.inCombatBlocked" : "ASTER.revive.explorationOnly";
    ui.notifications.warn(game.i18n.localize(key));
    return;
  }

  // 2. 행동불능(건강 0) 확인
  if ((fallenActor.system.health?.value ?? 0) !== 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.revive.notFallen"));
    return;
  }

  // 3. 대상 PC 전체 — 룰북 "전원"(행동불능 PC 본인 포함)
  const allPCs = game.actors.filter((a) => a.type === "character");
  if (allPCs.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.revive.noActors"));
    return;
  }

  // 4. 포만 부족 검사 — 한 명이라도 < 2면 차단 (본인이 원인일 수도 있음)
  const insufficient = allPCs.filter((a) => (a.system.satiety?.value ?? 0) < 2);
  if (insufficient.length > 0) {
    ui.notifications.warn(
      game.i18n.format("ASTER.revive.satietyInsufficient", {
        actors: insufficient.map((a) => a.name).join(", "),
      }),
    );
    return;
  }

  // 5. 확인 다이얼로그 — content는 인라인(코드베이스 다이얼로그 관례)
  const rows = allPCs
    .map((a) => {
      const before = a.system.satiety?.value ?? 0;
      return `<li><strong>${a.name}</strong>: ${before} → <span class="after">${before - 2}</span></li>`;
    })
    .join("");
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ASTER.revive.confirmTitle") },
    content: `<div class="revive-confirm">
      <p>${game.i18n.localize("ASTER.revive.confirmIntro1")}</p>
      <p><strong>${fallenActor.name}</strong>${game.i18n.localize("ASTER.revive.confirmIntro2")}</p>
      <p class="cost-intro">${game.i18n.localize("ASTER.revive.confirmCost")}</p>
      <ul class="satiety-preview">${rows}</ul>
      <p class="proceed-q">${game.i18n.localize("ASTER.revive.confirmProceed")}</p>
    </div>`,
  }).catch(() => false);
  if (!confirmed) return;

  // 6. 포만 -2 일괄 + 건강 1 갱신
  const satietyResults = [];
  for (const pc of allPCs) {
    const before = pc.system.satiety?.value ?? 0;
    const after = before - 2; // 검사 통과했으니 >= 0
    await pc.update({ "system.satiety.value": after });
    satietyResults.push({ name: pc.name, before, after });
  }
  await fallenActor.update({ "system.health.value": 1 });

  // 7. 결과 카드
  await renderReviveCard(fallenActor, satietyResults);
}

async function renderReviveCard(fallenActor, satietyResults) {
  const cardData = {
    title: game.i18n.localize("ASTER.revive.cardTitle"),
    fallenLine: game.i18n.format("ASTER.revive.fallenLine", { name: fallenActor.name }),
    satietyLines: satietyResults.map((r) =>
      game.i18n.format("ASTER.revive.satietyLine", {
        name: r.name,
        before: r.before,
        after: r.after,
      }),
    ),
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/revive-card.html",
    cardData,
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: fallenActor }),
  });
}

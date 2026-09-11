/**
 * 모든 검증(GM·페이즈·행동불능·포만)을 다이얼로그 *전*에 끝내 진행 후 실패가 없도록 한다.
 * @param {Actor} fallenActor  행동불능 상태인 PC
 */
export async function requestRevive(fallenActor) {
  if (!fallenActor) return;

  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("ASTER.revive.gmOnly"));
    return;
  }

  const phase = game.settings.get("aster", "currentPhase");
  if (phase !== "exploration") {
    const key =
      phase === "climax" ? "ASTER.revive.inCombatBlocked" : "ASTER.revive.explorationOnly";
    ui.notifications.warn(game.i18n.localize(key));
    return;
  }

  if ((fallenActor.system.health?.value ?? 0) !== 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.revive.notFallen"));
    return;
  }

  // 룰북 "전원" — 행동불능 PC 본인도 포만을 낸다.
  const allPCs = game.actors.filter((a) => a.type === "character");
  if (allPCs.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.revive.noActors"));
    return;
  }

  const insufficient = allPCs.filter((a) => (a.system.satiety?.value ?? 0) < 2);
  if (insufficient.length > 0) {
    ui.notifications.warn(
      game.i18n.format("ASTER.revive.satietyInsufficient", {
        actors: insufficient.map((a) => a.name).join(", "),
      }),
    );
    return;
  }

  const rows = allPCs
    .map((a) => {
      const before = a.system.satiety?.value ?? 0;
      return `<li><strong>${a.name}</strong>: ${before} → <span class="after">${before - 2}</span></li>`;
    })
    .join("");
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["hb-dialog"],
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

  const satietyResults = [];
  for (const pc of allPCs) {
    const before = pc.system.satiety?.value ?? 0;
    const after = before - 2; // 검사 통과했으니 >= 0
    await pc.update({ "system.satiety.value": after });
    satietyResults.push({ name: pc.name, before, after });
  }
  await fallenActor.update({ "system.health.value": 1 });

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

/** GM 패널 "장면 이동" 흐름. UI 오케스트레이션이라 타입 검사 대상이 아니다. */

/**
 * 탐색 페이즈에서 이동 시 포만 -1 (배고픔이면 -2).
 * 장면 이동 자체는 페이즈를 가리지 않으므로 버튼은 항상 열어두고 효과만 페이즈로 가른다.
 */
export async function runSceneTransition() {
  const characters = game.actors.filter((a) => a.type === "character");
  if (characters.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.scene.noCharacters"));
    return;
  }

  const rows = characters
    .map(
      (a) => `
      <div class="form-group scene-target-row">
        <label>
          <input type="checkbox" name="target" value="${a.id}" checked />
          ${a.name}
        </label>
      </div>`,
    )
    .join("");

  const selectedIds = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("ASTER.scene.transitionTitle") },
    content: `
      <p class="scene-hint">${game.i18n.localize("ASTER.scene.transitionHint")}</p>
      ${rows}
    `,
    ok: {
      label: game.i18n.localize("ASTER.scene.confirm"),
      callback: (_e, b) =>
        Array.from(b.form.querySelectorAll('input[name="target"]:checked')).map((el) => el.value),
    },
  }).catch(() => null);

  if (selectedIds === null) return; // 취소
  if (selectedIds.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.scene.noSelection"));
    return;
  }

  const phase = game.settings.get("aster", "currentPhase");
  const isExploration = phase === "exploration";

  const changes = [];
  for (const id of selectedIds) {
    const actor = game.actors.get(id);
    if (!actor) continue;

    const satBefore = actor.system.satiety?.value ?? 0;
    await actor._decreaseSatietyIfExploration();
    const satAfter = actor.system.satiety?.value ?? 0;

    const injury = await actor._applyInjuryHealthLossIfExploration();

    changes.push({
      actorName: actor.name,
      satietyBefore: satBefore,
      satietyAfter: satAfter,
      satietyDelta: satAfter - satBefore,
      injuryApplied: injury.applied,
      healthBefore: injury.before,
      healthAfter: injury.after,
      healthDelta: injury.delta,
      healthZero: injury.applied && injury.after === 0,
    });
  }

  const listHtml = changes
    .map((c) => {
      const lines = [];
      lines.push(
        c.satietyDelta === 0
          ? game.i18n.localize("ASTER.scene.noChange")
          : game.i18n.format("ASTER.scene.satietyLine", {
              before: c.satietyBefore,
              after: c.satietyAfter,
              delta: c.satietyDelta,
            }),
      );
      if (c.injuryApplied) {
        lines.push(
          game.i18n.format("ASTER.scene.injuryLine", {
            before: c.healthBefore,
            after: c.healthAfter,
            delta: c.healthDelta,
          }),
        );
        if (c.healthZero) {
          lines.push(
            `<span class="warn-zero">${game.i18n.localize("ASTER.scene.healthZero")}</span>`,
          );
        }
      }
      return `<li><strong>${c.actorName}</strong><ul class="scene-pc-detail">${lines
        .map((l) => `<li>${l}</li>`)
        .join("")}</ul></li>`;
    })
    .join("");

  const noteHtml = isExploration
    ? ""
    : `<div class="scene-note">${game.i18n.localize("ASTER.scene.notExploration")}</div>`;

  await ChatMessage.create({
    content: `<div class="aster-chat-card scene-transition-card">
      <header class="card-header"><div class="title"><div class="name">
        ${game.i18n.localize("ASTER.scene.transitioned")}
      </div></div></header>
      ${noteHtml}
      <ul class="scene-target-list">${listHtml}</ul>
    </div>`,
    speaker: ChatMessage.getSpeaker({
      alias: game.i18n.localize("ASTER.world.panelTitle"),
    }),
  });
}

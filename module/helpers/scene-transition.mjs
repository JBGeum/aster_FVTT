/** GM 패널 "장면 이동" 흐름. UI 오케스트레이션이라 타입 검사 대상이 아니다. */

/**
 * 장면 이동 처리.
 * 룰북 488: 탐색 페이즈에서 이동 시 포만 -1 (배고픔이면 -2).
 * 룰북 502: 이동 전 타이밍에 피크닉 선언 가능 (이 STEP 범위 밖, 향후 추가).
 *
 * 장면 이동 자체는 모든 페이즈에서 일어날 수 있는 개념적 이벤트지만,
 * 포만 감소는 탐색 페이즈에서만 적용 (페이즈 무관 버튼 + 페이즈별 효과 분기).
 */
export async function runSceneTransition() {
  // 1. character 액터 목록 (NPC 제외)
  const characters = game.actors.filter((a) => a.type === "character");
  if (characters.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.scene.noCharacters"));
    return;
  }

  // 2. 다이얼로그: 대상 PC 선택 (기본 전체 체크)
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

  // 3. 페이즈 확인 + 포만 감소 적용
  const phase = game.settings.get("aster", "currentPhase");
  const isExploration = phase === "exploration";

  const changes = []; // PC별 포만·부상 처리 결과 — 채팅 출력용
  for (const id of selectedIds) {
    const actor = game.actors.get(id);
    if (!actor) continue;

    // 포만 감소
    const satBefore = actor.system.satiety?.value ?? 0;
    await actor._decreaseSatietyIfExploration();
    const satAfter = actor.system.satiety?.value ?? 0;

    // 부상 PC 건강 -2 (탐색 페이즈)
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

  // 4. 채팅 안내 카드 — PC별 그룹, 변경 항목을 들여쓰기로 표시
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

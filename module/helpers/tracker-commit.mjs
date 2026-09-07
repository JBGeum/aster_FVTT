/** 트래커 갱신 저장과 채팅 카드. GM 패널과 판정 카드가 공유한다. */

/**
 * @param {string} id                갱신한 트래커 id
 * @param {{trackers: object[], reached: boolean, before: number|null}} result  tracker-ops의 반환값
 */
export async function commitTrackers(id, result) {
  await game.settings.set("aster", "trackers", result.trackers);

  const t = result.trackers.find((x) => x.id === id);
  // before가 null이면 없는 id라 값이 바뀌지 않았다.
  if (!t || result.before === null) return;

  const delta = t.value - result.before;
  const line = game.i18n.format(
    t.goal != null ? "ASTER.tracker.updateLineGoal" : "ASTER.tracker.updateLine",
    {
      before: `<span class="before">${result.before}</span>`,
      after: `<span class="after">${t.value}</span>`,
      goal: `<span class="goal">${t.goal}</span>`,
      delta: `<span class="delta">${delta > 0 ? `+${delta}` : delta}</span>`,
    },
  );
  const done = result.reached
    ? `<span class="verdict success">${game.i18n.localize("ASTER.tracker.done")}</span>`
    : "";
  const title = game.i18n.format("ASTER.tracker.updateTitle", {
    name: foundry.utils.escapeHTML(t.name),
  });

  await ChatMessage.create({
    content: `<div class="aster-chat-card tracker-update-card">
      <header class="card-header"><div class="title"><div class="name">${title}</div></div></header>
      <div class="tracker-body">${line}${done}</div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
  });
}

/**
 * @param {{name: string, value: number, goal?: number}} tracker
 */
export async function postTrackerStatus(tracker) {
  const hasGoal = tracker.goal != null;
  const line = game.i18n.format(
    hasGoal ? "ASTER.tracker.statusLineGoal" : "ASTER.tracker.statusLine",
    {
      value: `<span class="after">${tracker.value}</span>`,
      goal: `<span class="goal">${tracker.goal}</span>`,
    },
  );
  const done =
    hasGoal && tracker.value >= tracker.goal
      ? `<span class="verdict success">${game.i18n.localize("ASTER.tracker.done")}</span>`
      : "";
  const title = game.i18n.format("ASTER.tracker.statusTitle", {
    name: foundry.utils.escapeHTML(tracker.name),
  });

  await ChatMessage.create({
    content: `<div class="aster-chat-card tracker-status-card">
      <header class="card-header"><div class="title"><div class="name">${title}</div></div></header>
      <div class="tracker-body">${line}${done}</div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
  });
}

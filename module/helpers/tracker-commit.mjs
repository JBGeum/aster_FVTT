/** 트래커 갱신 저장과 목표 도달 알림. GM 패널과 판정 카드가 공유한다. */

/**
 * @param {string} id                갱신한 트래커 id
 * @param {{trackers: object[], reached: boolean}} result  tracker-ops의 반환값
 */
export async function commitTrackers(id, result) {
  await game.settings.set("aster", "trackers", result.trackers);
  if (!result.reached) return;

  const t = result.trackers.find((x) => x.id === id);
  await ChatMessage.create({
    content: `<div class="aster-chat-card tracker-reached-card">
      <header class="card-header"><div class="title"><div class="name">
        ${game.i18n.localize("ASTER.tracker.reachedTitle")}
      </div></div></header>
      <div class="tracker-reached-body">
        ${game.i18n.format("ASTER.tracker.reachedLine", {
          name: t.name,
          value: t.value,
          goal: t.goal,
        })}
      </div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
  });
}

import {
  badstatusI18nKey,
  applyCureStatus,
  applyCureAllStatus,
  applyHealHealth,
} from "./health-status.mjs";

/** consumable이 회복 효과(건강·상태이상·일괄)를 하나라도 가지면 true — "사용" 버튼 노출 조건. */
export function consumableHasHeal(item) {
  if (item?.type !== "consumable") return false;
  const sys = item.system;
  return (
    (sys.healHealth ?? 0) > 0 || (sys.cureStatus?.length ?? 0) > 0 || sys.cureAllStatus === true
  );
}

/**
 * 인벤토리 리스트의 "사용" 버튼과 아이템 시트의 "사용" 버튼에서 공용 호출.
 * 대상은 자기 자신(self)만.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function useConsumable(actor, item) {
  if (!actor || item?.type !== "consumable") return;
  const sys = item.system;

  const results = {
    itemName: item.name,
    itemImg: item.img,
    healed: null,
    statusCured: [],
    allCured: false,
    curedKeys: [],
  };

  // max 클램프는 applyHealHealth 내부에서 처리한다.
  if ((sys.healHealth ?? 0) > 0) {
    const healResults = await applyHealHealth([actor], sys.healHealth);
    results.healed = healResults[0] ?? null;
  }

  if (sys.cureAllStatus === true) {
    const cureResults = await applyCureAllStatus([actor]);
    results.allCured = true;
    results.curedKeys = cureResults[0]?.curedKeys ?? [];
  } else if ((sys.cureStatus?.length ?? 0) > 0) {
    for (const statusKey of sys.cureStatus) {
      const cureResults = await applyCureStatus([actor], statusKey);
      if (cureResults[0]?.cured) results.statusCured.push(statusKey);
    }
  }

  await renderConsumableCard(actor, results);
  await item.delete();
}

async function renderConsumableCard(actor, results) {
  const badstatusLabel = (key) => game.i18n.localize(badstatusI18nKey(key));

  let healLine = null;
  if (results.healed) {
    if (results.healed.blocked === true) {
      // 전투 중 행동불능 PC는 건강 회복이 차단된다(아이템은 소비됨).
      healLine = game.i18n.localize("ASTER.consumable.healBlockedLine");
    } else if (results.healed.delta > 0) {
      healLine = game.i18n.format("ASTER.consumable.healLine", {
        before: results.healed.before,
        after: results.healed.after,
        delta: results.healed.delta,
      });
    } else {
      healLine = game.i18n.localize("ASTER.consumable.alreadyMax");
    }
  }

  // join 헬퍼가 없으므로 카드 데이터 단계에서 미리 문자열로 합친다.
  const cardData = {
    title: game.i18n.format("ASTER.consumable.usedTitle", { item: results.itemName }),
    itemName: results.itemName,
    itemImg: results.itemImg,
    actorName: actor.name,
    healLine,
    allCured: results.allCured,
    hasAllCuredKeys: results.curedKeys.length > 0,
    allCuredKeysText: results.curedKeys.map(badstatusLabel).join(", "),
    hasStatusCured: results.statusCured.length > 0,
    statusCuredText: results.statusCured.map(badstatusLabel).join(", "),
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/consumable-card.html",
    cardData,
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}

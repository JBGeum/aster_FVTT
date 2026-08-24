/**
 * import 시 top-level에서 Hooks.on(...)을 등록한다(부수효과).
 */

const SINGLETON_TYPES = ["bag", "food"];

/* -------------------------------------------- */
/*  Bag Deletion → Storage Transfer             */
/* -------------------------------------------- */

Hooks.on("preDeleteItem", (item, _options, _userId) => {
  if (item.type !== "bag") return true;
  const actor = item.parent;
  if (!actor) return true;

  const orphans = actor.items.filter((i) => i.system.container === item.id);
  Hooks.once("deleteItem", async () => {
    const updates = orphans.map((i) => ({
      _id: i.id,
      "system.container": "",
      "system.grid": { x: 0, y: 0 },
    }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  });
  return true;
});

/* -------------------------------------------- */
/*  Item Creation Constraints                   */
/* -------------------------------------------- */

Hooks.on("preCreateItem", (item, _data, _options, _userId) => {
  const actor = item.parent;
  if (!actor || actor.documentName !== "Actor") return true;
  if (!SINGLETON_TYPES.includes(item.type)) return true;

  const existing = actor.items.find((i) => i.type === item.type);
  if (!existing) return true;

  // food는 하드 차단 대신 교체 다이얼로그. preCreateItem 반환값은 *동기*로 검사되어
  // Promise를 반환해도 취소되지 않으므로, 여기서 차단(false)하고 비동기 교체 흐름을 띄운다.
  if (item.type === "food") {
    void promptFoodReplace(actor, existing, item.toObject());
    return false;
  }

  // 그 외 싱글톤(bag)은 하드 차단.
  ui.notifications.warn(
    game.i18n.format("ASTER.inventory.warn.singleton", {
      type: game.i18n.localize(`TYPES.Item.${item.type}`),
    }),
  );
  return false;
});

/**
 * 확인 시 기존 food 삭제 → 신규 food 재생성. 삭제→생성 순서라 잠시도 2개 상태가 없다(1→0→1).
 * 재생성 시 preCreateItem이 다시 발화하지만 기존 food가 이미 삭제돼 정상 통과한다.
 *
 * @param {Actor} actor       대상 액터
 * @param {Item} existing     기존 food (교체 대상)
 * @param {object} newData    신규 food 생성 데이터 (item.toObject())
 */
async function promptFoodReplace(actor, existing, newData) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ASTER.food.replaceConfirmTitle") },
    content: `<div class="food-replace-confirm">
      <p>${game.i18n.localize("ASTER.food.replaceIntro")}</p>
      <p><strong>${game.i18n.localize("ASTER.food.existing")}</strong>: ${existing.name}</p>
      <p><strong>${game.i18n.localize("ASTER.food.incoming")}</strong>: ${newData.name}</p>
      <p class="proceed-q">${game.i18n.localize("ASTER.food.replaceProceed")}</p>
    </div>`,
  }).catch(() => false);

  if (!confirmed) {
    ui.notifications.info(game.i18n.format("ASTER.food.cancelled", { name: newData.name }));
    return;
  }

  delete newData._id; // 새 인스턴스로 생성
  await existing.delete();
  await actor.createEmbeddedDocuments("Item", [newData]);
}

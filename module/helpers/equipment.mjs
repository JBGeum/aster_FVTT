import { EQUIP_SLOT_CONTAINERS, isEquipSlotContainer } from "./inventory-capacity.mjs";

/**
 * 빈 슬롯 자동 선택 — PL은 슬롯 번호를 고르지 않는다.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function equipItem(actor, item) {
  const used = new Set(
    actor.items
      .filter((i) => i.type === "equipment" && isEquipSlotContainer(i.system.container))
      .map((i) => i.system.container),
  );
  const emptySlot = EQUIP_SLOT_CONTAINERS.find((s) => !used.has(s));
  if (!emptySlot) {
    ui.notifications.warn(game.i18n.localize("ASTER.equipment.slotsFull"));
    return;
  }
  await item.update({ "system.container": emptySlot, "system.grid": { x: 0, y: 0 } });
}

/** 해제 — 장비 슬롯의 아이템을 창고(container "")로 복귀. */
export async function unequipItem(item) {
  await item.update({ "system.container": "", "system.grid": { x: 0, y: 0 } });
}

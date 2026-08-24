// @ts-check

/**
 * 장비 슬롯 container 예약 값 — 장비품 2개까지.
 * item.system.container가 이 값이면 *장비란*에 위치 (창고 "" / 가방 bag.id와 구분).
 * @type {string[]}
 */
export const EQUIP_SLOT_CONTAINERS = ["equip-1", "equip-2"];

/**
 * container 값이 장비 슬롯인지 검사.
 * @param {string} container
 * @returns {boolean}
 */
export function isEquipSlotContainer(container) {
  return EQUIP_SLOT_CONTAINERS.includes(container);
}

/** 아이템 면적. size={w,h}. */
export function itemArea(size) {
  const { w = 1, h = 1 } = size ?? {};
  return (w || 1) * (h || 1);
}

/** 아이템 배열 면적 합. */
export function usedArea(items) {
  return items.reduce((sum, it) => sum + itemArea(it.size), 0);
}

/**
 * 가방 용량 판정 (경고용). 막지 않음.
 * @param {{ newItemSize:{w:number,h:number}, itemsInBag:Array<{size:{w:number,h:number}}>, grid:{cols:number,rows:number} }} p
 * @returns {{ ok:boolean, reasons:string[] }}
 */
export function checkBagCapacity({ newItemSize, itemsInBag, grid }) {
  const reasons = [];
  const { w = 1, h = 1 } = newItemSize ?? {};
  if (usedArea(itemsInBag) + itemArea(newItemSize) > grid.cols * grid.rows) {
    reasons.push("AREA_EXCEEDED");
  }
  if (w > grid.cols) reasons.push("WIDTH_EXCEEDED");
  if (h > grid.rows) reasons.push("HEIGHT_EXCEEDED");
  return { ok: reasons.length === 0, reasons };
}

/**
 * 창고 추가 가능 여부 (차단용). 개수 기준.
 * @param {{ currentCount:number, limit:number }} p
 * @returns {{ allowed:boolean, over:boolean }}
 *   allowed: 새 아이템을 창고에 넣어도 되는가
 *   over: 현재 이미 한도 초과 상태인가 (UI 빨간 표시용)
 */
export function checkStorageAdd({ currentCount, limit }) {
  return {
    allowed: currentCount < limit,
    over: currentCount > limit,
  };
}

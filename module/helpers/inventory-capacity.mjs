// @ts-check

/**
 * 장비 슬롯 container 예약 값 — 장비품 2개까지.
 * item.system.container가 이 값이면 *장비란*에 위치 (창고 "" / 가방 bag.id와 구분).
 * @type {string[]}
 */
export const EQUIP_SLOT_CONTAINERS = ["equip-1", "equip-2"];

/**
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

/** dead 좌표를 "x,y" 문자열 Set으로. 격자 밖 좌표는 버린다. */
function deadSet(grid, dead = []) {
  const set = new Set();
  for (const c of dead) {
    const { x, y } = c ?? {};
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue;
    set.add(`${x},${y}`);
  }
  return set;
}

/**
 * 격자에서 실제로 쓸 수 있는 칸 수.
 * @param {{cols:number, rows:number}} grid
 * @param {Array<{x:number,y:number}>} [dead]
 * @returns {number}
 */
export function liveCellCount(grid, dead = []) {
  return grid.cols * grid.rows - deadSet(grid, dead).size;
}

/**
 * 아이템이 차지할 칸이 전부 살아 있는가 (차단용). 격자 밖으로 나가도 false.
 * @param {{ start:{x:number,y:number}, size:{w:number,h:number}, grid:{cols:number,rows:number}, dead?:Array<{x:number,y:number}> }} p
 * @returns {boolean}
 */
export function fitsInShape({ start, size, grid, dead = [] }) {
  const { x = 0, y = 0 } = start ?? {};
  const { w = 1, h = 1 } = size ?? {};
  if (x < 0 || y < 0 || x + w > grid.cols || y + h > grid.rows) return false;
  const set = deadSet(grid, dead);
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      if (set.has(`${x + dx},${y + dy}`)) return false;
    }
  }
  return true;
}

/**
 * 가방 용량 판정 (경고용). 막지 않음.
 * @param {{ newItemSize:{w:number,h:number}, itemsInBag:Array<{size:{w:number,h:number}}>, grid:{cols:number,rows:number}, dead?:Array<{x:number,y:number}> }} p
 * @returns {{ ok:boolean, reasons:string[] }}
 */
export function checkBagCapacity({ newItemSize, itemsInBag, grid, dead = [] }) {
  const reasons = [];
  const { w = 1, h = 1 } = newItemSize ?? {};
  if (usedArea(itemsInBag) + itemArea(newItemSize) > liveCellCount(grid, dead)) {
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

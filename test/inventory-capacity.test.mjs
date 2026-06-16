import { describe, it, expect } from "vitest";
import {
  itemArea,
  usedArea,
  checkBagCapacity,
  checkStorageAdd,
} from "../module/helpers/inventory-capacity.mjs";

describe("itemArea / usedArea", () => {
  it("면적 계산", () => {
    expect(itemArea({ w: 2, h: 3 })).toBe(6);
    expect(usedArea([{ size: { w: 2, h: 3 } }, { size: { w: 2, h: 2 } }])).toBe(10);
    expect(usedArea([])).toBe(0);
  });
});

describe("checkBagCapacity", () => {
  const grid = { cols: 6, rows: 4 }; // 24칸

  it("여유 ok", () => {
    expect(checkBagCapacity({ newItemSize: { w: 2, h: 2 }, itemsInBag: [], grid }).ok).toBe(true);
  });
  it("면적 초과", () => {
    const r = checkBagCapacity({
      newItemSize: { w: 2, h: 2 },
      itemsInBag: [{ size: { w: 22, h: 1 } }],
      grid,
    });
    expect(r.reasons).toContain("AREA_EXCEEDED");
  });
  it("가로 초과", () => {
    expect(
      checkBagCapacity({ newItemSize: { w: 7, h: 1 }, itemsInBag: [], grid }).reasons,
    ).toContain("WIDTH_EXCEEDED");
  });
  it("세로 초과", () => {
    expect(
      checkBagCapacity({ newItemSize: { w: 1, h: 5 }, itemsInBag: [], grid }).reasons,
    ).toContain("HEIGHT_EXCEEDED");
  });
});

describe("checkStorageAdd", () => {
  it("여유 있으면 추가 허용", () => {
    expect(checkStorageAdd({ currentCount: 5, limit: 20 })).toEqual({ allowed: true, over: false });
  });
  it("꽉 차면 추가 불가", () => {
    expect(checkStorageAdd({ currentCount: 20, limit: 20 }).allowed).toBe(false);
  });
  it("초과 상태면 추가 불가 + over=true", () => {
    const r = checkStorageAdd({ currentCount: 25, limit: 20 });
    expect(r.allowed).toBe(false);
    expect(r.over).toBe(true);
  });
});

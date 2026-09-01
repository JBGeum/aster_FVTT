import { describe, it, expect } from "vitest";
import {
  itemArea,
  usedArea,
  checkBagCapacity,
  checkStorageAdd,
  liveCellCount,
  fitsInShape,
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

describe("liveCellCount", () => {
  const grid = { cols: 5, rows: 4 }; // 20칸

  it("dead 가 비면 cols * rows", () => {
    expect(liveCellCount(grid, [])).toBe(20);
    expect(liveCellCount(grid)).toBe(20);
  });
  it("꺼진 칸만큼 줄어든다", () => {
    expect(
      liveCellCount(grid, [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ]),
    ).toBe(18);
  });
  it("격자 밖 좌표는 무시한다", () => {
    expect(
      liveCellCount(grid, [
        { x: 9, y: 0 },
        { x: 0, y: 9 },
        { x: -1, y: 0 },
      ]),
    ).toBe(20);
  });
  it("중복 좌표는 한 번만 센다", () => {
    expect(
      liveCellCount(grid, [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBe(19);
  });
});

describe("fitsInShape", () => {
  const grid = { cols: 5, rows: 4 };
  const dead = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ]; // 양옆 기둥 맨 윗칸

  it("산 칸의 1x1 은 들어간다", () => {
    expect(fitsInShape({ start: { x: 1, y: 0 }, size: { w: 1, h: 1 }, grid, dead })).toBe(true);
  });
  it("꺼진 칸의 1x1 은 못 들어간다", () => {
    expect(fitsInShape({ start: { x: 0, y: 0 }, size: { w: 1, h: 1 }, grid, dead })).toBe(false);
  });
  it("2x2 가 꺼진 칸에 걸치면 못 들어간다", () => {
    expect(fitsInShape({ start: { x: 0, y: 0 }, size: { w: 2, h: 2 }, grid, dead })).toBe(false);
  });
  it("2x2 가 산 칸에만 걸치면 들어간다", () => {
    expect(fitsInShape({ start: { x: 0, y: 1 }, size: { w: 2, h: 2 }, grid, dead })).toBe(true);
  });
  it("격자 밖으로 나가면 못 들어간다", () => {
    expect(fitsInShape({ start: { x: 4, y: 3 }, size: { w: 2, h: 1 }, grid, dead })).toBe(false);
    expect(fitsInShape({ start: { x: -1, y: 0 }, size: { w: 1, h: 1 }, grid, dead })).toBe(false);
  });
  it("dead 가 비면 격자 안이면 언제나 true", () => {
    expect(fitsInShape({ start: { x: 0, y: 0 }, size: { w: 5, h: 4 }, grid })).toBe(true);
  });
});

describe("checkBagCapacity — 꺼진 칸", () => {
  const grid = { cols: 5, rows: 4 };
  const dead = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ]; // 18칸

  it("꺼진 칸만큼 면적 상한이 준다", () => {
    const itemsInBag = [{ size: { w: 4, h: 4 } }]; // 16
    // 16 + 3 = 19 > 18(꺼진 칸 둘) → 초과. dead 없으면 19 <= 20 → ok.
    expect(
      checkBagCapacity({ newItemSize: { w: 3, h: 1 }, itemsInBag, grid, dead }).reasons,
    ).toContain("AREA_EXCEEDED");
    expect(checkBagCapacity({ newItemSize: { w: 3, h: 1 }, itemsInBag, grid }).ok).toBe(true);
  });
});

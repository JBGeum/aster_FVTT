import { describe, it, expect } from "vitest";
import { rebaseTotal } from "../module/helpers/dice-pick.mjs";

describe("rebaseTotal", () => {
  it("고른 다이스만 반영하고 고정 보정은 보존한다", () => {
    // 3d6(2,5,6) + 능력치 4 = 17 → 5,6만 채택 → 5+6+4 = 15
    expect(rebaseTotal(17, [2, 5, 6], [5, 6])).toBe(15);
  });

  it("보정이 음수여도 보존된다", () => {
    // 3d6(1,3,4) - 2 = 6 → 3,4 채택 → 3+4-2 = 5
    expect(rebaseTotal(6, [1, 3, 4], [3, 4])).toBe(5);
  });

  it("전부 고르면 원래 합과 같다", () => {
    expect(rebaseTotal(17, [2, 5, 6], [2, 5, 6])).toBe(17);
  });

  it("고정 보정이 없으면 고른 다이스 합이 된다", () => {
    expect(rebaseTotal(13, [3, 4, 6], [4, 6])).toBe(10);
  });

  it("다이스가 2개뿐이면 그대로 반환한다", () => {
    expect(rebaseTotal(11, [5, 6], [5, 6])).toBe(11);
  });

  it("고정 보정이 큰 NPC 식도 보존한다", () => {
    // 2D6+3 에 집중 1d6 → (2,6,4) + 3 = 15 → 6,4 채택 → 6+4+3 = 13
    expect(rebaseTotal(15, [2, 6, 4], [6, 4])).toBe(13);
  });
});

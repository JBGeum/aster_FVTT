import { describe, it, expect } from "vitest";
import { rangeFormula } from "../module/helpers/range-roll.mjs";

describe("rangeFormula", () => {
  it("최소치 1은 오프셋 없이 굴린다", () => {
    expect(rangeFormula(1, 5)).toBe("1d5");
  });

  it("최소치 0은 음수 오프셋을 붙인다", () => {
    expect(rangeFormula(0, 5)).toBe("1d6-1");
  });

  it("최소치가 1보다 크면 양수 오프셋을 붙인다", () => {
    expect(rangeFormula(2, 4)).toBe("1d3+1");
  });

  it("음수 범위도 오프셋으로 표현한다", () => {
    expect(rangeFormula(-2, 2)).toBe("1d5-3");
  });

  it("최소치와 최대치가 같으면 고정값이다", () => {
    expect(rangeFormula(3, 3)).toBe("3");
    expect(rangeFormula(0, 0)).toBe("0");
    expect(rangeFormula(-1, -1)).toBe("-1");
  });
});

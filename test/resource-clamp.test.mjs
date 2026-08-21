import { describe, it, expect } from "vitest";
import { clampDelta } from "../module/helpers/resource-clamp.mjs";

describe("clampDelta", () => {
  it("상하한 안에서는 입력한 증감치가 그대로 적용된다", () => {
    expect(clampDelta(10, -3, 20)).toEqual({ before: 10, after: 7, delta: -3 });
  });

  it("하한 0에서 멈추고 실제 적용량만 반환한다", () => {
    expect(clampDelta(2, -3, 20)).toEqual({ before: 2, after: 0, delta: -2 });
  });

  it("상한에서 멈추고 실제 적용량만 반환한다", () => {
    expect(clampDelta(18, 5, 20)).toEqual({ before: 18, after: 20, delta: 2 });
  });

  it("이미 0이면 추가 감소가 일어나지 않는다", () => {
    expect(clampDelta(0, -3, 20)).toEqual({ before: 0, after: 0, delta: 0 });
  });

  it("증감치가 0이면 변화가 없다", () => {
    expect(clampDelta(10, 0, 20)).toEqual({ before: 10, after: 10, delta: 0 });
  });

  it("현재값이 상한을 넘어도 증가로 값이 깎이지 않는다", () => {
    expect(clampDelta(25, 5, 20)).toEqual({ before: 25, after: 25, delta: 0 });
  });

  it("현재값이 상한을 넘은 상태의 감소는 그대로 적용된다", () => {
    expect(clampDelta(25, -5, 20)).toEqual({ before: 25, after: 20, delta: -5 });
  });
});

import { describe, it, expect } from "vitest";
import { formatSpeedSources } from "../module/helpers/speed-sources.mjs";

const speedChange = (value) => ({ key: "system.speed", mode: 2, value });

describe("formatSpeedSources", () => {
  it("민첩을 더하는 효과를 부호와 함께 나열한다", () => {
    const effects = [
      { name: "대쉬", changes: [speedChange(3)] },
      { name: "피로", changes: [speedChange("-3")] },
    ];
    expect(formatSpeedSources(effects)).toBe("대쉬 +3, 피로 -3");
  });

  it("민첩을 건드리지 않는 효과는 제외한다", () => {
    const effects = [
      { name: "대쉬", changes: [speedChange(2)] },
      { name: "부상", changes: [{ key: "system.health.value", mode: 2, value: -1 }] },
    ];
    expect(formatSpeedSources(effects)).toBe("대쉬 +2");
  });

  it("비활성 효과는 제외한다", () => {
    const effects = [
      { name: "대쉬", changes: [speedChange(2)], disabled: true },
      { name: "피로", changes: [speedChange(-3)] },
    ];
    expect(formatSpeedSources(effects)).toBe("피로 -3");
  });

  it("더하기가 아닌 방식은 제외한다", () => {
    const effects = [{ name: "덮어쓰기", changes: [{ key: "system.speed", mode: 5, value: 9 }] }];
    expect(formatSpeedSources(effects)).toBe("");
  });

  it("0은 표시하지 않는다", () => {
    const effects = [
      { name: "무효", changes: [speedChange(0)] },
      { name: "대쉬", changes: [speedChange(1)] },
    ];
    expect(formatSpeedSources(effects)).toBe("대쉬 +1");
  });

  it("숫자로 읽히지 않는 값은 제외한다", () => {
    const effects = [{ name: "수식", changes: [speedChange("@abilities.dex")] }];
    expect(formatSpeedSources(effects)).toBe("");
  });

  it("한 효과가 민첩을 여러 번 바꾸면 각각 센다", () => {
    const effects = [{ name: "합체기", changes: [speedChange(2), speedChange(1)] }];
    expect(formatSpeedSources(effects)).toBe("합체기 +2, 합체기 +1");
  });

  it("해당 효과가 없으면 빈 문자열", () => {
    expect(formatSpeedSources([])).toBe("");
  });

  it("changes가 없는 효과에서도 터지지 않는다", () => {
    expect(formatSpeedSources([{ name: "졸림" }])).toBe("");
  });
});

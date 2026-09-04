import { describe, it, expect } from "vitest";
import { formatEffectDeltas } from "../module/helpers/effect-deltas.mjs";

const add = (key, value) => ({ key, mode: 2, value });

describe("formatEffectDeltas", () => {
  it("changes가 없으면 빈 배열이다", () => {
    expect(formatEffectDeltas(undefined)).toEqual([]);
    expect(formatEffectDeltas([])).toEqual([]);
  });

  it("대상 키와 부호 붙인 값을 함께 돌려준다", () => {
    expect(formatEffectDeltas([add("system.speed", 3)])).toEqual([
      { key: "system.speed", text: "+3" },
    ]);
  });

  it("음수는 그대로 쓴다", () => {
    expect(formatEffectDeltas([add("system.speed", "-3")])).toEqual([
      { key: "system.speed", text: "-3" },
    ]);
  });

  it("여럿이면 순서대로 담는다", () => {
    expect(formatEffectDeltas([add("system.speed", 3), add("system.dodge", -1)])).toEqual([
      { key: "system.speed", text: "+3" },
      { key: "system.dodge", text: "-1" },
    ]);
  });

  it("더하기가 아닌 모드는 환산할 수 없어 제외한다", () => {
    // mode 5 = OVERRIDE
    expect(formatEffectDeltas([{ key: "system.speed", mode: 5, value: 9 }])).toEqual([]);
  });

  it("0과 숫자가 아닌 값은 제외한다", () => {
    expect(formatEffectDeltas([add("system.speed", 0), add("system.dodge", "x")])).toEqual([]);
  });

  it("걸러낸 뒤 남은 것만 담는다", () => {
    const changes = [add("system.speed", 0), add("system.dodge", 2)];
    expect(formatEffectDeltas(changes)).toEqual([{ key: "system.dodge", text: "+2" }]);
  });
});

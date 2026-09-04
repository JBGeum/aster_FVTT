import { describe, it, expect } from "vitest";
import { formatEffectDeltas } from "../module/helpers/effect-deltas.mjs";

const add = (key, value) => ({ key, mode: 2, value });

describe("formatEffectDeltas", () => {
  it("changes가 없으면 null이다", () => {
    expect(formatEffectDeltas(undefined)).toBe(null);
    expect(formatEffectDeltas([])).toBe(null);
  });

  it("더하는 값에 부호를 붙인다", () => {
    expect(formatEffectDeltas([add("system.speed", 3)])).toBe("+3");
  });

  it("음수는 그대로 쓴다", () => {
    expect(formatEffectDeltas([add("system.speed", "-3")])).toBe("-3");
  });

  it("여럿이면 쉼표로 잇는다", () => {
    expect(formatEffectDeltas([add("system.speed", 3), add("system.dodge", -1)])).toBe("+3, -1");
  });

  it("더하기가 아닌 모드는 환산할 수 없어 제외한다", () => {
    // mode 5 = OVERRIDE
    expect(formatEffectDeltas([{ key: "system.speed", mode: 5, value: 9 }])).toBe(null);
  });

  it("0과 숫자가 아닌 값은 제외한다", () => {
    expect(formatEffectDeltas([add("system.speed", 0), add("system.dodge", "x")])).toBe(null);
  });

  it("걸러낸 뒤 남은 것만 잇는다", () => {
    const changes = [add("system.speed", 0), add("system.dodge", 2)];
    expect(formatEffectDeltas(changes)).toBe("+2");
  });
});

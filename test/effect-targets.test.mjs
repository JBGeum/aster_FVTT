import { describe, it, expect } from "vitest";
import { EFFECT_TARGETS, buildEffectData, labelKeyFor } from "../module/helpers/effect-targets.mjs";

describe("EFFECT_TARGETS", () => {
  it("파생값을 덮어쓰는 키를 담지 않는다", () => {
    const keys = EFFECT_TARGETS.map((t) => t.key);
    // ability는 .total이 prepareDerivedData에서 재계산되므로 .mod에 걸어야 한다.
    expect(keys.some((k) => k.endsWith(".total"))).toBe(false);
    expect(keys.some((k) => k.endsWith(".percent"))).toBe(false);
  });

  it("항목마다 키와 라벨이 있다", () => {
    for (const t of EFFECT_TARGETS) {
      expect(t.key).toMatch(/^system\./);
      expect(t.label).toMatch(/^ASTER\./);
    }
  });
});

describe("buildEffectData", () => {
  const base = { name: "삼베 샌들", key: "system.speed", value: 1 };

  it("더하기 change 하나를 만든다", () => {
    const d = buildEffectData({ ...base, rounds: 0 });
    expect(d.name).toBe("삼베 샌들");
    expect(d.changes).toEqual([{ key: "system.speed", mode: 2, value: 1, priority: 20 }]);
  });

  it("지속 라운드가 없으면 duration을 넣지 않는다 — 해제 전까지 유지된다", () => {
    expect(buildEffectData({ ...base, rounds: 0 }).duration).toBeUndefined();
    expect(buildEffectData({ ...base, rounds: null }).duration).toBeUndefined();
  });

  it("지속 라운드가 있으면 duration에 싣는다", () => {
    const d = buildEffectData({ ...base, rounds: 3 });
    expect(d.duration).toEqual({ rounds: 3 });
  });

  it("전투 중이면 시작 라운드와 전투를 함께 심는다", () => {
    const d = buildEffectData({ ...base, rounds: 2, round: 5, combatId: "c1" });
    expect(d.duration).toEqual({ rounds: 2, startRound: 5, combat: "c1" });
  });

  it("전투 중이어도 지속이 없으면 각인하지 않는다", () => {
    expect(
      buildEffectData({ ...base, rounds: 0, round: 5, combatId: "c1" }).duration,
    ).toBeUndefined();
  });
});

describe("labelKeyFor", () => {
  it("목록에 있는 키는 라벨 키를 돌려준다", () => {
    expect(labelKeyFor("system.speed")).toBe("ASTER.label.speed");
    expect(labelKeyFor("system.ability.worldly.mod")).toBe("ASTER.ability.worldly");
  });

  it("목록에 없는 키는 null이다 — 코어 시트로 직접 넣은 것", () => {
    expect(labelKeyFor("system.whatever")).toBe(null);
    expect(labelKeyFor(undefined)).toBe(null);
  });
});

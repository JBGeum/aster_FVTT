import { describe, it, expect } from "vitest";
import { computeSpellRoll, getAbilityTotal, isSpecialty } from "../module/helpers/spell-roll.mjs";

// ── computeSpellRoll ───────────────────────────────────────────────────────────

describe("computeSpellRoll", () => {
  it("기본: 2d6=8 + 능력 3, target 11 → 11 성공", () => {
    const r = computeSpellRoll({ diceTotal: 8, abilityValue: 3, specialty: false, target: 11 });
    expect(r.achievement).toBe(11);
    expect(r.success).toBe(true);
  });

  it("특기 +1", () => {
    const r = computeSpellRoll({ diceTotal: 7, abilityValue: 3, specialty: true, target: 11 });
    expect(r.achievement).toBe(11);
    expect(r.success).toBe(true);
    expect(r.breakdown.specialty).toBe(1);
  });

  it("추가 다이스 합산", () => {
    const r = computeSpellRoll({
      diceTotal: 6,
      abilityValue: 2,
      specialty: false,
      extraDice: [3, 5],
      target: 15,
    });
    // 6 + 2 + 0 + (3+5) = 16
    expect(r.achievement).toBe(16);
    expect(r.success).toBe(true);
    expect(r.breakdown.extra).toBe(8);
  });

  it("실패: 미달", () => {
    const r = computeSpellRoll({ diceTotal: 4, abilityValue: 2, specialty: false, target: 11 });
    expect(r.success).toBe(false);
  });

  it("breakdown 보존", () => {
    const r = computeSpellRoll({
      diceTotal: 9,
      abilityValue: 4,
      specialty: true,
      extraDice: [6],
      target: 12,
    });
    expect(r.breakdown).toMatchObject({
      base: 9,
      ability: 4,
      specialty: 1,
      extra: 6,
      target: 12,
    });
  });

  it("extraDice 미전달 시 기본 빈 배열", () => {
    const r = computeSpellRoll({ diceTotal: 5, abilityValue: 0, specialty: false, target: 5 });
    expect(r.breakdown.extra).toBe(0);
    expect(r.breakdown.extraDice).toEqual([]);
    expect(r.success).toBe(true);
  });

  it("penalties 기본값은 { total: 0 }", () => {
    const r = computeSpellRoll({ diceTotal: 7, abilityValue: 3, specialty: false, target: 10 });
    expect(r.achievement).toBe(10);
    expect(r.success).toBe(true);
    expect(r.breakdown.penaltyTotal).toBe(0);
  });

  it("졸림 -2 적용 시 달성치 감소", () => {
    const r = computeSpellRoll({
      diceTotal: 7,
      abilityValue: 3,
      specialty: false,
      target: 10,
      penalties: { sleepy: -2, total: -2 },
    });
    expect(r.achievement).toBe(8);
    expect(r.success).toBe(false);
    expect(r.breakdown.penalties.sleepy).toBe(-2);
    expect(r.breakdown.penaltyTotal).toBe(-2);
  });

  it("졸림 -2 + 포만 -1 합산", () => {
    const r = computeSpellRoll({
      diceTotal: 7,
      abilityValue: 3,
      specialty: false,
      target: 10,
      penalties: { sleepy: -2, satiety: -1, total: -3 },
    });
    // 7 + 3 + 0 + 0 + (-3) = 7
    expect(r.achievement).toBe(7);
    expect(r.success).toBe(false);
    expect(r.breakdown.penalties.satiety).toBe(-1);
    expect(r.breakdown.penaltyTotal).toBe(-3);
  });

  it("특기 + 졸림 동시 적용", () => {
    const r = computeSpellRoll({
      diceTotal: 7,
      abilityValue: 3,
      specialty: true,
      target: 10,
      penalties: { sleepy: -2, total: -2 },
    });
    // 7 + 3 + 1(특기) + 0 + (-2) = 9
    expect(r.achievement).toBe(9);
    expect(r.breakdown.specialty).toBe(1);
    expect(r.breakdown.penaltyTotal).toBe(-2);
  });

  it("추가 다이스 + 졸림", () => {
    const r = computeSpellRoll({
      diceTotal: 7,
      abilityValue: 3,
      specialty: false,
      extraDice: [4, 5],
      target: 10,
      penalties: { sleepy: -2, total: -2 },
    });
    // 7 + 3 + 0 + 9(extra) + (-2) = 17
    expect(r.achievement).toBe(17);
    expect(r.success).toBe(true);
  });
});

// ── getAbilityTotal ──────────────────────────────────────────────────────────

describe("getAbilityTotal", () => {
  const actor = { system: { ability: { knowledge: { total: 5 } } } };

  it("능력치 total 반환", () => {
    expect(getAbilityTotal(actor, "knowledge")).toBe(5);
  });

  it("없는 능력치는 0", () => {
    expect(getAbilityTotal(actor, "active")).toBe(0);
    expect(getAbilityTotal({ system: {} }, "knowledge")).toBe(0);
  });
});

// ── isSpecialty ──────────────────────────────────────────────────────────────

describe("isSpecialty", () => {
  it("색 일치 시 true", () => {
    expect(isSpecialty({ system: { color: "red" } }, "red")).toBe(true);
  });

  it("색 불일치 시 false", () => {
    expect(isSpecialty({ system: { color: "red" } }, "blue")).toBe(false);
  });

  it("특기색 미지정(빈 값)이면 false", () => {
    expect(isSpecialty({ system: { color: "" } }, "")).toBe(false);
    expect(isSpecialty({ system: {} }, "red")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { computeAbilityCheck } from "../module/helpers/ability-check.mjs";

describe("computeAbilityCheck", () => {
  it("달성치가 목표치와 같으면 성공", () => {
    const r = computeAbilityCheck({ rawTotal: 10, target: 10 });
    expect(r.achievement).toBe(10);
    expect(r.success).toBe(true);
  });

  it("달성치가 목표치에 미달하면 실패", () => {
    const r = computeAbilityCheck({ rawTotal: 9, target: 10 });
    expect(r.success).toBe(false);
  });

  it("양수 수정치가 달성치를 올린다", () => {
    const r = computeAbilityCheck({ rawTotal: 9, modifier: 1, target: 10 });
    expect(r.achievement).toBe(10);
    expect(r.success).toBe(true);
  });

  it("음수 수정치가 달성치를 낮춘다", () => {
    const r = computeAbilityCheck({ rawTotal: 10, modifier: -2, target: 10 });
    expect(r.achievement).toBe(8);
    expect(r.success).toBe(false);
  });

  it("졸림·포만 보정이 달성치에 합산된다", () => {
    const r = computeAbilityCheck({
      rawTotal: 12,
      penalties: { sleepy: -1, satiety: -2, total: -3 },
      target: 10,
    });
    expect(r.achievement).toBe(9);
    expect(r.success).toBe(false);
  });

  it("대성공은 목표치에 미달해도 성공", () => {
    const r = computeAbilityCheck({ rawTotal: 4, target: 10, critical: true });
    expect(r.success).toBe(true);
  });

  it("대실패는 목표치를 넘겨도 실패", () => {
    const r = computeAbilityCheck({ rawTotal: 14, target: 10, fumble: true });
    expect(r.success).toBe(false);
  });

  it("목표치가 null이면 성공 판정을 하지 않는다", () => {
    const r = computeAbilityCheck({ rawTotal: 10, modifier: 2, target: null });
    expect(r.achievement).toBe(12);
    expect(r.success).toBeNull();
  });

  it("breakdown에 계산 근거를 남긴다", () => {
    const penalties = { sleepy: -1, satiety: 0, total: -1 };
    const r = computeAbilityCheck({ rawTotal: 11, modifier: 2, penalties, target: 12 });
    expect(r.breakdown).toEqual({
      rawTotal: 11,
      modifier: 2,
      penalties,
      penaltyTotal: -1,
      target: 12,
    });
  });
});

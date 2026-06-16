import { describe, expect, it } from "vitest";
import { computePenalties } from "../module/helpers/roll-result.mjs";

const mockActor = ({ sleepy = false, satiety = 20, exhaustion = false } = {}) => ({
  system: {
    badstatus: { sleepy, exhaustion },
    satiety: { value: satiety },
  },
});

describe("computePenalties", () => {
  it("기본 상태(졸림 없음, 포만 20)는 모든 보정 0", () => {
    expect(computePenalties(mockActor({ satiety: 20 }))).toEqual({
      sleepy: 0,
      satiety: 0,
      exhaustion: 0,
      total: 0,
    });
  });

  it("졸림 상태만", () => {
    expect(computePenalties(mockActor({ sleepy: true }))).toEqual({
      sleepy: -2,
      satiety: 0,
      exhaustion: 0,
      total: -2,
    });
  });

  it("포만 10 → satiety -1", () => {
    expect(computePenalties(mockActor({ satiety: 10 }))).toEqual({
      sleepy: 0,
      satiety: -1,
      exhaustion: 0,
      total: -1,
    });
  });

  it("포만 11 → 보정 없음 (경계값)", () => {
    expect(computePenalties(mockActor({ satiety: 11 }))).toEqual({
      sleepy: 0,
      satiety: 0,
      exhaustion: 0,
      total: 0,
    });
  });

  it("포만 5 → satiety -2 (경계값)", () => {
    expect(computePenalties(mockActor({ satiety: 5 }))).toEqual({
      sleepy: 0,
      satiety: -2,
      exhaustion: 0,
      total: -2,
    });
  });

  it("포만 6 → satiety -1 (경계 위)", () => {
    expect(computePenalties(mockActor({ satiety: 6 }))).toEqual({
      sleepy: 0,
      satiety: -1,
      exhaustion: 0,
      total: -1,
    });
  });

  it("포만 0 → satiety -3", () => {
    expect(computePenalties(mockActor({ satiety: 0 }))).toEqual({
      sleepy: 0,
      satiety: -3,
      exhaustion: 0,
      total: -3,
    });
  });

  it("졸림 + 포만 0 동시 → 합산 -5", () => {
    expect(computePenalties(mockActor({ sleepy: true, satiety: 0 }))).toEqual({
      sleepy: -2,
      satiety: -3,
      exhaustion: 0,
      total: -5,
    });
  });

  it("회피 컨텍스트 + 피로 → exhaustion -3", () => {
    expect(computePenalties(mockActor({ exhaustion: true }), { isDodge: true })).toEqual({
      sleepy: 0,
      satiety: 0,
      exhaustion: -3,
      total: -3,
    });
  });

  it("일반 컨텍스트 + 피로 → exhaustion 0 (회피 외에는 적용 안 됨)", () => {
    expect(computePenalties(mockActor({ exhaustion: true }))).toEqual({
      sleepy: 0,
      satiety: 0,
      exhaustion: 0,
      total: 0,
    });
  });

  it("회피 + 졸림 + 포만 5 + 피로 합산 → -7", () => {
    expect(
      computePenalties(mockActor({ sleepy: true, satiety: 5, exhaustion: true }), {
        isDodge: true,
      }),
    ).toEqual({
      sleepy: -2,
      satiety: -2,
      exhaustion: -3,
      total: -7,
    });
  });
});

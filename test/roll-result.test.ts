import { describe, expect, it } from "vitest";
import { detectCritFumble, resolveOpposed } from "../module/helpers/roll-result.mjs";

describe("detectCritFumble", () => {
  it("두 눈 모두 6이면 대성공", () => {
    expect(detectCritFumble([6, 6])).toEqual({ critical: true, fumble: false });
  });
  it("두 눈 모두 1이면 대실패", () => {
    expect(detectCritFumble([1, 1])).toEqual({ critical: false, fumble: true });
  });
  it("[6,5]는 대성공 아님", () => {
    expect(detectCritFumble([6, 5])).toEqual({ critical: false, fumble: false });
  });
  it("[1,2]는 대실패 아님", () => {
    expect(detectCritFumble([1, 2])).toEqual({ critical: false, fumble: false });
  });
  it("입력 길이가 2가 아니면 둘 다 false", () => {
    expect(detectCritFumble([6])).toEqual({ critical: false, fumble: false });
    expect(detectCritFumble([6, 6, 6])).toEqual({ critical: false, fumble: false });
    // @ts-expect-error null 입력 방어 동작 검증
    expect(detectCritFumble(null)).toEqual({ critical: false, fumble: false });
  });
});

describe("resolveOpposed", () => {
  const noCF = { critical: false, fumble: false };
  const crit = { critical: true, fumble: false };
  const fumb = { critical: false, fumble: true };

  it("능동 대실패면 무조건 수동 승 (activeFumble)", () => {
    expect(
      resolveOpposed({
        activeAchievement: 99,
        passiveAchievement: 0,
        activeCF: fumb,
        passiveCF: noCF,
      }),
    ).toEqual({ winner: "passive", reason: "activeFumble" });
  });

  it("양측 대성공이면 수동 승 (bothCritical)", () => {
    expect(
      resolveOpposed({
        activeAchievement: 10,
        passiveAchievement: 5,
        activeCF: crit,
        passiveCF: crit,
      }),
    ).toEqual({ winner: "passive", reason: "bothCritical" });
  });

  it("능동만 대성공이면 능동 승 (activeCritical)", () => {
    expect(
      resolveOpposed({
        activeAchievement: 3,
        passiveAchievement: 10,
        activeCF: crit,
        passiveCF: noCF,
      }),
    ).toEqual({ winner: "active", reason: "activeCritical" });
  });

  it("수동만 대성공이면 수동 승 (passiveCritical)", () => {
    expect(
      resolveOpposed({
        activeAchievement: 10,
        passiveAchievement: 3,
        activeCF: noCF,
        passiveCF: crit,
      }),
    ).toEqual({ winner: "passive", reason: "passiveCritical" });
  });

  it("능동 달성치가 크면 능동 승 (higherAchievement)", () => {
    expect(
      resolveOpposed({
        activeAchievement: 10,
        passiveAchievement: 7,
        activeCF: noCF,
        passiveCF: noCF,
      }),
    ).toEqual({ winner: "active", reason: "higherAchievement" });
  });

  it("수동 달성치가 크면 수동 승 (higherAchievement)", () => {
    expect(
      resolveOpposed({
        activeAchievement: 5,
        passiveAchievement: 8,
        activeCF: noCF,
        passiveCF: noCF,
      }),
    ).toEqual({ winner: "passive", reason: "higherAchievement" });
  });

  it("동률은 수동 승 (tieToPassive)", () => {
    expect(
      resolveOpposed({
        activeAchievement: 7,
        passiveAchievement: 7,
        activeCF: noCF,
        passiveCF: noCF,
      }),
    ).toEqual({ winner: "passive", reason: "tieToPassive" });
  });
});

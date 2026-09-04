import { describe, it, expect } from "vitest";
import { isEffectExpired, remainingRounds } from "../module/helpers/effect-duration.mjs";

describe("isEffectExpired", () => {
  it("duration이 없는 효과는 만료되지 않는다", () => {
    expect(isEffectExpired(5, undefined)).toBe(false);
    expect(isEffectExpired(5, {})).toBe(false);
  });

  it("rounds가 없으면 만료되지 않는다", () => {
    expect(isEffectExpired(5, { startRound: 1, seconds: 60 })).toBe(false);
  });

  it("startRound가 없으면 기준이 없어 만료되지 않는다", () => {
    expect(isEffectExpired(5, { rounds: 1 })).toBe(false);
  });

  it("경과 라운드가 rounds에 도달하면 만료된다", () => {
    expect(isEffectExpired(4, { rounds: 3, startRound: 1 })).toBe(true);
  });

  it("경과 라운드가 rounds에 못 미치면 만료되지 않는다", () => {
    expect(isEffectExpired(3, { rounds: 3, startRound: 1 })).toBe(false);
  });

  it("startRound가 현재 라운드보다 뒤면 만료되지 않는다", () => {
    expect(isEffectExpired(1, { rounds: 3, startRound: 8 })).toBe(false);
  });
});

describe("remainingRounds", () => {
  it("rounds 기반이 아니면 null이다", () => {
    expect(remainingRounds(5, undefined)).toBe(null);
    expect(remainingRounds(5, { seconds: 60 })).toBe(null);
  });

  it("startRound가 없으면 아직 세지 않은 것으로 보고 rounds를 그대로 돌려준다", () => {
    expect(remainingRounds(5, { rounds: 3 })).toBe(3);
  });

  it("경과한 라운드를 뺀 나머지를 돌려준다", () => {
    expect(remainingRounds(9, { rounds: 3, startRound: 8 })).toBe(2);
  });

  it("전부 경과했으면 0이다", () => {
    expect(remainingRounds(11, { rounds: 3, startRound: 8 })).toBe(0);
  });

  it("만료 시점을 지났으면 음수가 된다", () => {
    expect(remainingRounds(13, { rounds: 3, startRound: 8 })).toBe(-2);
  });
});

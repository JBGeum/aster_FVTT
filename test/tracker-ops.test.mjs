import { describe, it, expect } from "vitest";
import { applyDelta, applySet } from "../module/helpers/tracker-ops.mjs";

const base = () => [
  { id: "a", name: "스케치 합산", value: 143, goal: 150 },
  { id: "b", name: "경과시간", value: 3, goal: null },
];

describe("applyDelta", () => {
  it("현재값에 증분을 더한다", () => {
    const r = applyDelta(base(), "a", 9);
    expect(r.trackers[0].value).toBe(152);
  });

  it("목표에 처음 도달하면 reached가 참이다", () => {
    expect(applyDelta(base(), "a", 7).reached).toBe(true);
  });

  it("목표에 못 미치면 reached가 거짓이다", () => {
    expect(applyDelta(base(), "a", 6).reached).toBe(false);
  });

  it("이미 도달한 트래커를 더 올려도 reached가 거짓이다", () => {
    const reached = applyDelta(base(), "a", 10).trackers;
    expect(applyDelta(reached, "a", 5).reached).toBe(false);
  });

  it("목표가 없는 트래커는 reached가 항상 거짓이다", () => {
    expect(applyDelta(base(), "b", 100).reached).toBe(false);
  });

  it("없는 id는 아무것도 바꾸지 않는다", () => {
    const r = applyDelta(base(), "zzz", 5);
    expect(r.trackers).toEqual(base());
    expect(r.reached).toBe(false);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const original = base();
    applyDelta(original, "a", 9);
    expect(original[0].value).toBe(143);
  });

  it("갱신 전 값을 함께 돌려준다", () => {
    expect(applyDelta(base(), "a", 9).before).toBe(143);
  });

  it("없는 id면 before가 null이다", () => {
    expect(applyDelta(base(), "zzz", 5).before).toBe(null);
  });
});

describe("applySet", () => {
  it("현재값을 입력값으로 덮어쓴다", () => {
    expect(applySet(base(), "a", 0).trackers[0].value).toBe(0);
  });

  it("설정으로 목표에 도달해도 reached가 참이다", () => {
    expect(applySet(base(), "a", 150).reached).toBe(true);
  });

  it("목표 아래로 되돌리면 reached가 거짓이다", () => {
    expect(applySet(base(), "a", 10).reached).toBe(false);
  });

  it("갱신 전 값을 함께 돌려준다", () => {
    expect(applySet(base(), "a", 10).before).toBe(143);
  });
});

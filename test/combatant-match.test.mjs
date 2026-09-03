import { describe, it, expect } from "vitest";
import { findCombatantFor } from "../module/helpers/combatant-match.mjs";

const world = (id) => ({ id, token: null });
const tokenActor = (id, tokenId) => ({ id, token: { id: tokenId } });

describe("findCombatantFor", () => {
  it("같은 베이스의 형제 토큰이 각자 자기 combatant를 잡는다", () => {
    const list = [
      { tokenId: "t1", actorId: "base" },
      { tokenId: "t2", actorId: "base" },
    ];
    expect(findCombatantFor(list, tokenActor("base", "t2"))).toBe(list[1]);
    expect(findCombatantFor(list, tokenActor("base", "t1"))).toBe(list[0]);
  });

  it("토큰 액터인데 그 tokenId의 combatant가 없으면 null — actorId로 떨어지지 않는다", () => {
    const list = [{ tokenId: "t1", actorId: "base" }];
    expect(findCombatantFor(list, tokenActor("base", "t9"))).toBeNull();
  });

  it("월드 액터는 actorId로 잡는다", () => {
    const list = [{ tokenId: "t1", actorId: "npc1" }];
    expect(findCombatantFor(list, world("npc1"))).toBe(list[0]);
  });

  it("맞는 것이 없으면 null", () => {
    expect(findCombatantFor([{ tokenId: "t1", actorId: "a" }], world("b"))).toBeNull();
  });

  it("빈 목록이면 null", () => {
    expect(findCombatantFor([], world("a"))).toBeNull();
  });

  it("actor가 없으면 null", () => {
    expect(findCombatantFor([{ tokenId: "t1", actorId: "a" }], null)).toBeNull();
    expect(findCombatantFor([{ tokenId: "t1", actorId: "a" }], undefined)).toBeNull();
  });
});

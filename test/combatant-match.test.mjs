import { describe, it, expect } from "vitest";
import { findCombatantFor, hasAmbiguousCombatants } from "../module/helpers/combatant-match.mjs";

const world = (id) => ({ id, token: null });
const tokenActor = (id, tokenId) => ({ id, token: { id: tokenId } });
const row = (tokenId, actorId, actorLink = false) => ({
  tokenId,
  actorId,
  token: { actorLink },
});

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

  it("월드 액터의 후보가 여럿이면 링크된 토큰을 고른다", () => {
    const list = [row("t1", "pc"), row("t2", "pc", true), row("t3", "pc")];
    expect(findCombatantFor(list, world("pc"))).toBe(list[1]);
  });

  it("후보가 여럿인데 링크된 것이 없으면 첫 번째를 쓴다", () => {
    const list = [row("t1", "pc"), row("t2", "pc")];
    expect(findCombatantFor(list, world("pc"))).toBe(list[0]);
  });
});

describe("hasAmbiguousCombatants", () => {
  it("월드 액터의 후보가 여럿이면 참이다", () => {
    const list = [row("t1", "pc"), row("t2", "pc")];
    expect(hasAmbiguousCombatants(list, world("pc"))).toBe(true);
  });

  it("후보가 하나면 거짓이다", () => {
    expect(hasAmbiguousCombatants([row("t1", "pc")], world("pc"))).toBe(false);
  });

  it("링크된 것이 하나뿐이면 고를 수 있으므로 거짓이다", () => {
    const list = [row("t1", "pc"), row("t2", "pc", true)];
    expect(hasAmbiguousCombatants(list, world("pc"))).toBe(false);
  });

  it("링크된 것이 둘이면 그중 무엇인지 가릴 수 없어 참이다", () => {
    const list = [row("t1", "pc", true), row("t2", "pc", true)];
    expect(hasAmbiguousCombatants(list, world("pc"))).toBe(true);
  });

  it("토큰 액터는 tokenId로 정확히 찾으므로 거짓이다", () => {
    const list = [row("t1", "pc"), row("t2", "pc")];
    expect(hasAmbiguousCombatants(list, tokenActor("pc", "t2"))).toBe(false);
  });

  it("actor가 없으면 거짓이다", () => {
    expect(hasAmbiguousCombatants([row("t1", "pc")], null)).toBe(false);
  });
});

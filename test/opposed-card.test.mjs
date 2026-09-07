import { describe, expect, it } from "vitest";
import { buildOpposedCard } from "../module/helpers/opposed-card.mjs";

const mockActor = ({ type = "character" } = {}) => ({
  id: "abc123",
  uuid: "Actor.abc123",
  name: "루시",
  type,
});

const noPenalties = { sleepy: 0, satiety: 0, exhaustion: 0, total: 0 };

const baseArgs = ({
  actor = mockActor(),
  label = "회피",
  ability = "dodge",
  ablValue = 3,
  formula = null,
  isDodge = true,
  pick = { selected: [4, 5], rawTotal: 12 },
  cf = { critical: false, fumble: false },
  penalties = noPenalties,
  modifier = 0,
  focusApplied = false,
  rollResult = "4 + 5 + 3",
} = {}) => ({
  actor,
  label,
  ability,
  ablValue,
  formula,
  isDodge,
  pick,
  cf,
  penalties,
  modifier,
  focusApplied,
  rollResult,
});

describe("buildOpposedCard — templateData", () => {
  it("카드에 실을 값을 모두 조립한다", () => {
    const { templateData } = buildOpposedCard(baseArgs());

    expect(templateData).toEqual({
      label: "회피",
      ablValue: 3,
      formula: null,
      result: "4 + 5 + 3",
      total: 12,
      rawTotal: 12,
      penalties: noPenalties,
      modifierText: null,
      resultDiceset: [4, 5],
      diceText: "4, 5",
      isCritical: false,
      isFumble: false,
      focusApplied: false,
      actorId: "abc123",
      actorUuid: "Actor.abc123",
      actorName: "루시",
      isPC: true,
      opposed: true,
    });
  });

  it("isDodge를 싣지 않는다 — 어느 템플릿도 읽지 않는다", () => {
    const { templateData } = buildOpposedCard(baseArgs({ isDodge: true }));

    expect(templateData).not.toHaveProperty("isDodge");
  });

  it("NPC는 isPC가 false이고 식이 그대로 실린다", () => {
    const { templateData } = buildOpposedCard(
      baseArgs({ actor: mockActor({ type: "npc" }), formula: "2d6 + 2" }),
    );

    expect(templateData.isPC).toBe(false);
    expect(templateData.formula).toBe("2d6 + 2");
  });

  it("보정이 있으면 표기 문자열이 붙는다", () => {
    const { templateData } = buildOpposedCard(baseArgs({ modifier: 2 }));

    expect(templateData.modifierText).toBe("+2");
  });

  it("고른 눈을 쉼표로 이어 붙인다", () => {
    const { templateData } = buildOpposedCard(
      baseArgs({ pick: { selected: [6, 1], rawTotal: 7 } }),
    );

    expect(templateData.diceText).toBe("6, 1");
  });
});

describe("buildOpposedCard — 달성치", () => {
  it("보정과 페널티를 원 굴림에 더한다", () => {
    const { templateData } = buildOpposedCard(
      baseArgs({
        modifier: 2,
        penalties: { sleepy: -2, satiety: -1, exhaustion: 0, total: -3 },
      }),
    );

    expect(templateData.total).toBe(11);
  });

  it("플래그의 달성치가 카드와 같다", () => {
    const { templateData, opposedRoll } = buildOpposedCard(baseArgs({ modifier: -1 }));

    expect(opposedRoll.total).toBe(templateData.total);
    expect(opposedRoll.total).toBe(11);
  });
});

describe("buildOpposedCard — opposedRoll 플래그", () => {
  it("대결 결합이 읽는 값을 모두 담는다", () => {
    const { opposedRoll } = buildOpposedCard(baseArgs());

    expect(opposedRoll).toEqual({
      actorId: "abc123",
      actorUuid: "Actor.abc123",
      actorName: "루시",
      label: "회피",
      ability: "dodge",
      ablValue: 3,
      total: 12,
      dice: [4, 5],
      isCritical: false,
      isFumble: false,
      isDodge: true,
    });
  });

  it("회피가 아니면 isDodge가 false다", () => {
    const { opposedRoll } = buildOpposedCard(
      baseArgs({ label: "명중", ability: "hit", ablValue: 0, isDodge: false }),
    );

    expect(opposedRoll.isDodge).toBe(false);
    expect(opposedRoll.ability).toBe("hit");
  });

  it("isDodge를 넘기지 않으면 false다 — 능력치 대결 판정", () => {
    const args = baseArgs({ label: "활발", ability: "active" });
    delete args.isDodge;

    const { opposedRoll } = buildOpposedCard(args);

    expect(opposedRoll.isDodge).toBe(false);
  });

  it("대성공·대실패가 카드와 플래그 양쪽에 실린다", () => {
    const { templateData, opposedRoll } = buildOpposedCard(
      baseArgs({ cf: { critical: true, fumble: false } }),
    );

    expect(templateData.isCritical).toBe(true);
    expect(opposedRoll.isCritical).toBe(true);
    expect(opposedRoll.isFumble).toBe(false);
  });
});

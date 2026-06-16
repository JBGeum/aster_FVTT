import { describe, it, expect } from "vitest";
import { buildItemCardData } from "../module/helpers/item-chat.mjs";

// identity localizer — 키가 그대로 반환되므로 어떤 lang 키가 쓰였는지 검증 가능.
const L = (k) => k;

function makeItem(type, system = {}, extra = {}) {
  return {
    type,
    name: extra.name ?? "테스트",
    img: extra.img ?? "icons/x.png",
    system,
  };
}

describe("buildItemCardData — 헤더/기본", () => {
  it("이름·이미지·description 패스스루", () => {
    const d = buildItemCardData(
      makeItem("consumable", { description: "<p>설명</p>" }, { name: "회복약", img: "a.png" }),
      L,
    );
    expect(d.itemName).toBe("회복약");
    expect(d.itemImg).toBe("a.png");
    expect(d.description).toBe("<p>설명</p>");
  });
  it("알려진 타입은 typeLabel 설정", () => {
    expect(buildItemCardData(makeItem("consumable"), L).typeLabel).toBe(
      "ASTER.itemType.consumable",
    );
    expect(buildItemCardData(makeItem("bag"), L).typeLabel).toBe("ASTER.itemType.bag");
  });
  it("알 수 없는 타입은 typeLabel 빈 문자열", () => {
    expect(buildItemCardData(makeItem("npcaction"), L).typeLabel).toBe("");
  });
  it("description·메타 모두 없으면 description 빈 문자열·meta 빈 배열", () => {
    const d = buildItemCardData(makeItem("feature", {}), L);
    expect(d.meta).toEqual([]);
    expect(d.description).toBe("");
  });
});

describe("buildItemCardData — 공통 메타", () => {
  it("effect 있으면 효과 라인", () => {
    const d = buildItemCardData(makeItem("equipment", { effect: "공격 +1" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-bolt",
      label: "ASTER.item.effect",
      value: "공격 +1",
    });
  });
  it("effect 공백이면 라인 없음", () => {
    const d = buildItemCardData(makeItem("equipment", { effect: "  " }), L);
    expect(d.meta.find((m) => m.label === "ASTER.item.effect")).toBeUndefined();
  });
  it("requirement 있으면 작성 전제 라인", () => {
    const d = buildItemCardData(makeItem("equipment", { requirement: "박식 3" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-clipboard-list",
      label: "ASTER.equipment.requirement",
      value: "박식 3",
    });
  });
});

describe("buildItemCardData — 소비품", () => {
  it("healHealth>0 → 건강 회복 라인 (+N)", () => {
    const d = buildItemCardData(makeItem("consumable", { healHealth: 8 }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-heart",
      label: "ASTER.consumable.healHealth",
      value: "+8",
    });
  });
  it("healHealth 0이면 라인 없음", () => {
    const d = buildItemCardData(makeItem("consumable", { healHealth: 0 }), L);
    expect(d.meta.find((m) => m.label === "ASTER.consumable.healHealth")).toBeUndefined();
  });
  it("cureStatus 목록 → badstatus 라벨 join (bigInj→biginj)", () => {
    const d = buildItemCardData(makeItem("consumable", { cureStatus: ["injury", "bigInj"] }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-hand-sparkles",
      label: "ASTER.consumable.cureResult",
      value: "ASTER.badstatus.injury, ASTER.badstatus.biginj",
    });
  });
  it("cureAllStatus가 cureStatus보다 우선", () => {
    const d = buildItemCardData(
      makeItem("consumable", { cureAllStatus: true, cureStatus: ["injury"] }),
      L,
    );
    const cureLines = d.meta.filter((m) => m.label === "ASTER.consumable.cureResult");
    expect(cureLines).toHaveLength(1);
    expect(cureLines[0].value).toBe("ASTER.consumable.cureAllResult");
  });
  it("timing 있으면 타이밍 라인", () => {
    const d = buildItemCardData(makeItem("consumable", { timing: "전투 중" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-hourglass-half",
      label: "ASTER.consumable.timingLabel",
      value: "전투 중",
    });
  });
});

describe("buildItemCardData — 음식", () => {
  it("restore>0 → 포만 회복 라인 (+N)", () => {
    const d = buildItemCardData(makeItem("food", { restore: 4 }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-drumstick-bite",
      label: "ASTER.food.restore",
      value: "+4",
    });
  });
  it("bonusEffect → 효과 라인", () => {
    const d = buildItemCardData(makeItem("food", { bonusEffect: "다음 판정 +1" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-star",
      label: "ASTER.item.effect",
      value: "다음 판정 +1",
    });
  });
});

describe("buildItemCardData — 장비", () => {
  it("type 있으면 카테고리 라인 (값도 localize)", () => {
    const d = buildItemCardData(makeItem("equipment", { type: "magicTool" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-tag",
      label: "ASTER.equipment.type.label",
      value: "ASTER.equipment.type.magicTool",
    });
  });
  it("마법구가 장비란 밖(container:'')이면 비활성 경고", () => {
    const d = buildItemCardData(makeItem("equipment", { type: "magicTool", container: "" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-triangle-exclamation",
      label: "ASTER.equipment.inactiveBadge",
      value: "",
    });
  });
  it("마법구가 장비란(equip-1)에 있으면 경고 없음", () => {
    const d = buildItemCardData(
      makeItem("equipment", { type: "magicTool", container: "equip-1" }),
      L,
    );
    expect(d.meta.find((m) => m.label === "ASTER.equipment.inactiveBadge")).toBeUndefined();
  });
});

describe("buildItemCardData — 가방", () => {
  it("격자 용량 라인", () => {
    const d = buildItemCardData(makeItem("bag", { grid: { cols: 6, rows: 4 } }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-box",
      label: "ASTER.itemcard.capacity",
      value: "6×4",
    });
  });
});

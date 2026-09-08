import { describe, it, expect } from "vitest";
import { parseSpellCost } from "../module/helpers/spell-cost.mjs";

describe("parseSpellCost", () => {
  it("숫자형은 AP 수치를 읽는다", () => {
    expect(parseSpellCost("[4/3D6+(사용자의 박식)점의 대미지를 준다]의 액션")).toEqual({
      ap: 4,
      interrupt: false,
    });
    expect(parseSpellCost("[1/다음 라운드, 자신의 민첩을 +(사용자의 활발)한다]의 액션")).toEqual({
      ap: 1,
      interrupt: false,
    });
  });

  it("끼어들기형은 AP를 쓰지 않는다", () => {
    expect(parseSpellCost("[끼어들기/적의 타겟을 자신으로 바꾼다]의 액션")).toEqual({
      ap: 0,
      interrupt: true,
    });
  });

  it("효과문 뒤에 GM 재정 문구가 붙어도 읽는다", () => {
    const effect =
      "[3/PC 전원이 요령(10) 판정으로 성공하면 도주가능]의 액션. 무리한 상황이라면 GM은 마법 사용을 기각해도 좋다.";
    expect(parseSpellCost(effect)).toEqual({ ap: 3, interrupt: false });
  });

  it("효과문이 없으면 비용이 없다", () => {
    expect(parseSpellCost("")).toEqual({ ap: 0, interrupt: false });
    expect(parseSpellCost(undefined)).toEqual({ ap: 0, interrupt: false });
  });

  it("형식이 어긋나면 비용 없음으로 떨어진다", () => {
    expect(parseSpellCost("대상 1체에게 2점의 대미지")).toEqual({ ap: 0, interrupt: false });
    expect(parseSpellCost("[대미지/2점]의 액션")).toEqual({ ap: 0, interrupt: false });
    expect(parseSpellCost("[/효과]의 액션")).toEqual({ ap: 0, interrupt: false });
  });

  it("앞에 공백이 있어도 읽는다", () => {
    expect(parseSpellCost("  [3/1D6점 대미지]의 액션")).toEqual({ ap: 3, interrupt: false });
  });

  it("끼어들기에 수식어가 붙으면 태그를 잃는다 — 비용은 0으로 안전하다", () => {
    expect(parseSpellCost("[끼어들기(라운드 1회)/판정 -3]의 액션")).toEqual({
      ap: 0,
      interrupt: false,
    });
  });
});

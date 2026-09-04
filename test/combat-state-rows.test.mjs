import { describe, it, expect } from "vitest";
import { buildCombatStateRows } from "../module/helpers/combat-state-rows.mjs";

const inCombat = (over = {}) => ({ inCombat: true, ...over });

describe("buildCombatStateRows", () => {
  it("전투 중이 아니면 빈 배열이다", () => {
    expect(buildCombatStateRows(undefined)).toEqual([]);
    expect(buildCombatStateRows({ inCombat: false, damageBlocked: true })).toEqual([]);
  });

  it("켜진 상태가 없으면 빈 배열이다", () => {
    expect(buildCombatStateRows(inCombat({ damageReduction: 0, defendActive: false }))).toEqual([]);
  });

  it("대미지 경감은 수치와 함께 나온다", () => {
    const rows = buildCombatStateRows(inCombat({ damageReduction: 2 }));
    expect(rows).toEqual([{ label: "ASTER.combat.state.damageReduction", value: 2 }]);
  });

  it("대미지 경감이 0이면 나오지 않는다", () => {
    expect(buildCombatStateRows(inCombat({ damageReduction: 0 }))).toEqual([]);
  });

  it("방어·집중·합체기 준비는 효과 설명을 함께 싣는다", () => {
    expect(buildCombatStateRows(inCombat({ defendActive: true }))).toEqual([
      { label: "ASTER.combat.state.defendActive", detail: "ASTER.combat.defendEffect" },
    ]);
    expect(buildCombatStateRows(inCombat({ focusActive: true }))).toEqual([
      { label: "ASTER.combat.state.focusActive", detail: "ASTER.combat.focusEffect" },
    ]);
    expect(buildCombatStateRows(inCombat({ unisonReady: true }))).toEqual([
      { label: "ASTER.combat.state.unisonReady", detail: "ASTER.combat.unisonPrepareEffect" },
    ]);
  });

  it("대미지 무효는 설명만 싣는다", () => {
    expect(buildCombatStateRows(inCombat({ damageBlocked: true }))).toEqual([
      { label: "ASTER.combat.state.damageBlocked", detail: "ASTER.effects.blockedDetail" },
    ]);
  });

  it("여러 상태는 경감·무효·방어·집중·합체기 순으로 나온다", () => {
    const rows = buildCombatStateRows(
      inCombat({
        damageReduction: 1,
        damageBlocked: true,
        defendActive: true,
        focusActive: true,
        unisonReady: true,
      }),
    );
    expect(rows.map((r) => r.label)).toEqual([
      "ASTER.combat.state.damageReduction",
      "ASTER.combat.state.damageBlocked",
      "ASTER.combat.state.defendActive",
      "ASTER.combat.state.focusActive",
      "ASTER.combat.state.unisonReady",
    ]);
  });
});

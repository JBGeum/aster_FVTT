import { describe, it, expect } from "vitest";
import {
  prereqMet,
  acquiredDependents,
  sumCost,
  checkAffordable,
  canAcquire,
  canRelease,
} from "../module/helpers/craft-cost.mjs";

// ── prereqMet ────────────────────────────────────────────────────────────────

describe("prereqMet", () => {
  it("선행 없으면 항상 충족", () => {
    expect(prereqMet("pot_cauldron_1", {})).toBe(true);
  });
  it("선행 미취득이면 불충족", () => {
    expect(prereqMet("pot_cauldron_2", {})).toBe(false);
  });
  it("선행 취득이면 충족", () => {
    expect(prereqMet("pot_cauldron_2", { pot_cauldron_1: true })).toBe(true);
  });
  it("복수 선행: 일부만 취득이면 불충족", () => {
    // div_tarot_2는 div_tarot_1이 선행
    expect(prereqMet("div_tarot_2", { div_crystal_1: true })).toBe(false);
  });
  it("존재하지 않는 id는 false", () => {
    expect(prereqMet("nonexistent_skill", {})).toBe(false);
  });
  it("false 값은 미취득으로 간주", () => {
    expect(prereqMet("pot_cauldron_2", { pot_cauldron_1: false })).toBe(false);
  });
});

// ── acquiredDependents ───────────────────────────────────────────────────────

describe("acquiredDependents", () => {
  it("후속이 없으면 빈 배열", () => {
    expect(
      acquiredDependents("pot_cauldron_2", { pot_cauldron_1: true, pot_cauldron_2: true }),
    ).toEqual([]);
  });
  it("취득된 후속이 있으면 해당 id 반환", () => {
    const acq = { pot_cauldron_1: true, pot_cauldron_2: true };
    expect(acquiredDependents("pot_cauldron_1", acq)).toContain("pot_cauldron_2");
  });
  it("후속이 미취득이면 포함 안 함", () => {
    expect(acquiredDependents("pot_cauldron_1", { pot_cauldron_1: true })).toEqual([]);
  });
  it("분기 선행: crystal_1이 tarot_1, astro_1 양쪽 선행", () => {
    const acq = { div_crystal_1: true, div_tarot_1: true, div_astro_1: true };
    const deps = acquiredDependents("div_crystal_1", acq);
    expect(deps).toContain("div_tarot_1");
    expect(deps).toContain("div_astro_1");
  });
});

// ── sumCost ──────────────────────────────────────────────────────────────────

describe("sumCost", () => {
  it("빈 취득이면 모두 0", () => {
    const s = sumCost({});
    expect(s.material).toBe(0);
    expect(s.anyAster).toBe(0);
    expect(s.aster.red).toBe(0);
  });
  it("false 항목은 제외", () => {
    const s = sumCost({ pot_cauldron_1: false });
    expect(s.material).toBe(0);
  });
  it("pot_cauldron_1 단독: material=20, red=2, yellow=1", () => {
    const s = sumCost({ pot_cauldron_1: true });
    expect(s.material).toBe(20);
    expect(s.aster.red).toBe(2);
    expect(s.aster.yellow).toBe(1);
    expect(s.aster.blue).toBe(0);
  });
  it("cauldron 1+2 합산", () => {
    const s = sumCost({ pot_cauldron_1: true, pot_cauldron_2: true });
    expect(s.material).toBe(60); // 20+40
    expect(s.aster.red).toBe(5); // 2+3
    expect(s.aster.yellow).toBe(3); // 1+2
  });
  it("anyAster 합산 (사역마)", () => {
    const s = sumCost({ fam_crow: true, fam_owl: true });
    expect(s.anyAster).toBe(8); // 4+4
    expect(s.material).toBe(160);
  });
});

// ── checkAffordable ──────────────────────────────────────────────────────────

describe("checkAffordable", () => {
  const rich = { material: 999, aster: { red: 99, blue: 99, green: 99, yellow: 99, white: 99 } };
  const poor = { material: 0, aster: { red: 0, blue: 0, green: 0, yellow: 0, white: 0 } };

  it("자원 충분하면 ok=true", () => {
    expect(checkAffordable({ pot_cauldron_1: true }, rich).ok).toBe(true);
  });
  it("마테리얼 부족이면 MATERIAL_SHORT", () => {
    const r = checkAffordable({ pot_cauldron_1: true }, poor);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("MATERIAL_SHORT");
  });
  it("아스테르 red 부족이면 ASTER_RED_SHORT", () => {
    const res = { material: 999, aster: { red: 0, blue: 0, green: 0, yellow: 0, white: 0 } };
    const r = checkAffordable({ pot_cauldron_1: true }, res);
    expect(r.reasons).toContain("ASTER_RED_SHORT");
  });
  it("anyAster는 총합으로 충당 (ASTER_TOTAL_SHORT)", () => {
    // fam_crow: material=80, anyAster=4. white=3이면 총합 부족
    const res = { material: 999, aster: { red: 0, blue: 0, green: 0, yellow: 0, white: 3 } };
    const r = checkAffordable({ fam_crow: true }, res);
    expect(r.reasons).toContain("ASTER_TOTAL_SHORT");
  });
  it("anyAster: 총합이 충분하면 ok", () => {
    const res = { material: 999, aster: { red: 0, blue: 0, green: 0, yellow: 0, white: 4 } };
    expect(checkAffordable({ fam_crow: true }, res).ok).toBe(true);
  });
});

// ── canAcquire ───────────────────────────────────────────────────────────────

describe("canAcquire", () => {
  it("선행 없음 → ok", () => {
    expect(canAcquire("pot_cauldron_1", {}).ok).toBe(true);
  });
  it("이미 취득 → ALREADY", () => {
    expect(canAcquire("pot_cauldron_1", { pot_cauldron_1: true }).reasons).toContain("ALREADY");
  });
  it("선행 미충족 → PREREQ", () => {
    expect(canAcquire("pot_cauldron_2", {}).reasons).toContain("PREREQ");
  });
  it("비용은 판정하지 않는다 — 자원이 없어도 선행만 맞으면 ok (차감은 핸들러가 수행, 음수 허용)", () => {
    expect(canAcquire("fam_crow", {}).ok).toBe(true);
    expect(canAcquire("pot_cauldron_1", {}).ok).toBe(true);
  });
});

// ── canRelease ───────────────────────────────────────────────────────────────

describe("canRelease", () => {
  it("미취득이면 NOT_ACQUIRED", () => {
    expect(canRelease("pot_cauldron_1", {}).reasons).toContain("NOT_ACQUIRED");
  });
  it("후속 취득 상태면 HAS_DEPENDENTS + 목록 포함", () => {
    const acq = { pot_cauldron_1: true, pot_cauldron_2: true };
    const r = canRelease("pot_cauldron_1", acq);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("HAS_DEPENDENTS");
    expect(r.dependents).toContain("pot_cauldron_2");
  });
  it("후속 없으면 해제 허용", () => {
    const acq = { pot_cauldron_1: true, pot_cauldron_2: true };
    expect(canRelease("pot_cauldron_2", acq).ok).toBe(true);
  });
  it("분기 선행 해제: 후속 하나라도 취득이면 거부", () => {
    const acq = { div_crystal_1: true, div_tarot_1: true };
    const r = canRelease("div_crystal_1", acq);
    expect(r.ok).toBe(false);
    expect(r.dependents).toContain("div_tarot_1");
  });
});

import { describe, it, expect } from "vitest";
import { checkCraftRequires, getCraftRequiresBaseList } from "../module/helpers/craft-item.mjs";

// ── checkCraftRequires ────────────────────────────────────────────────────────
// craftRequires { [노드 base]: 최소레벨 } 를 acquired { 노드id: bool } 와 대조.
// 노드 id 규약: `{base}_{level}` (예: pot_cauldron_1). 같은 base의 *최대 취득 레벨* 비교.

describe("checkCraftRequires", () => {
  it("빈 전제는 항상 충족", () => {
    expect(checkCraftRequires({}, {}).ok).toBe(true);
    expect(checkCraftRequires({}, { pot_cauldron_1: true }).ok).toBe(true);
  });

  it("전제 설비 미취득이면 미충족 + missing 보고", () => {
    const r = checkCraftRequires({ pot_cauldron: 1 }, {});
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([{ base: "pot_cauldron", requiredLevel: 1, have: 0 }]);
  });

  it("필요 레벨 이상 취득이면 충족", () => {
    expect(checkCraftRequires({ pot_cauldron: 1 }, { pot_cauldron_1: true }).ok).toBe(true);
  });

  it("같은 base의 최대 취득 레벨로 비교", () => {
    const acquired = { pot_cauldron_1: true, pot_cauldron_2: true };
    expect(checkCraftRequires({ pot_cauldron: 2 }, acquired).ok).toBe(true);
    expect(checkCraftRequires({ pot_cauldron: 3 }, acquired).ok).toBe(false);
  });

  it("false 취득은 무시", () => {
    const r = checkCraftRequires({ pot_cauldron: 1 }, { pot_cauldron_1: false });
    expect(r.ok).toBe(false);
    expect(r.missing[0].have).toBe(0);
  });

  it("여러 전제 중 하나라도 미충족이면 미충족", () => {
    const acquired = { pot_cauldron_2: true };
    const r = checkCraftRequires({ pot_cauldron: 1, cook_oven: 1 }, acquired);
    expect(r.ok).toBe(false);
    expect(r.missing.map((m) => m.base)).toEqual(["cook_oven"]);
  });
});

// ── getCraftRequiresBaseList (C3) ─────────────────────────────────────────────

describe("getCraftRequiresBaseList", () => {
  const list = getCraftRequiresBaseList();
  const bases = list.map((b) => b.base);

  it("각 항목은 base·category·label을 가진다", () => {
    expect(list.length).toBeGreaterThan(0);
    for (const b of list) {
      expect(b).toHaveProperty("base");
      expect(b).toHaveProperty("category");
      expect(b.label).toMatch(/^ASTER\.craft\./);
    }
  });

  it("같은 base의 여러 레벨은 하나로 합쳐진다", () => {
    expect(bases.filter((b) => b === "pot_cauldron")).toHaveLength(1);
  });

  it("레벨 없는 노드(사역마 fam_*)는 제외된다", () => {
    expect(bases.some((b) => b.startsWith("fam_"))).toBe(false);
  });

  it("접두사 base를 그대로 노출한다 (검증 키와 일치)", () => {
    expect(bases).toContain("tal_carve");
    expect(bases).toContain("cook_hearth");
  });
});

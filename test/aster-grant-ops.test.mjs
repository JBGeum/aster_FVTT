import { describe, it, expect } from "vitest";
import {
  entryTotal,
  validateGrantEntries,
  applySpecialtyBonus,
  buildGrantRows,
} from "../module/helpers/aster-grant-ops.mjs";

const gains = (over = {}) => ({ red: 0, blue: 0, green: 0, yellow: 0, white: 0, ...over });
const entry = (name, over = {}) => ({
  actorId: `id-${name}`,
  name,
  favColor: null,
  gains: gains(),
  any: 0,
  bonus: null,
  ...over,
});

describe("entryTotal", () => {
  it("확정 색과 임의를 함께 센다", () => {
    expect(entryTotal(entry("A", { gains: gains({ red: 1, blue: 2 }), any: 1 }))).toBe(4);
  });
});

describe("validateGrantEntries", () => {
  it("합계 1과 5는 통과한다", () => {
    const entries = [
      entry("A", { gains: gains({ red: 1 }) }),
      entry("B", { gains: gains({ red: 2, green: 3 }) }),
    ];
    expect(validateGrantEntries(entries)).toEqual({ ok: true, invalid: [] });
  });

  it("합계 0은 걸러낸다", () => {
    const result = validateGrantEntries([entry("A")]);
    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([{ name: "A", total: 0 }]);
  });

  it("합계 6은 걸러낸다", () => {
    const result = validateGrantEntries([entry("A", { gains: gains({ red: 6 }) })]);
    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([{ name: "A", total: 6 }]);
  });

  it("임의만 받아도 합계에 포함된다", () => {
    expect(validateGrantEntries([entry("A", { any: 2 })]).ok).toBe(true);
  });
});

describe("applySpecialtyBonus", () => {
  it("특기색과 일치한 색을 1 올리고 bonus에 색을 남긴다", () => {
    const out = applySpecialtyBonus([
      entry("A", { favColor: "red", gains: gains({ red: 1, blue: 1 }) }),
    ]);
    expect(out[0].gains.red).toBe(2);
    expect(out[0].gains.blue).toBe(1);
    expect(out[0].bonus).toBe("red");
  });

  it("지급 색에 특기색이 없으면 그대로 둔다", () => {
    const out = applySpecialtyBonus([entry("A", { favColor: "white", gains: gains({ red: 1 }) })]);
    expect(out[0].gains.red).toBe(1);
    expect(out[0].bonus).toBe(null);
  });

  it("favColor가 없으면 그대로 둔다", () => {
    const out = applySpecialtyBonus([entry("A", { gains: gains({ red: 1 }) })]);
    expect(out[0].bonus).toBe(null);
  });

  it("임의만 받은 PC에는 보너스가 붙지 않는다", () => {
    const out = applySpecialtyBonus([entry("A", { favColor: "red", any: 2 })]);
    expect(out[0].bonus).toBe(null);
    expect(out[0].gains.red).toBe(0);
  });

  it("원본 entries를 바꾸지 않는다", () => {
    const src = [entry("A", { favColor: "red", gains: gains({ red: 1 }) })];
    applySpecialtyBonus(src);
    expect(src[0].gains.red).toBe(1);
  });
});

describe("buildGrantRows", () => {
  it("값이 모두 같으면 한 행으로 묶고 이름을 모은다", () => {
    const rows = buildGrantRows([
      entry("A", { gains: gains({ red: 1, blue: 1 }) }),
      entry("B", { gains: gains({ red: 1, blue: 1 }) }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].names).toEqual(["A", "B"]);
    expect(rows[0].actorId).toBe(null);
  });

  it("값이 다르면 PC마다 한 행이다", () => {
    const rows = buildGrantRows([
      entry("A", { gains: gains({ red: 1 }) }),
      entry("B", { gains: gains({ blue: 1 }) }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].actorId).toBe("id-A");
  });

  it("임의가 있으면 값이 같아도 묶지 않는다", () => {
    const rows = buildGrantRows([entry("A", { any: 2 }), entry("B", { any: 2 })]);
    expect(rows).toHaveLength(2);
    expect(rows[0].any).toBe(2);
  });

  it("보너스가 있으면 값이 같아도 묶지 않는다", () => {
    const rows = buildGrantRows([
      entry("A", { gains: gains({ red: 2 }), bonus: "red" }),
      entry("B", { gains: gains({ red: 2 }), bonus: "red" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].bonus).toBe("red");
  });

  it("혼자면 묶지 않고 actorId를 남긴다", () => {
    const rows = buildGrantRows([entry("A", { gains: gains({ red: 1 }) })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBe("id-A");
  });

  it("0인 색은 칩에서 빠지고 순서는 시트와 같은 적·청·녹·황·백이다", () => {
    const rows = buildGrantRows([entry("A", { gains: gains({ green: 1, red: 2, white: 1 }) })]);
    expect(rows[0].chips).toEqual([
      { color: "red", n: 2 },
      { color: "green", n: 1 },
      { color: "white", n: 1 },
    ]);
  });
});

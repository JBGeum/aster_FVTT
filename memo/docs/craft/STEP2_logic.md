# STEP 2 — 선행 검사 + 비용 합계 검사 (순수 함수 + Vitest)

> 목표: UI 무관 순수 함수로 (1) 선행 충족, (2) 비용 합계 ≤ 보유 자원을 검사.
> 선행: STEP1. UI 불필요 — 독립 진행.
> 산출: 커밋 1개. `feat(craft): add prerequisite and cost-sum checks with tests`

---

## 2-1. 규칙 (확정)

- **선행:** 노드의 `requires`에 있는 모든 id가 `acquired`에 있어야 취득 가능.
- **선행 해제 거부:** 어떤 노드를 해제하려는데, 그 노드를 `requires`로 가진 **취득된 후속**이 있으면 해제 거부.
- **비용 합계:** 취득(예정 포함) 노드들의 비용을 합산.
  - 마테리얼 합 ≤ 보유 마테리얼
  - 색별 아스테르: 합산하되, **임의(anyAster)는 색 구분 없이 아스테르 총합에만 더함**
  - 검사 방식(기본): **총합 비교** — (모든 색 고정비용 합 + 임의 합) ≤ (보유 아스테르 5색 총합) AND 색별 고정비용 합 ≤ 각 색 보유량
- **결합 시점:** 취득 시 초과면 거부(예정 집합으로 검사) / 이미 초과면 표시(현재 집합으로 검사). 같은 함수 사용.

---

## 2-2. 구현 (module/helpers/craft-cost.mjs)

```js
import { CRAFT_TREE } from "./craft-tree.mjs";

const NODE_MAP = Object.fromEntries(CRAFT_TREE.nodes.map((n) => [n.id, n]));

/** 선행 충족 여부 */
export function prereqMet(skillId, acquired) {
  const node = NODE_MAP[skillId];
  if (!node) return false;
  return node.requires.every((req) => acquired[req] === true);
}

/** 이 노드를 requires로 가진 취득된 후속들 (해제 거부 판단용) */
export function acquiredDependents(skillId, acquired) {
  return CRAFT_TREE.nodes
    .filter((n) => n.requires.includes(skillId) && acquired[n.id] === true)
    .map((n) => n.id);
}

/** 취득 집합의 비용 합산 */
export function sumCost(acquired) {
  const sum = { material: 0, aster: { red: 0, blue: 0, green: 0, yellow: 0 }, anyAster: 0 };
  for (const id of Object.keys(acquired)) {
    if (!acquired[id]) continue;
    const node = NODE_MAP[id];
    if (!node) continue;
    sum.material += node.cost.material;
    for (const c of ["red", "blue", "green", "yellow"]) sum.aster[c] += node.cost.aster[c];
    sum.anyAster += node.cost.anyAster;
  }
  return sum;
}

/**
 * 비용 합계가 보유 자원 내인지 검사.
 * @param {object} acquired  취득 맵(예정 포함 가능)
 * @param {object} resources { material:number, aster:{red,blue,green,yellow} }
 * @returns {{ ok:boolean, reasons:string[] }}
 */
export function checkAffordable(acquired, resources) {
  const reasons = [];
  const cost = sumCost(acquired);

  // 마테리얼
  if (cost.material > (resources.material ?? 0)) reasons.push("MATERIAL_SHORT");

  // 색별 고정비용은 각 색 보유량을 넘으면 안 됨
  const have = resources.aster ?? { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of ["red", "blue", "green", "yellow"]) {
    if (cost.aster[c] > (have[c] ?? 0)) reasons.push(`ASTER_${c.toUpperCase()}_SHORT`);
  }

  // 총합: 색별 고정 합 + 임의 ≤ 5색 보유 총합
  //  (white 포함 여부는 게임 규칙 확인. 여기선 red/blue/green/yellow + white 총합 사용)
  const haveTotal = ["red", "blue", "green", "yellow", "white"].reduce(
    (s, c) => s + (have[c] ?? 0),
    0,
  );
  const costTotal =
    cost.aster.red + cost.aster.blue + cost.aster.green + cost.aster.yellow + cost.anyAster;
  if (costTotal > haveTotal) reasons.push("ASTER_TOTAL_SHORT");

  return { ok: reasons.length === 0, reasons };
}

/** 취득 시도: 선행 + 비용을 한 번에 판정 (예정 집합으로) */
export function canAcquire(skillId, acquired, resources) {
  const reasons = [];
  if (acquired[skillId]) return { ok: false, reasons: ["ALREADY"] };
  if (!prereqMet(skillId, acquired)) reasons.push("PREREQ");

  const next = { ...acquired, [skillId]: true };
  const afford = checkAffordable(next, resources);
  if (!afford.ok) reasons.push(...afford.reasons);

  return { ok: reasons.length === 0, reasons };
}

/** 해제 시도 판정 */
export function canRelease(skillId, acquired) {
  if (!acquired[skillId]) return { ok: false, reasons: ["NOT_ACQUIRED"] };
  const deps = acquiredDependents(skillId, acquired);
  if (deps.length) return { ok: false, reasons: ["HAS_DEPENDENTS"], dependents: deps };
  return { ok: true, reasons: [] };
}
```

> **확인:** white 아스테르가 비용에 쓰이는지/보유 총합에 포함되는지 게임 규칙 확인. 위는 총합에 white 포함 가정.
> 색별 검사를 "각 색 ≤ 보유"로 둘지, 순수 총합만 볼지도 규칙 따라 조정. 기본은 색별+총합 둘 다.

---

## 2-3. Vitest (test/craft-cost.test.mjs)

```js
import { describe, it, expect, vi } from "vitest";
// CRAFT_TREE를 테스트용으로 모킹하거나, 실제 정의 중 일부 노드로 검증.
import {
  prereqMet,
  acquiredDependents,
  sumCost,
  checkAffordable,
  canAcquire,
  canRelease,
} from "../module/helpers/craft-cost.mjs";

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
});

describe("canRelease", () => {
  it("후속 취득 상태면 해제 거부", () => {
    const acq = { pot_cauldron_1: true, pot_cauldron_2: true };
    const r = canRelease("pot_cauldron_1", acq);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("HAS_DEPENDENTS");
  });
  it("후속 없으면 해제 허용", () => {
    expect(canRelease("pot_cauldron_2", { pot_cauldron_1: true, pot_cauldron_2: true }).ok).toBe(
      true,
    );
  });
});

describe("checkAffordable / canAcquire", () => {
  const rich = { material: 999, aster: { red: 99, blue: 99, green: 99, yellow: 99, white: 99 } };
  const poor = { material: 0, aster: { red: 0, blue: 0, green: 0, yellow: 0, white: 0 } };

  it("자원 충분하면 취득 가능", () => {
    expect(canAcquire("pot_cauldron_1", {}, rich).ok).toBe(true);
  });
  it("마테리얼 부족하면 거부", () => {
    const r = canAcquire("pot_cauldron_1", {}, poor);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("MATERIAL_SHORT");
  });
  it("선행 없으면 거부", () => {
    expect(canAcquire("pot_cauldron_2", {}, rich).reasons).toContain("PREREQ");
  });
});
```

> 실제 노드 id/비용은 STEP1 표 확정 후 맞춤. 위 테스트는 가마솥 예시 기준.

---

## 2-4. 검증

```bash
npm run test
npm run lint && npm run typecheck && npm run build
```

## 완료 기준

- prereqMet/canAcquire/canRelease/checkAffordable/sumCost 구현, Vitest green.
- Foundry API 비의존.
- 취득 시점 거부와 상시 초과 표시가 같은 `checkAffordable`를 공유.

## 사람 확인 항목

- [ ] white 아스테르의 비용/총합 포함 여부.
- [ ] 색별 검사 + 총합 검사 병행(기본) vs 총합만.

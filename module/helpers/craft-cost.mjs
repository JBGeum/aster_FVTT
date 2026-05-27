import { CRAFT_TREE } from "./craft-tree.mjs";

const NODE_MAP = Object.fromEntries(CRAFT_TREE.nodes.map((n) => [n.id, n]));

/** 선행 충족 여부 */
export function prereqMet(skillId, acquired) {
  const node = NODE_MAP[skillId];
  if (!node) return false;
  return node.requires.every((req) => acquired[req] === true);
}

/** 이 노드를 requires로 가진 취득된 후속 id 목록 (해제 거부 판단용) */
export function acquiredDependents(skillId, acquired) {
  return CRAFT_TREE.nodes
    .filter((n) => n.requires.includes(skillId) && acquired[n.id] === true)
    .map((n) => n.id);
}

/** 취득 집합의 비용 합산 */
export function sumCost(acquired) {
  const sum = { material: 0, aster: { red: 0, blue: 0, green: 0, yellow: 0 }, anyAster: 0 };
  for (const [id, val] of Object.entries(acquired)) {
    if (!val) continue;
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
 * @param {{ material: number, aster: {red,blue,green,yellow,white} }} resources
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function checkAffordable(acquired, resources) {
  const reasons = [];
  const cost = sumCost(acquired);
  const have = resources.aster ?? { red: 0, blue: 0, green: 0, yellow: 0, white: 0 };

  if (cost.material > (resources.material ?? 0)) reasons.push("MATERIAL_SHORT");

  // 색별 고정비용: 각 색 보유량 초과 불가
  for (const c of ["red", "blue", "green", "yellow"]) {
    if (cost.aster[c] > (have[c] ?? 0)) reasons.push(`ASTER_${c.toUpperCase()}_SHORT`);
  }

  // 총합: 색별 고정 합 + 임의(anyAster) ≤ 5색(+white) 보유 총합
  const haveTotal = ["red", "blue", "green", "yellow", "white"].reduce(
    (s, c) => s + (have[c] ?? 0),
    0,
  );
  const costTotal =
    cost.aster.red + cost.aster.blue + cost.aster.green + cost.aster.yellow + cost.anyAster;
  if (costTotal > haveTotal) reasons.push("ASTER_TOTAL_SHORT");

  return { ok: reasons.length === 0, reasons };
}

/**
 * 취득 시도 판정: 선행 + 비용을 한 번에 검사 (예정 집합으로).
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function canAcquire(skillId, acquired, resources) {
  if (acquired[skillId]) return { ok: false, reasons: ["ALREADY"] };

  const reasons = [];
  if (!prereqMet(skillId, acquired)) reasons.push("PREREQ");

  const next = { ...acquired, [skillId]: true };
  const afford = checkAffordable(next, resources);
  if (!afford.ok) reasons.push(...afford.reasons);

  return { ok: reasons.length === 0, reasons };
}

/**
 * 해제 시도 판정.
 * @returns {{ ok: boolean, reasons: string[], dependents?: string[] }}
 */
export function canRelease(skillId, acquired) {
  if (!acquired[skillId]) return { ok: false, reasons: ["NOT_ACQUIRED"] };
  const deps = acquiredDependents(skillId, acquired);
  if (deps.length) return { ok: false, reasons: ["HAS_DEPENDENTS"], dependents: deps };
  return { ok: true, reasons: [] };
}

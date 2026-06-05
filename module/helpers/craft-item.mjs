/**
 * C1 아이템 제작 — 순수 검증 + 자원 차감/생성.
 *
 * 비용 모델: 아이템의 material[6] 배열이 *제작 비용*.
 *   [0]=마테리얼, [1]=적, [2]=청, [3]=녹, [4]=황, [5]=백 (I1a material 라벨 정합).
 * 액터 자원 경로: system.material(스칼라) + system.aster.{color}.value (SchemaField).
 */

import { CRAFT_TREE } from "./craft-tree.mjs";

/** material[1..5]에 대응하는 색 키. */
const COST_COLORS = ["red", "blue", "green", "yellow", "white"];

/**
 * craft 노드 id를 base + level로 분해 (예: "pot_cauldron_1" → {base:"pot_cauldron", level:1}).
 * CRAFT_TREE 명명 규약(`{base}_{level}`) 의존.
 * @param {string} nodeId
 * @returns {{base: string, level: number} | null}
 */
function parseNodeId(nodeId) {
  const m = /^(.+)_(\d+)$/.exec(nodeId);
  return m ? { base: m[1], level: parseInt(m[2], 10) } : null;
}

/**
 * 같은 base의 취득된 노드 중 최대 레벨 (없으면 0).
 * @param {string} baseSkillId
 * @param {Object<string, boolean>} acquired
 * @returns {number}
 */
function findMaxAcquiredLevel(baseSkillId, acquired) {
  let maxLevel = 0;
  for (const [nodeId, isAcquired] of Object.entries(acquired)) {
    if (!isAcquired) continue;
    const parsed = parseNodeId(nodeId);
    if (parsed?.base === baseSkillId && parsed.level > maxLevel) maxLevel = parsed.level;
  }
  return maxLevel;
}

/**
 * craft 전제 충족 여부 — craftRequires의 각 설비 base를 *해당 레벨 이상* 취득했는지.
 * @param {Object<string, number>} craftRequires  { [base id]: 최소 레벨 }
 * @param {Object<string, boolean>} acquired  actor.system.craft.acquired
 * @returns {{ok: boolean, missing: Array<{base: string, requiredLevel: number, have: number}>}}
 */
export function checkCraftRequires(craftRequires, acquired) {
  const missing = [];
  for (const [base, level] of Object.entries(craftRequires ?? {})) {
    const requiredLevel = Number(level) || 0;
    const have = findMaxAcquiredLevel(base, acquired);
    if (have < requiredLevel) missing.push({ base, requiredLevel, have });
  }
  return { ok: missing.length === 0, missing };
}

/**
 * craftRequires UI 드롭다운용 설비 base 목록 (C3).
 * 같은 base의 여러 레벨 노드는 하나로 합침(pot_cauldron_1·_2·_3 → "pot_cauldron").
 * 레벨이 없는 노드(사역마 fam_*)는 parseNodeId가 null이라 자동 제외 — 아이템 제작 전제 아님.
 * label은 노드의 i18n 키(예: "ASTER.craft.carve") 그대로 — craft 탭 라벨 재사용.
 * @returns {Array<{base: string, category: string, label: string}>}
 */
export function getCraftRequiresBaseList() {
  const seen = new Map();
  for (const node of CRAFT_TREE.nodes) {
    const parsed = parseNodeId(node.id);
    if (!parsed || seen.has(parsed.base)) continue;
    seen.set(parsed.base, { category: node.category, label: node.label });
  }
  return Array.from(seen.entries()).map(([base, info]) => ({ base, ...info }));
}

/** material 배열 → 비용 객체. */
function costFromMaterial(material) {
  const m = material ?? [];
  return {
    material: m[0] ?? 0,
    aster: {
      red: m[1] ?? 0,
      blue: m[2] ?? 0,
      green: m[3] ?? 0,
      yellow: m[4] ?? 0,
      white: m[5] ?? 0,
    },
  };
}

/** actor 보유 자원 추출. */
function resourcesOf(actor) {
  const aster = actor.system.aster ?? {};
  return {
    material: actor.system.material ?? 0,
    aster: Object.fromEntries(COST_COLORS.map((c) => [c, aster[c]?.value ?? 0])),
  };
}

/**
 * 제작 검증 — craft 전제 + 자원 부족 사유 수집 (차단하지 않고 사유만 반환; D14 음수 허용 정책).
 * @param {{type: string, system: object}} draft
 * @param {Actor} actor
 * @returns {{ok: boolean, reasons: string[], missing: Array}}
 */
export function validateCraft(draft, actor) {
  const reasons = [];
  const acquired = actor.system.craft?.acquired ?? {};
  const reqCheck = checkCraftRequires(draft.system?.craftRequires ?? {}, acquired);
  if (!reqCheck.ok) reasons.push("CRAFT_REQUIRES_NOT_MET");

  const cost = costFromMaterial(draft.system?.material);
  const res = resourcesOf(actor);
  if (cost.material > res.material) reasons.push("MATERIAL_SHORT");
  for (const c of COST_COLORS) {
    if (cost.aster[c] > res.aster[c]) reasons.push(`ASTER_${c.toUpperCase()}_SHORT`);
  }
  return { ok: reasons.length === 0, reasons, missing: reqCheck.missing };
}

/**
 * 제작 실행 — 자원 차감(D14 정합: 음수 허용) + 신규 아이템 생성(창고 위치).
 * @param {Actor} actor
 * @param {{name: string, type: string, system: object}} draftData
 * @returns {Promise<Item|null>}
 */
export async function craftItem(actor, draftData) {
  const cost = costFromMaterial(draftData.system?.material);
  const aster = actor.system.aster ?? {};
  const updates = { "system.material": (actor.system.material ?? 0) - cost.material };
  for (const c of COST_COLORS) {
    updates[`system.aster.${c}.value`] = (aster[c]?.value ?? 0) - cost.aster[c];
  }
  await actor.update(updates);

  const data = foundry.utils.deepClone(draftData);
  data.system = data.system ?? {};
  data.system.container = ""; // 창고
  data.system.grid = { x: 0, y: 0 }; // 미배치
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  return item ?? null;
}

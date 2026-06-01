/**
 * 공방(Craft) 스킬 트리 — 정적 정의.
 *
 * cost.material : 마테리얼 (소비 아님, 합계 비교만)
 * cost.aster    : 색별 아스테르 { red, blue, green, yellow }
 * cost.anyAster : 임의 아스테르 총합 (색 배분 미구현 — 총합으로만 비교)
 * requires      : 선행 스킬 id 배열 (모두 취득돼야 취득 가능)
 *
 * 미확인/미구현:
 *   - 소중한 물건 Lv3-4의 "임의 2종류×2개" 제약 → anyAster:4 총합 처리
 *   - 책장의 "자속성" 아스테르 → anyAster 총합 처리 (종류 미확정)
 */
export const CRAFT_TREE = {
  categories: [
    { id: "potion", label: "ASTER.craft.cat.potion" },
    { id: "divination", label: "ASTER.craft.cat.divination" },
    { id: "cooking", label: "ASTER.craft.cat.cooking" },
    { id: "supply", label: "ASTER.craft.cat.supply" },
    { id: "talisman", label: "ASTER.craft.cat.talisman" },
    { id: "familiar", label: "ASTER.craft.cat.familiar" },
    { id: "furniture", label: "ASTER.craft.cat.furniture" },
  ],

  nodes: [
    // ===== 약 제조 =====
    n(
      "pot_cauldron_1",
      "potion",
      "ASTER.craft.cauldron",
      1,
      { material: 20, aster: { red: 2, yellow: 1 } },
      [],
    ),
    n(
      "pot_cauldron_2",
      "potion",
      "ASTER.craft.cauldron",
      2,
      { material: 40, aster: { red: 3, yellow: 2 } },
      ["pot_cauldron_1"],
    ),
    n(
      "pot_cauldron_3",
      "potion",
      "ASTER.craft.cauldron",
      3,
      { material: 60, aster: { red: 4, blue: 3, yellow: 2 } },
      ["pot_cauldron_2"],
    ),

    n(
      "pot_mortar_1",
      "potion",
      "ASTER.craft.mortar",
      1,
      { material: 20, aster: { blue: 2, green: 3, yellow: 1 } },
      [],
    ),
    n(
      "pot_mortar_2",
      "potion",
      "ASTER.craft.mortar",
      2,
      { material: 50, aster: { blue: 3, green: 4, yellow: 2 } },
      ["pot_mortar_1"],
    ),

    n(
      "pot_mill_1",
      "potion",
      "ASTER.craft.mill",
      1,
      { material: 20, aster: { red: 1, blue: 3, green: 1, yellow: 3 } },
      [],
    ),
    n(
      "pot_mill_2",
      "potion",
      "ASTER.craft.mill",
      2,
      { material: 50, aster: { red: 2, blue: 3, green: 2, yellow: 3 } },
      ["pot_mill_1"],
    ),

    // ===== 부적 만들기 =====
    n(
      "tal_carve_1",
      "talisman",
      "ASTER.craft.carve",
      1,
      { material: 30, aster: { red: 3, green: 1, yellow: 2 } },
      [],
    ),
    n(
      "tal_carve_2",
      "talisman",
      "ASTER.craft.carve",
      2,
      { material: 50, aster: { red: 3, blue: 1, green: 2, yellow: 3 } },
      ["tal_carve_1"],
    ),
    n(
      "tal_carve_3",
      "talisman",
      "ASTER.craft.carve",
      3,
      { material: 70, aster: { red: 4, blue: 1, green: 2, yellow: 3 } },
      ["tal_carve_2"],
    ),

    n(
      "tal_sew_1",
      "talisman",
      "ASTER.craft.sew",
      1,
      { material: 30, aster: { red: 1, blue: 3, green: 2 } },
      [],
    ),
    n(
      "tal_sew_2",
      "talisman",
      "ASTER.craft.sew",
      2,
      { material: 50, aster: { red: 2, blue: 3, green: 3, yellow: 1 } },
      ["tal_sew_1"],
    ),
    n(
      "tal_sew_3",
      "talisman",
      "ASTER.craft.sew",
      3,
      { material: 70, aster: { red: 2, blue: 4, green: 3, yellow: 1 } },
      ["tal_sew_2"],
    ),

    // ===== 요리 =====
    n(
      "cook_hearth_1",
      "cooking",
      "ASTER.craft.hearth",
      1,
      { material: 30, aster: { red: 2, green: 2, yellow: 1 } },
      [],
    ),
    n(
      "cook_hearth_2",
      "cooking",
      "ASTER.craft.hearth",
      2,
      { material: 60, aster: { red: 3, blue: 1, green: 3, yellow: 2 } },
      ["cook_hearth_1"],
    ),

    n(
      "cook_garden_1",
      "cooking",
      "ASTER.craft.garden",
      1,
      { material: 30, aster: { blue: 1, green: 3, yellow: 3 } },
      [],
    ),
    n(
      "cook_garden_2",
      "cooking",
      "ASTER.craft.garden",
      2,
      { material: 60, aster: { red: 2, blue: 3, green: 3, yellow: 4 } },
      ["cook_garden_1"],
    ),

    n(
      "cook_tool_1",
      "cooking",
      "ASTER.craft.cooktool",
      1,
      { material: 30, aster: { blue: 2, green: 1, yellow: 2 } },
      [],
    ),
    n(
      "cook_tool_2",
      "cooking",
      "ASTER.craft.cooktool",
      2,
      { material: 60, aster: { red: 2, blue: 3, green: 2, yellow: 3 } },
      ["cook_tool_1"],
    ),

    // ===== 서플리 (약품고, 합성로) =====
    n(
      "sup_cabinet_1",
      "supply",
      "ASTER.craft.cabinet",
      1,
      { material: 50, aster: { blue: 3, green: 2, yellow: 1 } },
      [],
    ),
    n(
      "sup_cabinet_2",
      "supply",
      "ASTER.craft.cabinet",
      2,
      { material: 70, aster: { red: 1, blue: 3, green: 4, yellow: 2 } },
      ["sup_cabinet_1"],
    ),
    n(
      "sup_cabinet_3",
      "supply",
      "ASTER.craft.cabinet",
      3,
      { material: 80, aster: { red: 1, blue: 4, green: 2, yellow: 3 } },
      ["sup_cabinet_2"],
    ),

    n(
      "sup_furnace_1",
      "supply",
      "ASTER.craft.furnace",
      1,
      { material: 60, aster: { red: 3, blue: 1, yellow: 2 } },
      [],
    ),
    n(
      "sup_furnace_2",
      "supply",
      "ASTER.craft.furnace",
      2,
      { material: 70, aster: { red: 4, blue: 1, green: 2, yellow: 3 } },
      ["sup_furnace_1"],
    ),
    n(
      "sup_furnace_3",
      "supply",
      "ASTER.craft.furnace",
      3,
      { material: 90, aster: { red: 5, blue: 2, green: 4, yellow: 3 } },
      ["sup_furnace_2"],
    ),

    // ===== 점술 =====
    // 수정구 Lv1이 타로·점성술 천반의 선행
    n(
      "div_crystal_1",
      "divination",
      "ASTER.craft.crystal",
      1,
      { material: 40, aster: { red: 1, blue: 2, green: 2, yellow: 1 } },
      [],
    ),
    n(
      "div_crystal_2",
      "divination",
      "ASTER.craft.crystal",
      2,
      { material: 70, aster: { red: 2, blue: 3, green: 3, yellow: 2 } },
      ["div_crystal_1"],
    ),
    n(
      "div_crystal_3",
      "divination",
      "ASTER.craft.crystal",
      3,
      { material: 100, aster: { red: 4, blue: 5, green: 5, yellow: 4 } },
      ["div_crystal_2"],
    ),

    n(
      "div_tarot_1",
      "divination",
      "ASTER.craft.tarot",
      1,
      { material: 40, aster: { red: 2, blue: 1, green: 1, yellow: 2 } },
      ["div_crystal_1"],
    ),
    n(
      "div_tarot_2",
      "divination",
      "ASTER.craft.tarot",
      2,
      { material: 70, aster: { red: 3, blue: 2, green: 2, yellow: 3 } },
      ["div_tarot_1"],
    ),
    n(
      "div_tarot_3",
      "divination",
      "ASTER.craft.tarot",
      3,
      { material: 100, aster: { red: 5, blue: 4, green: 4, yellow: 5 } },
      ["div_tarot_2"],
    ),

    n(
      "div_astro_1",
      "divination",
      "ASTER.craft.astro",
      1,
      { material: 40, aster: { red: 2, blue: 2 } },
      ["div_crystal_1"],
    ),
    n(
      "div_astro_2",
      "divination",
      "ASTER.craft.astro",
      2,
      { material: 70, aster: { red: 3, blue: 3, green: 2 } },
      ["div_astro_1"],
    ),

    // ===== 사역마 (각 단일, requires 없음, 임의 아스테르 4) =====
    n("fam_crow", "familiar", "ASTER.craft.crow", 1, { material: 80, anyAster: 4 }, []),
    n("fam_owl", "familiar", "ASTER.craft.owl", 1, { material: 80, anyAster: 4 }, []),
    n("fam_snake", "familiar", "ASTER.craft.snake", 1, { material: 80, anyAster: 4 }, []),
    n("fam_mouse", "familiar", "ASTER.craft.mouse", 1, { material: 80, anyAster: 4 }, []),
    n("fam_frog", "familiar", "ASTER.craft.frog", 1, { material: 80, anyAster: 4 }, []),
    n("fam_cat", "familiar", "ASTER.craft.blackcat", 1, { material: 80, anyAster: 4 }, []),

    // ===== 가구, 기타 =====
    n("fur_treasure_1", "furniture", "ASTER.craft.treasure", 1, { material: 20, anyAster: 2 }, []),
    n("fur_treasure_2", "furniture", "ASTER.craft.treasure", 2, { material: 30, anyAster: 2 }, [
      "fur_treasure_1",
    ]),
    // Lv3-4: "임의 2종류×2개" → 기본 구현은 anyAster:4 총합 처리
    n("fur_treasure_3", "furniture", "ASTER.craft.treasure", 3, { material: 40, anyAster: 4 }, [
      "fur_treasure_2",
    ]),
    n("fur_treasure_4", "furniture", "ASTER.craft.treasure", 4, { material: 50, anyAster: 4 }, [
      "fur_treasure_3",
    ]),
    n(
      "fur_treasure_5",
      "furniture",
      "ASTER.craft.treasure",
      5,
      { material: 60, aster: { red: 2, blue: 2, green: 2, yellow: 2 } },
      ["fur_treasure_4"],
    ),

    n(
      "fur_swing_1",
      "furniture",
      "ASTER.craft.swing",
      1,
      { material: 20, aster: { red: 1, blue: 1, green: 1, yellow: 1 } },
      [],
    ),
    n(
      "fur_swing_2",
      "furniture",
      "ASTER.craft.swing",
      2,
      { material: 40, aster: { red: 2, blue: 2, green: 2, yellow: 2 } },
      ["fur_swing_1"],
    ),
    n(
      "fur_swing_3",
      "furniture",
      "ASTER.craft.swing",
      3,
      { material: 70, aster: { red: 3, blue: 3, green: 3, yellow: 3 } },
      ["fur_swing_2"],
    ),

    n(
      "fur_desk_1",
      "furniture",
      "ASTER.craft.desk",
      1,
      { material: 20, aster: { red: 1, blue: 1, green: 1, yellow: 1 } },
      [],
    ),
    n(
      "fur_desk_2",
      "furniture",
      "ASTER.craft.desk",
      2,
      { material: 40, aster: { red: 2, blue: 2, green: 2, yellow: 2 } },
      ["fur_desk_1"],
    ),
    n(
      "fur_desk_3",
      "furniture",
      "ASTER.craft.desk",
      3,
      { material: 70, aster: { red: 3, blue: 3, green: 3, yellow: 3 } },
      ["fur_desk_2"],
    ),

    n(
      "fur_lute_1",
      "furniture",
      "ASTER.craft.lute",
      1,
      { material: 20, aster: { red: 1, blue: 1, green: 1, yellow: 1 } },
      [],
    ),
    n(
      "fur_lute_2",
      "furniture",
      "ASTER.craft.lute",
      2,
      { material: 40, aster: { red: 2, blue: 2, green: 2, yellow: 2 } },
      ["fur_lute_1"],
    ),
    n(
      "fur_lute_3",
      "furniture",
      "ASTER.craft.lute",
      3,
      { material: 70, aster: { red: 3, blue: 3, green: 3, yellow: 3 } },
      ["fur_lute_2"],
    ),

    n(
      "fur_mirror_1",
      "furniture",
      "ASTER.craft.mirror",
      1,
      { material: 20, aster: { red: 1, blue: 1, green: 1, yellow: 1 } },
      [],
    ),
    n(
      "fur_mirror_2",
      "furniture",
      "ASTER.craft.mirror",
      2,
      { material: 40, aster: { red: 2, blue: 2, green: 2, yellow: 2 } },
      ["fur_mirror_1"],
    ),
    n(
      "fur_mirror_3",
      "furniture",
      "ASTER.craft.mirror",
      3,
      { material: 70, aster: { red: 3, blue: 3, green: 3, yellow: 3 } },
      ["fur_mirror_2"],
    ),

    // 책장: "자속성" 아스테르 — 종류 미확정, anyAster 총합 처리
    n("fur_shelf_1", "furniture", "ASTER.craft.shelf", 1, { material: 30, anyAster: 2 }, []),
    n("fur_shelf_2", "furniture", "ASTER.craft.shelf", 2, { material: 60, anyAster: 3 }, [
      "fur_shelf_1",
    ]),
    n("fur_shelf_3", "furniture", "ASTER.craft.shelf", 3, { material: 90, anyAster: 4 }, [
      "fur_shelf_2",
    ]),

    // 저장고: 아스테르 비용 없음
    n("fur_storage_1", "furniture", "ASTER.craft.storage", 1, { material: 10 }, []),
    n("fur_storage_2", "furniture", "ASTER.craft.storage", 2, { material: 10 }, ["fur_storage_1"]),
    n("fur_storage_3", "furniture", "ASTER.craft.storage", 3, { material: 10 }, ["fur_storage_2"]),
    n("fur_storage_4", "furniture", "ASTER.craft.storage", 4, { material: 10 }, ["fur_storage_3"]),
    n("fur_storage_5", "furniture", "ASTER.craft.storage", 5, { material: 10 }, ["fur_storage_4"]),
  ],
};

/** 노드 객체 생성 헬퍼 */
function n(id, category, label, level, cost, requires) {
  return { id, category, label, level, cost: normalizeCost(cost), requires };
}

/** cost를 완전한 형태로 정규화 (없는 필드는 0으로 채움) */
function normalizeCost(c = {}) {
  return {
    material: c.material ?? 0,
    aster: { red: 0, blue: 0, green: 0, yellow: 0, ...(c.aster ?? {}) },
    anyAster: c.anyAster ?? 0,
  };
}

# STEP 1 — 정적 트리 정의 + 취득 스키마

> 목표: 스킬트리를 고정 데이터로 정의하고, 액터에 취득 상태를 저장할 필드를 만든다.
> 산출: 커밋 1개. `feat(craft): add static skill tree definition and acquisition schema`
> **이 STEP은 Sch의 데이터 입력이 필요하다**(선행 연결, 가려진 카테고리, 불명확 비용).

---

## 1-1. 트리 정의 데이터 (module/helpers/craft-tree.mjs 신설)

트리는 코드에 고정한다. 각 노드는 id, 카테고리, 표시명, 레벨, 비용, 선행(requires)을 가진다.

```js
/**
 * 공방 스킬 트리 정의 (고정).
 * cost.material: 숫자 (마테리얼 총량)  — 이미지의 ◆
 * cost.aster: { red, blue, green, yellow }  — 이미지의 ◇ 적/청/녹/황
 * cost.anyAster: 숫자 (임의 색 N개; 총합 검사에만 반영) — 이미지의 ◇임의 N
 * requires: [선행 노드 id...]  (모두 취득돼야 이 노드 취득 가능)
 */
export const CRAFT_TREE = {
  categories: [
    { id: "potion", label: "ASTER.craft.cat.potion" }, // 약 제조
    { id: "talisman", label: "ASTER.craft.cat.talisman" }, // 부적 만들기
    { id: "cooking", label: "ASTER.craft.cat.cooking" }, // 요리
    { id: "familiar", label: "ASTER.craft.cat.familiar" }, // 사역마
    { id: "furniture", label: "ASTER.craft.cat.furniture" }, // 가구, 기타
  ],
  nodes: [
    // ===== 약 제조 =====
    // id           cat        label(i18n key)      lvl  cost                                   requires
    n(
      "pot_cauldron_1",
      "potion",
      "ASTER.craft.cauldron",
      1,
      { material: 20, aster: { red: 2, blue: 0, green: 0, yellow: 1 } },
      [],
    ),
    n(
      "pot_cauldron_2",
      "potion",
      "ASTER.craft.cauldron",
      2,
      { material: 40, aster: { red: 3, blue: 0, green: 0, yellow: 2 } },
      ["pot_cauldron_1"],
    ),
    n(
      "pot_cauldron_3",
      "potion",
      "ASTER.craft.cauldron",
      3,
      { material: 60, aster: { red: 4, blue: 3, green: 0, yellow: 2 } },
      ["pot_cauldron_2"],
    ),
    // 약연 / 물레방아 ... (아래 표대로 채움)

    // ===== 사역마 (각 단일, 임의 4) =====
    n("fam_crow", "familiar", "ASTER.craft.crow", 1, { material: 80, anyAster: 4 }, []),
    n("fam_owl", "familiar", "ASTER.craft.owl", 1, { material: 80, anyAster: 4 }, []),
    // ...

    // ===== 가구 (소중한 물건: 1>2>3>4>5 선형) =====
    n("fur_treasure_1", "furniture", "ASTER.craft.treasure", 1, { material: 20, anyAster: 2 }, []),
    n("fur_treasure_2", "furniture", "ASTER.craft.treasure", 2, { material: 30, anyAster: 2 }, [
      "fur_treasure_1",
    ]),
    n("fur_treasure_3", "furniture", "ASTER.craft.treasure", 3, { material: 40, anyAster: 4 }, [
      "fur_treasure_2",
    ]),
    // ... Lv5까지
  ],
};

// 노드 생성 헬퍼 (가독성)
function n(id, category, label, level, cost, requires) {
  return { id, category, label, level, cost: normalizeCost(cost), requires };
}
function normalizeCost(c = {}) {
  return {
    material: c.material ?? 0,
    aster: { red: 0, blue: 0, green: 0, yellow: 0, ...(c.aster ?? {}) },
    anyAster: c.anyAster ?? 0,
  };
}
```

---

## 1-2. ⚠️ Sch가 채울 트리 정의 표

아래 표를 게임 규칙대로 완성한다. **이미지에서 읽은 값은 초안이며, 가려지거나 불명확한 칸은 ❓로 표시**했다.
특히 **requires(선행)** 는 이미지 색 막대만으로 단정 어려우니 규칙대로 확정한다.

### 약 제조

| id             | 표시명   | Lv  | ◆마테리얼 | ◇적/청/녹/황 | 임의 | requires    |
| -------------- | -------- | --- | --------- | ------------ | ---- | ----------- |
| pot_cauldron_1 | 가마솥   | 1   | 20        | 2/0/0/1      | -    | (없음)      |
| pot_cauldron_2 | 가마솥   | 2   | 40        | 3/0/0/2      | -    | cauldron_1  |
| pot_cauldron_3 | 가마솥   | 3   | 60        | 4/3/0/2      | -    | cauldron_2  |
| pot_mortar_1   | 약연     | 1   | 20        | 0/2/3/1      | -    | ❓          |
| pot_mortar_2   | 약연     | 2   | 50        | 0/3/4/2      | -    | mortar_1 ❓ |
| pot_mill_1     | 물레방아 | 1   | 20        | 1/3/1/3      | -    | ❓          |
| pot_mill_2     | 물레방아 | 2   | 50        | 2/3/2/3      | -    | mill_1 ❓   |

### 부적 만들기

| id          | 표시명   | Lv  | ◆   | 적/청/녹/황 | 임의 | requires   |
| ----------- | -------- | --- | --- | ----------- | ---- | ---------- |
| tal_carve_1 | 조각대   | 1   | 30  | 3/0/1/2     | -    | (없음) ❓  |
| tal_carve_2 | 조각대   | 2   | 50  | 3/1/2/3     | -    | carve_1 ❓ |
| tal_carve_3 | 조각대   | 3   | 70  | 4/1/2/3     | -    | carve_2 ❓ |
| tal_sew_1   | 반짇고리 | 1   | 30  | 1/3/2/0     | -    | (없음) ❓  |
| tal_sew_2   | 반짇고리 | 2   | 50  | 2/3/3/1     | -    | sew_1 ❓   |
| tal_sew_3   | 반짇고리 | 3   | 70  | 2/4/3/1     | -    | sew_2 ❓   |

### 요리 (이미지 하단 잘림 — 전부 ❓)

| id  | 표시명 | Lv  | ◆   | 적/청/녹/황 | 임의 | requires |
| --- | ------ | --- | --- | ----------- | ---- | -------- |
| ❓  | ❓     | ❓  | ❓  | ❓          | ❓   | ❓       |

### 사역마 (각 단일 노드, requires 없음, ◇임의 4)

| id        | 표시명      | ◆   | 임의 | requires |
| --------- | ----------- | --- | ---- | -------- |
| fam_crow  | 까마귀      | 80  | 4    | (없음)   |
| fam_owl   | 부엉이      | 80  | 4    | (없음)   |
| fam_snake | 뱀          | 80  | 4    | (없음)   |
| fam_mouse | 생쥐        | 80  | 4    | (없음)   |
| fam_frog  | 개구리      | 80  | 4    | (없음)   |
| fam_cat   | 검은 고양이 | 80  | 4    | (없음)   |

> 확인: 사역마는 서로 배타적인가(하나만 취득)? 그렇다면 별도 "택1" 규칙 필요 — STEP4 메모. 기본은 독립 취득 가정.

### 가구, 기타

| id             | 표시명      | Lv  | ◆   | 적/청/녹/황 | 임의   | requires   |
| -------------- | ----------- | --- | --- | ----------- | ------ | ---------- |
| fur_treasure_1 | 소중한 물건 | 1   | 20  | -           | 2      | (없음)     |
| fur_treasure_2 | 소중한 물건 | 2   | 30  | -           | 2      | treasure_1 |
| fur_treasure_3 | 소중한 물건 | 3   | 40  | -           | 2×2 ❓ | treasure_2 |
| fur_treasure_4 | 소중한 물건 | 4   | 50  | -           | 2×2 ❓ | treasure_3 |
| fur_treasure_5 | 소중한 물건 | 5   | 60  | 2/2/2/2     | -      | treasure_4 |
| fur_swing_1    | 그네        | 1   | 20  | 1/1/1/1     | -      | (없음) ❓  |
| fur_swing_2    | 그네        | 2   | 40  | 2/2/2/2     | -      | swing_1 ❓ |
| fur_swing_3    | 그네        | 3   | 70  | 3/3/3/3     | -      | swing_2 ❓ |
| fur_desk_1     | 책상        | 1   | 20  | 1/1/1/1     | -      | (없음) ❓  |
| fur_desk_2     | 책상        | 2   | 40  | 2/2/2/2     | -      | desk_1 ❓  |
| fur_desk_3     | 책상        | 3   | 70  | 3/3/3/3     | -      | desk_2 ❓  |

> "소중한 물건 Lv.3~4"의 `◇임의 2×2`("2종류를 2개씩")는 **기본 구현에서 총합 4로 환산**(2×2=4)해 anyAster:4로 둔다. 종류 제약은 미구현.

---

## 1-3. 액터 취득 스키마 (template.json)

```jsonc
// Actor.character 에 추가
"craft": {
  "acquired": {}    // { [skillId]: true } 형태. 취득한 스킬만 키로 존재.
}
```

> boolean 맵으로 충분. 트리 구조는 코드(CRAFT_TREE)에 있고, 액터엔 "무엇을 찍었는지"만 저장.

---

## 1-4. 검증

```bash
node -e "require('./module/helpers/craft-tree.mjs')" 2>/dev/null || echo "(ESM은 빌드 후 확인)"
node -e "JSON.parse(require('fs').readFileSync('template.json','utf8')); console.log('valid')"
npm run build
```

## 완료 기준

- `CRAFT_TREE`가 카테고리/노드/비용/선행으로 정의됨(Sch가 표 완성).
- character가 `system.craft.acquired` 보유.
- 모든 노드 id 유일, requires가 존재하는 id만 참조.

## 사람 확인 항목 (Sch 입력 필수)

- [ ] 요리 카테고리 노드 전체(이미지 잘림).
- [ ] 각 카테고리 requires(선행) 확정 — 특히 약연/물레방아/조각대/반짇고리/그네/책상.
- [ ] 사역마 배타 취득 여부(택1인지).
- [ ] 가려지거나 불명확한 비용값(❓ 칸).

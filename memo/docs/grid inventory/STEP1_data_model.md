# STEP 1 — 데이터 모델 (참조 방식)

> 목표: 참조 기반 중첩 인벤토리에 필요한 스키마와 소지 제약을 추가한다.
> 산출: 커밋 1개. `feat(inventory): add container reference schema and bag/storage fields`

---

## 1-1. 아이템 스키마 (template.json)

배치 대상은 `consumable`, `equipment`만. 각각에 `container`(소속)와 `grid`(좌표)를 추가한다.
**food/feature/spell에는 size를 추가하지 않는다**(비배치).

```jsonc
"consumable": {
  "templates": ["base"],
  "size": [1, 1],
  "container": "",              // ← 추가: 소속 가방 id. ""이면 창고
  "grid": { "x": 0, "y": 0 },   // ← 추가: 소속 가방 격자 내 시작점
  "timing": "",
  "mod": 0
},
"equipment": {
  "templates": ["base"],
  "type": "",
  "size": [1, 1],
  "container": "",              // ← 추가
  "grid": { "x": 0, "y": 0 }    // ← 추가
},
```

가방(bag)에 격자 크기를 추가한다. **가방마다 다른 크기 가능.**

```jsonc
"bag": {
  "templates": ["base"],
  "storageImg": "",
  "grid": { "cols": 6, "rows": 4 }   // ← 추가: 이 가방의 격자 크기
}
```

> **확인:** 가방 기본 격자 크기(6×4)는 임의값. 게임 규칙상 기본 가방 크기가 있으면 그 값으로.

---

## 1-2. 액터 스키마 — 창고 용량 (임시 수동값)

창고는 **개수 제한**(면적 아님). 용량값은 임시로 액터 스키마에 수동 입력.

```jsonc
// Actor.character 에 추가
"storage": {
  "limit": 20          // 창고 최대 개수. 임시 수동값.
}
// ⚠️ 추후 craft 스킬트리 구현 시, 이 값은 스킬 기반 파생값으로 대체 예정.
//    지금은 시트에서 직접 입력 가능한 필드로 노출 (STEP3에서 "현재/limit" 표기).
```

> 창고에 속한 아이템 = `container === ""` 인 consumable/equipment. 별도 목록 필드 불필요(필터로 구함).

---

## 1-3. 소지 제약 — "타입별 1개" (bag, food)

bag과 food는 각각 1개만 소지. 같은 규칙, 별도 카운트.
아이템 생성/드롭 시점에 가드한다. Document 레벨 훅 사용.

```js
// module/aster.mjs 또는 별도 모듈에서 등록
const SINGLETON_TYPES = ["bag", "food"]; // 각 1개 제한

Hooks.on("preCreateItem", (item, data, options, userId) => {
  const actor = item.parent;
  if (!actor || actor.documentName !== "Actor") return true;
  if (!SINGLETON_TYPES.includes(item.type)) return true;

  const already = actor.items.some((i) => i.type === item.type);
  if (already) {
    ui.notifications.warn(
      game.i18n.format("ASTER.inventory.warn.SINGLETON", {
        type: game.i18n.localize(`TYPES.Item.${item.type}`),
      }),
    );
    return false; // 생성 취소
  }
  return true;
});
```

> `preCreateItem`이 false를 반환하면 생성이 취소된다. bag/food를 이미 가진 액터에 같은 타입을 추가하려 하면 막힌다.
> **확인:** "이미 있으면 교체"가 아니라 "거부"로 구현. 교체 원하면 STEP5에서 별도 처리(가방 교체는 STEP5에서 다룸).

---

## 1-4. 기존 데이터 마이그레이션

```js
async function migrateInventoryFields() {
  if (!game.user.isGM) return;
  // 가방: grid 크기 없으면 기본값
  for (const item of game.items.filter((i) => i.type === "bag")) {
    if (!item.system.grid?.cols) {
      await item.update({ "system.grid": { cols: 6, rows: 4 } });
    }
  }
  // 액터: storage.limit 없으면 기본값
  for (const actor of game.actors.filter((a) => a.type === "character")) {
    if (actor.system.storage?.limit == null) {
      await actor.update({ "system.storage.limit": 20 });
    }
  }
  // 아이템 container/grid는 template.json 기본값으로 충분.
}
// Hooks.once("ready", migrateInventoryFields) 에서 호출. 버전 플래그로 중복 방지 권장.
```

---

## 1-5. 검증

```bash
node -e "JSON.parse(require('fs').readFileSync('template.json','utf8')); console.log('valid')"
npm run build
# Foundry: bag 아이템 생성 → system.grid={cols,rows} 확인
#          consumable 생성 → system.container, system.grid 확인
#          bag 또 만들기 시도 → 거부 경고 / food 동일 확인
```

## 완료 기준

- consumable/equipment가 `container`, `grid{x,y}` 보유.
- bag이 `grid{cols,rows}` 보유.
- character가 `storage.limit` 보유.
- bag/food 2개째 생성 시 거부.
- food/feature/spell에는 size 미추가.

## 사람 확인 항목

- [ ] 가방 기본 격자 크기.
- [ ] 창고 기본 limit 값.
- [ ] bag/food 중복 시 거부(현재) vs 교체(STEP5).

# STEP 4 — 클릭-선택 배치

> 목표: 빈 칸 클릭 → 배치 가능한 소지 아이템 선택 → 좌표 저장. 꺼내기(창고로). 경고/차단.
> 선행: STEP2(로직), STEP3(렌더).
> 산출: 커밋 1개. `feat(inventory): click-to-place items into bag grid`
> 도구: Claude Code 골격 → Cursor 마감. (드래그 없음 → 난이도 낮음, action 시스템으로 처리)

---

## 4-1. 동작 정의 (확정)

- **배치:** 격자 빈 칸 클릭 → 그 칸을 시작점(좌상단)으로 하여, 배치 가능한 소지 아이템(창고에 있는 consumable/equipment) 목록을 띄움 → 선택 → 해당 아이템의 `container=가방id`, `grid={x,y}` 저장.
- **꺼내기:** 가방 내 아이템 클릭 → 창고로(`container=""`). 단 창고가 한도 미만일 때만(STEP2 `checkStorageAdd`). 한도면 차단(꺼내기 자체는 창고로 보내는 것이므로 창고 추가 규칙 적용).
- **경고:** 배치 시 가방 용량 초과면 `checkBagCapacity`로 경고(막지 않음). 겹침 허용.
- **food:** food 슬롯 클릭 → 소지/획득 food 중 선택(별도, 격자 무관). 1개 제약은 STEP1 훅이 담당.

> 경계 클램프: 시작점 + size가 격자를 넘으면 시작점을 안쪽으로 당김(STEP3의 좌표 검증과 동일).

---

## 4-2. action 등록 (DEFAULT_OPTIONS.actions)

```js
actions: {
  // ...기존...
  cellClick: AsterActorSheet.#onCellClick,     // 빈 칸 클릭 → 배치
  itemUnplace: AsterActorSheet.#onItemUnplace, // 가방 아이템 클릭 → 창고로
  foodSelect: AsterActorSheet.#onFoodSelect,   // food 슬롯 → 선택
},
```

템플릿에 `data-action` 부여:

```hbs
<div class="inv-cell" data-action="cellClick" data-cell-index="{{n}}"></div>
<div class="inv-item" data-action="itemUnplace" data-item-id="{{it.id}}">...</div>
<div class="food-slot" data-action="foodSelect">...</div>
```

> 주의: 칸 위에 아이템이 겹쳐 있으면 클릭이 아이템으로 갈 수 있음. 빈 칸 클릭만 배치, 아이템 클릭은 꺼내기로 분기되므로 자연스럽게 동작. (겹침 허용이라 "빈 칸"이 아이템 아래 가려질 수 있으나, 클릭 대상이 cell이면 배치/ item이면 꺼내기로 구분.)

---

## 4-3. 칸 인덱스 → 좌표

```js
#cellToXY(cellIndex, grid) {
  const x = cellIndex % grid.cols;
  const y = Math.floor(cellIndex / grid.cols);
  return { x, y };
}
#clampStart(x, y, size, grid) {
  const fx = Math.max(0, Math.min(x, grid.cols - size[0]));
  const fy = Math.max(0, Math.min(y, grid.rows - size[1]));
  return { x: fx, y: fy };
}
```

---

## 4-4. 배치 핸들러 (빈 칸 클릭)

```js
import { checkBagCapacity } from "../helpers/inventory-capacity.mjs";

static async #onCellClick(event, target) {
  const bag = this.actor.items.find((i) => i.type === "bag");
  if (!bag) return;
  const grid = bag.system.grid;
  const cellIndex = Number(target.dataset.cellIndex);
  const { x, y } = this.#cellToXY(cellIndex, grid);

  // 배치 후보 = 창고(container 빈) 소지 아이템
  const candidates = this.actor.items.filter(
    (i) => ["consumable", "equipment"].includes(i.type) && !i.system.container,
  );
  if (!candidates.length) {
    ui.notifications.info(game.i18n.localize("ASTER.inventory.noCandidate"));
    return;
  }

  // 선택 UI: 간단한 Dialog 드롭다운 (V13 foundry.applications.api.DialogV2 권장)
  const choiceId = await this.#promptItemChoice(candidates);
  if (!choiceId) return;
  const item = this.actor.items.get(choiceId);

  // 경계 클램프
  const start = this.#clampStart(x, y, item.system.size ?? [1, 1], grid);

  // 가방 용량 경고 (막지 않음)
  const itemsInBag = this.actor.items
    .filter((i) => i.system.container === bag.id && ["consumable","equipment"].includes(i.type))
    .map((i) => ({ size: i.system.size }));
  const cap = checkBagCapacity({ newItemSize: item.system.size ?? [1,1], itemsInBag, grid });
  if (!cap.ok) {
    const msg = cap.reasons.map((r) => game.i18n.localize(`ASTER.inventory.warn.${r}`)).join(" ");
    ui.notifications.warn(msg);
  }

  await item.update({ "system.container": bag.id, "system.grid": start });
}

// 간단한 선택 다이얼로그 (V13 DialogV2)
async #promptItemChoice(candidates) {
  const options = candidates
    .map((i) => `<option value="${i.id}">${i.name} (${i.system.size?.[0]}×${i.system.size?.[1]})</option>`)
    .join("");
  const content = `<select name="choice" style="width:100%">${options}</select>`;
  return foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("ASTER.inventory.choose") },
    content,
    ok: {
      label: game.i18n.localize("ASTER.inventory.place"),
      callback: (event, button) => button.form.elements.choice.value,
    },
  }).catch(() => null);
}
```

> **확인:** 선택 UI는 DialogV2 드롭다운으로 가정. 더 시각적인 팝업(이미지 썸네일 그리드)을 원하면 Cursor에서 커스텀. 기능상은 드롭다운으로 충분.

---

## 4-5. 꺼내기 핸들러 (가방 아이템 클릭 → 창고)

```js
import { checkStorageAdd } from "../helpers/inventory-capacity.mjs";

static async #onItemUnplace(event, target) {
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;

  // 창고 개수 제한 검사 (창고로 보내는 것 = 창고 추가)
  const currentCount = this.actor.items.filter(
    (i) => ["consumable","equipment"].includes(i.type) && !i.system.container,
  ).length;
  const limit = this.actor.system.storage?.limit ?? 0;
  const { allowed } = checkStorageAdd({ currentCount, limit });
  if (!allowed) {
    ui.notifications.warn(game.i18n.localize("ASTER.inventory.warn.STORAGE_FULL"));
    return;   // 창고 꽉 참 → 꺼내기 차단
  }
  await item.update({ "system.container": "", "system.grid": { x: 0, y: 0 } });
}
```

> 규칙 충족: 창고 초과 상태면 추가(=꺼내기) 불가, 창고에서 다른 것 비우기(가방 배치/삭제)만 가능 → 한도 이하 되면 다시 꺼내기 가능.

---

## 4-6. food 선택 핸들러

```js
static async #onFoodSelect(event, target) {
  // food는 격자 무관. 소지 food가 이미 있으면 교체/해제, 없으면 추가 안내.
  // 1개 제약은 preCreateItem 훅이 담당하므로, 여기선 표시/해제 정도.
  // 구체 동작(어디서 food 후보를 가져오는지)은 게임 규칙에 따라 STEP5에서 확장.
}
```

> **확인:** food 후보를 어디서 가져오는지(컴펜디움? 창고처럼 미소지 목록?)가 불명. STEP4에서는 슬롯 표시/해제만, 선택 소스는 STEP5 또는 추후.

---

## 4-7. 언어 키 (추가)

```json
{
  "ASTER.inventory.warn.AREA_EXCEEDED": "가방 용량을 초과했습니다.",
  "ASTER.inventory.warn.WIDTH_EXCEEDED": "아이템 가로가 가방보다 큽니다.",
  "ASTER.inventory.warn.HEIGHT_EXCEEDED": "아이템 세로가 가방보다 큽니다.",
  "ASTER.inventory.warn.STORAGE_FULL": "창고가 가득 차 꺼낼 수 없습니다.",
  "ASTER.inventory.warn.SINGLETON": "{type}은(는) 1개만 소지할 수 있습니다.",
  "ASTER.inventory.noCandidate": "배치할 아이템이 창고에 없습니다.",
  "ASTER.inventory.choose": "배치할 아이템 선택",
  "ASTER.inventory.place": "배치"
}
```

## 4-8. 검증

```bash
npm run lint && npm run typecheck && npm run build
# Foundry:
# 1) 빈 칸 클릭 → 선택 다이얼로그 → 아이템이 그 칸 시작으로 배치
# 2) 가방 아이템 클릭 → 창고로 (카운터 +1)
# 3) 창고 한도 꽉 채운 뒤 꺼내기 → 차단 경고
# 4) 큰 아이템 배치 → 경고 뜨되 배치됨
# 5) 겹쳐 배치 → 허용
# 6) 새로고침 → 배치 유지
```

## 완료 기준

- 클릭-선택 배치 + 좌표 영속 저장.
- 꺼내기(창고로) + 창고 개수 차단.
- 가방 경고(막지 않음), 겹침 허용.

## 사람 확인 항목

- [ ] 선택 UI: DialogV2 드롭다운(기본) vs 썸네일 팝업(Cursor 확장).
- [ ] food 후보 소스(컴펜디움/목록) — STEP5 또는 추후.

# STEP 3 — 정적 렌더 (가방 격자 + food 슬롯 + 창고 카운터)

> 목표: 가방 격자에 소속 아이템을 좌표대로 표시. food 단일 슬롯, 창고 카운터 표시. **배치 인터랙션 없음.**
> 선행: STEP1, MIGRATION TASK 3(PARTS).
> 산출: 커밋 1개. `feat(inventory): render bag grid, food slot, storage counter`
> 도구: Claude Code 골격 → Cursor 시각.

---

## 3-1. 컨텍스트 준비

`actor-sheet.mjs`에서 인벤토리 part 컨텍스트를 만든다.

```js
_prepareInventory(context) {
  // 소지한 가방 (1개 제약이지만 방어적으로 first)
  const bag = this.actor.items.find((i) => i.type === "bag");
  // 소지한 food (1개 제약)
  const food = this.actor.items.find((i) => i.type === "food");

  // 가방 안 아이템 = container가 이 가방 id
  const inBag = bag
    ? this.actor.items.filter(
        (i) => ["consumable", "equipment"].includes(i.type) && i.system.container === bag.id,
      )
    : [];

  // 창고 = container 빈 배치형 아이템
  const inStorage = this.actor.items.filter(
    (i) => ["consumable", "equipment"].includes(i.type) && !i.system.container,
  );

  context.inv = {
    bag: bag
      ? {
          id: bag.id,
          name: bag.name,
          grid: bag.system.grid, // {cols, rows}
          items: inBag.map((i) => ({
            id: i.id, name: i.name, img: i.img,
            w: i.system.size[0], h: i.system.size[1],
            x: i.system.grid?.x ?? 0, y: i.system.grid?.y ?? 0,
          })),
        }
      : null,
    food: food ? { id: food.id, name: food.name, img: food.img } : null,
    storage: {
      count: inStorage.length,
      limit: this.actor.system.storage?.limit ?? 0,
      over: inStorage.length > (this.actor.system.storage?.limit ?? 0),
    },
  };
}
```

---

## 3-2. 템플릿 (actor-sub-inventory.html)

```hbs
<section class="tab inventory-tab" data-tab="inventory" data-group="primary">

  {{!-- 가방 격자 --}}
  {{#if inv.bag}}
  <div class="bag-block">
    <h3>{{inv.bag.name}}</h3>
    <div class="inv-grid"
         style="--cols: {{inv.bag.grid.cols}}; --rows: {{inv.bag.grid.rows}};">
      {{#each (range (multiply inv.bag.grid.cols inv.bag.grid.rows)) as |n|}}
        <div class="inv-cell" data-cell-index="{{n}}"></div>
      {{/each}}
      {{#each inv.bag.items as |it|}}
        <div class="inv-item" data-item-id="{{it.id}}"
             style="grid-column: {{add it.x 1}} / span {{it.w}};
                    grid-row: {{add it.y 1}} / span {{it.h}};">
          <img src="{{it.img}}" alt="{{it.name}}" draggable="false" />
        </div>
      {{/each}}
    </div>
  </div>
  {{else}}
    <p class="no-bag">{{localize "ASTER.inventory.noBag"}}</p>
  {{/if}}

  {{!-- food 단일 슬롯 --}}
  <div class="food-slot">
    <label>{{localize "ASTER.inventory.food"}}</label>
    {{#if inv.food}}
      <div class="food-item" data-item-id="{{inv.food.id}}">
        <img src="{{inv.food.img}}" alt="{{inv.food.name}}" />
        <span>{{inv.food.name}}</span>
      </div>
    {{else}}
      <div class="food-empty">{{localize "ASTER.inventory.foodEmpty"}}</div>
    {{/if}}
  </div>

  {{!-- 창고 카운터 (개수/limit, 초과 시 빨강) --}}
  <div class="storage-counter {{#if inv.storage.over}}over{{/if}}">
    {{localize "ASTER.inventory.storage"}}:
    <span class="count">{{inv.storage.count}}</span> /
    <input type="number" name="system.storage.limit" value="{{inv.storage.limit}}" min="0" />
  </div>
</section>
```

> 헬퍼 필요: `add`, `range`, `multiply`. `templates.mjs`의 `registerHandlebarsHelpers`에 추가:
>
> ```js
> Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));
> Handlebars.registerHelper("multiply", (a, b) => Number(a) * Number(b));
> Handlebars.registerHelper("range", (n) => Array.from({ length: Number(n) }, (_, i) => i));
> ```
>
> `name="system.storage.limit"` 입력은 submitOnChange로 자동 저장(창고 용량 수동 입력).

---

## 3-3. 스타일 (SCSS 핵심만)

```scss
.inv-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 2px;
  aspect-ratio: var(--cols) / var(--rows);
}
.inv-cell {
  background: rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
}
.inv-item {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #999;
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}
.storage-counter.over .count {
  color: #c0392b;
  font-weight: bold;
} // 초과 빨강
```

---

## 3-4. 언어 키

```json
{
  "ASTER.inventory.noBag": "소지한 가방이 없습니다.",
  "ASTER.inventory.food": "휴대 식량",
  "ASTER.inventory.foodEmpty": "(없음)",
  "ASTER.inventory.storage": "창고"
}
```

## 3-5. 검증

```bash
npm run build
# Foundry: 가방 있는 character → 격자 표시, 가방 내 아이템이 좌표/size대로 표시
#          food 슬롯 표시, 창고 카운터 표시(limit 초과시 빨강)
```

## 완료 기준

- 가방 격자 + 소속 아이템 좌표 렌더.
- food 단일 슬롯 렌더.
- 창고 `count/limit` 표시, 초과 시 빨강.
- 배치 인터랙션은 아직 없음(STEP4).

## 사람 확인 항목

- [ ] 칸 비율, 가방/food/창고 영역 배치(이미지2 참고, Cursor 조정).

# STEP 2 — 판정 로직 (가방 용량 + 창고 개수) + Vitest

> 목표: UI 무관 순수 함수로 (1) 가방 용량 경고, (2) 창고 개수 제한을 구현하고 테스트한다.
> 선행: STEP1. UI 불필요 — 독립 진행.
> 산출: 커밋 1개. `feat(inventory): add bag capacity and storage count checks with tests`

---

## 2-1. 규칙 (확정)

**가방 용량 (경고만, 막지 않음):** 다음 중 하나라도 참이면 경고.

- 규칙 A(면적): `(가방 내 아이템 면적 합) + (새 아이템 면적) > (cols * rows)`
- 규칙 B(차원): `새 아이템 가로 > cols` 또는 `새 아이템 세로 > rows`
- 겹침 허용이므로 칸별 점유는 보지 않음. 합계와 변 길이만.

**창고 개수 (차단):** 면적이 아니라 **개수**.

- 창고 추가 가능 여부: `(현재 창고 개수) < limit` 이면 추가 가능, 아니면 차단.
- 초과 상태(현재 개수 >= limit, 가방 교체 등으로 발생)에서는 추가 불가, 꺼내기만 가능.
  → "추가 시점에 현재 개수 >= limit 이면 거부"만 검사하면 이 규칙이 자동 성립.

---

## 2-2. 구현 (module/helpers/inventory-capacity.mjs)

```js
/** 아이템 면적. size=[w,h]. */
export function itemArea(size) {
  const [w, h] = size ?? [1, 1];
  return (w || 1) * (h || 1);
}

/** 아이템 배열 면적 합. */
export function usedArea(items) {
  return items.reduce((sum, it) => sum + itemArea(it.size), 0);
}

/**
 * 가방 용량 판정 (경고용). 막지 않음.
 * @param {{ newItemSize:[number,number], itemsInBag:Array<{size}>, grid:{cols,rows} }} p
 * @returns {{ ok:boolean, reasons:string[] }}
 */
export function checkBagCapacity({ newItemSize, itemsInBag, grid }) {
  const reasons = [];
  const [w, h] = newItemSize ?? [1, 1];
  if (usedArea(itemsInBag) + itemArea(newItemSize) > grid.cols * grid.rows) {
    reasons.push("AREA_EXCEEDED");
  }
  if (w > grid.cols) reasons.push("WIDTH_EXCEEDED");
  if (h > grid.rows) reasons.push("HEIGHT_EXCEEDED");
  return { ok: reasons.length === 0, reasons };
}

/**
 * 창고 추가 가능 여부 (차단용). 개수 기준.
 * @param {{ currentCount:number, limit:number }} p
 * @returns {{ allowed:boolean, over:boolean }}
 *   allowed: 새 아이템을 창고에 넣어도 되는가
 *   over: 현재 이미 한도 초과 상태인가 (UI 빨간 표시용)
 */
export function checkStorageAdd({ currentCount, limit }) {
  return {
    allowed: currentCount < limit,
    over: currentCount > limit,
  };
}
```

---

## 2-3. Vitest (test/inventory-capacity.test.mjs)

```js
import { describe, it, expect } from "vitest";
import {
  itemArea,
  usedArea,
  checkBagCapacity,
  checkStorageAdd,
} from "../module/helpers/inventory-capacity.mjs";

describe("itemArea / usedArea", () => {
  it("면적 계산", () => {
    expect(itemArea([2, 3])).toBe(6);
    expect(usedArea([{ size: [2, 3] }, { size: [2, 2] }])).toBe(10);
    expect(usedArea([])).toBe(0);
  });
});

describe("checkBagCapacity", () => {
  const grid = { cols: 6, rows: 4 }; // 24칸
  it("여유 ok", () => {
    expect(checkBagCapacity({ newItemSize: [2, 2], itemsInBag: [], grid }).ok).toBe(true);
  });
  it("면적 초과", () => {
    const r = checkBagCapacity({ newItemSize: [2, 2], itemsInBag: [{ size: [22, 1] }], grid });
    expect(r.reasons).toContain("AREA_EXCEEDED");
  });
  it("가로 초과", () => {
    expect(checkBagCapacity({ newItemSize: [7, 1], itemsInBag: [], grid }).reasons).toContain(
      "WIDTH_EXCEEDED",
    );
  });
  it("세로 초과", () => {
    expect(checkBagCapacity({ newItemSize: [1, 5], itemsInBag: [], grid }).reasons).toContain(
      "HEIGHT_EXCEEDED",
    );
  });
});

describe("checkStorageAdd", () => {
  it("여유 있으면 추가 허용", () => {
    expect(checkStorageAdd({ currentCount: 5, limit: 20 })).toEqual({ allowed: true, over: false });
  });
  it("꽉 차면 추가 불가", () => {
    expect(checkStorageAdd({ currentCount: 20, limit: 20 }).allowed).toBe(false);
  });
  it("초과 상태면 추가 불가 + over=true", () => {
    const r = checkStorageAdd({ currentCount: 25, limit: 20 });
    expect(r.allowed).toBe(false);
    expect(r.over).toBe(true);
  });
});
```

---

## 2-4. 검증

```bash
npm run test
npm run lint && npm run typecheck && npm run build
```

## 완료 기준

- 네 함수 구현, Vitest green.
- Foundry API 비의존(순수 함수).
- 가방=면적/차원(경고), 창고=개수(차단) 규칙이 분리되어 구현됨.

# 아이템 채팅 카드 템플릿화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소지품/NPC 아이템 이름 클릭 시 `<b>이름</b>` 대신 description(리치텍스트) + 타입별 핵심 메타를 담은 `.aster-chat-card.item-card`를 출력한다.

**Architecture:** 순수 함수 `buildItemCardData(item, localize)`가 표시 데이터를 조립(localize 주입으로 game 전역 비의존 → Vitest 테스트 가능), `postItemCard(actor, item)`가 렌더·전송, 얇은 위임자 `#onItemChat`이 호출만. 템플릿은 기존 `templates/chat/*.html` + `.aster-chat-card` 약초첩 스킨 패턴 답습. helper는 `actor-sheet.mjs`를 import하지 않는 단방향 의존 유지.

**Tech Stack:** JavaScript ESM(`.mjs`), Foundry V13 Handlebars(`foundry.applications.handlebars.renderTemplate`), Vitest, SCSS(`--cc-*` 토큰 라이트/다크).

**관련 스펙:** [`../specs/2026-06-16-item-chat-card-design.md`](../specs/2026-06-16-item-chat-card-design.md)

---

## 설계 정제 (스펙 대비 확정 사항)

스펙 §5.1이 "구현 계획에서 grep으로 확정"으로 미룬 항목을 코드 조사로 확정했다:

- **localize 주입**: `buildItemCardData(item)`가 `game.i18n.localize`를 직접 부르면 Vitest에서 `game` 전역이 없어 테스트 불가. → 시그니처를 `buildItemCardData(item, localize)`로 하고, 메타 라벨/값을 빌더가 완성된 문자열로 반환한다. 템플릿은 `{{localize}}` 없이 그대로 렌더. 프로덕션은 `postItemCard`가 `game.i18n.localize`를 주입.
- **재사용 lang 키 확정**: `ASTER.item.effect`("효과"), `ASTER.equipment.requirement`("작성 전제"), `ASTER.consumable.healHealth`/`timingLabel`/`cureResult`/`cureAllResult`, `ASTER.food.restore`, `ASTER.equipment.type.label`("카테고리")·`ASTER.equipment.type.<type>`, `ASTER.equipment.inactiveBadge`("효과 비활성"), `ASTER.itemType.<type>`, `ASTER.badstatus.<i18n>`.
- **신규 키 1개**: `ASTER.itemcard.capacity`("용량") — 가방 격자 용량 라벨만 기존 키 공백.
- **cureStatus 라벨 매핑**: `DAMAGE_STATUSES`(순수 import from `health-status.mjs`)로 `key→i18n` 매핑(`bigInj→biginj`). `[{key:"injury",i18n:"injury"},{key:"bigInj",i18n:"biginj"},{key:"sleepy",...},{key:"exhaustion",...},{key:"hungry",...}]`.
- **마법구 비활성**: `isMagicToolInactive(item)`(순수 import from `sheet-tooltips.mjs`). `EQUIP_SLOT_CONTAINERS=["equip-1","equip-2"]`이므로 `container:""`(또는 슬롯 외)인 magicTool이 비활성.

## 파일 구조

```
module/helpers/item-chat.mjs        # 신규 — buildItemCardData(순수) + postItemCard
test/item-chat.test.mjs             # 신규 — buildItemCardData 단위 테스트
templates/chat/item-card.html       # 신규 — .aster-chat-card.item-card
module/helpers/templates.mjs        # 수정 — preload 목록에 item-card.html 추가
module/sheets/actor-sheet.mjs       # 수정 — #onItemChat을 얇은 위임자로 + import
scss/component/_chat-card.scss       # 수정 — &.item-card 변형 블록 추가
lang/ko.json                        # 수정 — ASTER.itemcard.capacity 추가
```

## 검증 게이트

각 코드 변경 커밋 전: `npm run build && npm run lint && npm run typecheck && npm run test` 전부 통과(exit 0). 템플릿/SCSS/위임자 배선은 단위 테스트 비대상 → build/lint + 마지막 Foundry 수동 확인이 안전망.

---

## Task 1: `buildItemCardData` 순수 함수 + Vitest 테스트 (TDD)

**Files:**
- Create: `module/helpers/item-chat.mjs`
- Create: `test/item-chat.test.mjs`

- [ ] **Step 1: 실패 테스트 작성**

`test/item-chat.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { buildItemCardData } from "../module/helpers/item-chat.mjs";

// identity localizer — 키가 그대로 반환되므로 어떤 lang 키가 쓰였는지 검증 가능.
const L = (k) => k;

function makeItem(type, system = {}, extra = {}) {
  return {
    type,
    name: extra.name ?? "테스트",
    img: extra.img ?? "icons/x.png",
    system,
  };
}

describe("buildItemCardData — 헤더/기본", () => {
  it("이름·이미지·description 패스스루", () => {
    const d = buildItemCardData(
      makeItem("consumable", { description: "<p>설명</p>" }, { name: "회복약", img: "a.png" }),
      L,
    );
    expect(d.itemName).toBe("회복약");
    expect(d.itemImg).toBe("a.png");
    expect(d.description).toBe("<p>설명</p>");
  });
  it("알려진 타입은 typeLabel 설정", () => {
    expect(buildItemCardData(makeItem("consumable"), L).typeLabel).toBe("ASTER.itemType.consumable");
    expect(buildItemCardData(makeItem("bag"), L).typeLabel).toBe("ASTER.itemType.bag");
  });
  it("알 수 없는 타입은 typeLabel 빈 문자열", () => {
    expect(buildItemCardData(makeItem("npcaction"), L).typeLabel).toBe("");
  });
  it("description·메타 모두 없으면 description 빈 문자열·meta 빈 배열", () => {
    const d = buildItemCardData(makeItem("feature", {}), L);
    expect(d.meta).toEqual([]);
    expect(d.description).toBe("");
  });
});

describe("buildItemCardData — 공통 메타", () => {
  it("effect 있으면 효과 라인", () => {
    const d = buildItemCardData(makeItem("equipment", { effect: "공격 +1" }), L);
    expect(d.meta).toContainEqual({ icon: "fa-bolt", label: "ASTER.item.effect", value: "공격 +1" });
  });
  it("effect 공백이면 라인 없음", () => {
    const d = buildItemCardData(makeItem("equipment", { effect: "  " }), L);
    expect(d.meta.find((m) => m.label === "ASTER.item.effect")).toBeUndefined();
  });
  it("requirement 있으면 작성 전제 라인", () => {
    const d = buildItemCardData(makeItem("equipment", { requirement: "박식 3" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-clipboard-list",
      label: "ASTER.equipment.requirement",
      value: "박식 3",
    });
  });
});

describe("buildItemCardData — 소비품", () => {
  it("healHealth>0 → 건강 회복 라인 (+N)", () => {
    const d = buildItemCardData(makeItem("consumable", { healHealth: 8 }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-heart",
      label: "ASTER.consumable.healHealth",
      value: "+8",
    });
  });
  it("healHealth 0이면 라인 없음", () => {
    const d = buildItemCardData(makeItem("consumable", { healHealth: 0 }), L);
    expect(d.meta.find((m) => m.label === "ASTER.consumable.healHealth")).toBeUndefined();
  });
  it("cureStatus 목록 → badstatus 라벨 join (bigInj→biginj)", () => {
    const d = buildItemCardData(makeItem("consumable", { cureStatus: ["injury", "bigInj"] }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-hand-sparkles",
      label: "ASTER.consumable.cureResult",
      value: "ASTER.badstatus.injury, ASTER.badstatus.biginj",
    });
  });
  it("cureAllStatus가 cureStatus보다 우선", () => {
    const d = buildItemCardData(
      makeItem("consumable", { cureAllStatus: true, cureStatus: ["injury"] }),
      L,
    );
    const cureLines = d.meta.filter((m) => m.label === "ASTER.consumable.cureResult");
    expect(cureLines).toHaveLength(1);
    expect(cureLines[0].value).toBe("ASTER.consumable.cureAllResult");
  });
  it("timing 있으면 타이밍 라인", () => {
    const d = buildItemCardData(makeItem("consumable", { timing: "전투 중" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-hourglass-half",
      label: "ASTER.consumable.timingLabel",
      value: "전투 중",
    });
  });
});

describe("buildItemCardData — 음식", () => {
  it("restore>0 → 포만 회복 라인 (+N)", () => {
    const d = buildItemCardData(makeItem("food", { restore: 4 }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-drumstick-bite",
      label: "ASTER.food.restore",
      value: "+4",
    });
  });
  it("bonusEffect → 효과 라인", () => {
    const d = buildItemCardData(makeItem("food", { bonusEffect: "다음 판정 +1" }), L);
    expect(d.meta).toContainEqual({ icon: "fa-star", label: "ASTER.item.effect", value: "다음 판정 +1" });
  });
});

describe("buildItemCardData — 장비", () => {
  it("type 있으면 카테고리 라인 (값도 localize)", () => {
    const d = buildItemCardData(makeItem("equipment", { type: "magicTool" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-tag",
      label: "ASTER.equipment.type.label",
      value: "ASTER.equipment.type.magicTool",
    });
  });
  it("마법구가 장비란 밖(container:'')이면 비활성 경고", () => {
    const d = buildItemCardData(makeItem("equipment", { type: "magicTool", container: "" }), L);
    expect(d.meta).toContainEqual({
      icon: "fa-triangle-exclamation",
      label: "ASTER.equipment.inactiveBadge",
      value: "",
    });
  });
  it("마법구가 장비란(equip-1)에 있으면 경고 없음", () => {
    const d = buildItemCardData(
      makeItem("equipment", { type: "magicTool", container: "equip-1" }),
      L,
    );
    expect(d.meta.find((m) => m.label === "ASTER.equipment.inactiveBadge")).toBeUndefined();
  });
});

describe("buildItemCardData — 가방", () => {
  it("격자 용량 라인", () => {
    const d = buildItemCardData(makeItem("bag", { grid: { cols: 6, rows: 4 } }), L);
    expect(d.meta).toContainEqual({ icon: "fa-box", label: "ASTER.itemcard.capacity", value: "6×4" });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- item-chat`
Expected: FAIL — `buildItemCardData` is not exported / module not found.

- [ ] **Step 3: `module/helpers/item-chat.mjs` 구현**

```js
/**
 * 아이템 채팅 카드 — 표시 데이터 조립(순수) + 렌더·전송.
 */
import { DAMAGE_STATUSES } from "./health-status.mjs";
import { isMagicToolInactive } from "./sheet-tooltips.mjs";

// 타입 라벨(ASTER.itemType.*)이 정의된 인벤토리 타입만 typeLabel 표기.
const ITEM_TYPE_KEYS = new Set(["consumable", "equipment", "food", "bag"]);

/**
 * 아이템을 채팅 카드 표시 데이터로 변환 — 순수 함수.
 * localize를 주입받아 game 전역에 의존하지 않는다(Vitest 테스트 가능).
 *
 * @param {Item} item
 * @param {(key: string) => string} localize  game.i18n.localize 동등 함수
 * @returns {{itemImg:string, itemName:string, typeLabel:string, description:string,
 *            meta: Array<{icon:string, label:string, value:string}>}}
 */
export function buildItemCardData(item, localize) {
  const sys = item.system ?? {};
  const meta = [];

  // 공통 메타
  if (sys.effect?.trim()) {
    meta.push({ icon: "fa-bolt", label: localize("ASTER.item.effect"), value: sys.effect });
  }
  if (sys.requirement?.trim()) {
    meta.push({
      icon: "fa-clipboard-list",
      label: localize("ASTER.equipment.requirement"),
      value: sys.requirement,
    });
  }

  // 타입별 메타
  if (item.type === "consumable") {
    if ((sys.healHealth ?? 0) > 0) {
      meta.push({
        icon: "fa-heart",
        label: localize("ASTER.consumable.healHealth"),
        value: `+${sys.healHealth}`,
      });
    }
    if (sys.cureAllStatus === true) {
      meta.push({
        icon: "fa-hand-sparkles",
        label: localize("ASTER.consumable.cureResult"),
        value: localize("ASTER.consumable.cureAllResult"),
      });
    } else if ((sys.cureStatus?.length ?? 0) > 0) {
      const labels = sys.cureStatus.map((k) => {
        const def = DAMAGE_STATUSES.find((s) => s.key === k);
        return localize(`ASTER.badstatus.${def?.i18n ?? k}`);
      });
      meta.push({
        icon: "fa-hand-sparkles",
        label: localize("ASTER.consumable.cureResult"),
        value: labels.join(", "),
      });
    }
    if (sys.timing?.trim()) {
      meta.push({
        icon: "fa-hourglass-half",
        label: localize("ASTER.consumable.timingLabel"),
        value: sys.timing,
      });
    }
  } else if (item.type === "food") {
    if ((sys.restore ?? 0) > 0) {
      meta.push({
        icon: "fa-drumstick-bite",
        label: localize("ASTER.food.restore"),
        value: `+${sys.restore}`,
      });
    }
    if (sys.bonusEffect?.trim()) {
      meta.push({ icon: "fa-star", label: localize("ASTER.item.effect"), value: sys.bonusEffect });
    }
  } else if (item.type === "equipment") {
    if (sys.type?.trim()) {
      meta.push({
        icon: "fa-tag",
        label: localize("ASTER.equipment.type.label"),
        value: localize(`ASTER.equipment.type.${sys.type}`),
      });
    }
    if (isMagicToolInactive(item)) {
      meta.push({
        icon: "fa-triangle-exclamation",
        label: localize("ASTER.equipment.inactiveBadge"),
        value: "",
      });
    }
  } else if (item.type === "bag") {
    const cols = sys.grid?.cols ?? 0;
    const rows = sys.grid?.rows ?? 0;
    meta.push({ icon: "fa-box", label: localize("ASTER.itemcard.capacity"), value: `${cols}×${rows}` });
  }

  return {
    itemImg: item.img,
    itemName: item.name,
    typeLabel: ITEM_TYPE_KEYS.has(item.type) ? localize(`ASTER.itemType.${item.type}`) : "",
    description: sys.description ?? "",
    meta,
  };
}

/**
 * 아이템 카드를 렌더해 채팅에 전송.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function postItemCard(actor, item) {
  const data = buildItemCardData(item, (key) => game.i18n.localize(key));
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/item-card.html",
    data,
  );
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- item-chat`
Expected: PASS — 모든 케이스 green.

- [ ] **Step 5: 게이트 + 커밋**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

```bash
git add module/helpers/item-chat.mjs test/item-chat.test.mjs
git commit -m "feat(chat): add buildItemCardData and postItemCard for item cards"
```
(Conventional Commits, 영어, co-author 없음. `--no-verify` 금지.)

---

## Task 2: 가방 용량 lang 키 추가

**Files:**
- Modify: `lang/ko.json`

- [ ] **Step 1: `ASTER.itemType` 블록 위치 확인**

Run: `grep -n '"itemType"' lang/ko.json`
Expected: `"itemType": {` 블록(consumable/equipment/bag/food 라벨)을 찾는다.

- [ ] **Step 2: `itemcard` 키 추가**

`lang/ko.json`에서 다음 블록을:
```json
    "itemType": {
      "consumable": "소비품",
      "equipment": "장비품",
      "bag": "가방",
      "food": "요리"
    },
```
바로 뒤에 형제 키로 추가:
```json
    "itemcard": {
      "capacity": "용량"
    },
```
(들여쓰기는 주변과 동일하게. pre-commit prettier가 포맷을 정리한다.)

- [ ] **Step 3: JSON 유효성 + 게이트**

Run: `node -e "JSON.parse(require('fs').readFileSync('lang/ko.json','utf8')); console.log('valid')"`
Expected: `valid`.
Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add lang/ko.json
git commit -m "feat(i18n): add item card capacity label"
```

---

## Task 3: 템플릿 `item-card.html` + preload 등록

**Files:**
- Create: `templates/chat/item-card.html`
- Modify: `module/helpers/templates.mjs`

- [ ] **Step 1: `templates/chat/item-card.html` 작성**

```hbs
<div class="aster-chat-card item-card">
  <header class="card-header">
    <img src="{{itemImg}}" alt="{{itemName}}" />
    <div class="title">
      <div class="name">{{itemName}}</div>
      {{#if typeLabel}}<div class="formula">{{typeLabel}}</div>{{/if}}
    </div>
  </header>
  {{#if description}}
  <div class="item-body">{{{description}}}</div>
  {{/if}}
  {{#if meta.length}}
  <div class="item-meta">
    {{#each meta}}
    <div class="meta-line">
      <i class="fa-solid {{this.icon}}"></i>
      <span class="meta-label">{{this.label}}</span>
      {{#if this.value}}<span class="meta-value">{{this.value}}</span>{{/if}}
    </div>
    {{/each}}
  </div>
  {{/if}}
</div>
```
(`{{{description}}}` triple-stache — HTMLField 리치텍스트, 기존 시트와 동일하게 신뢰. `{{itemName}}`은 이스케이프.)

- [ ] **Step 2: preload 목록에 등록**

`module/helpers/templates.mjs`의 `preloadHandlebarsTemplates` 배열에서 chat 카드 그룹의 마지막 항목 뒤에 추가. 다음 줄을:
```js
    "systems/aster/templates/chat/npc-action-card.html",
```
찾아 그 뒤에 추가:
```js

    // Chat (item)
    "systems/aster/templates/chat/item-card.html",
```

- [ ] **Step 3: 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과(템플릿 파일 존재·preload 경로 유효).

- [ ] **Step 4: 커밋**

```bash
git add templates/chat/item-card.html module/helpers/templates.mjs
git commit -m "feat(chat): add item-card template and register preload"
```

---

## Task 4: `#onItemChat` 위임자 배선

**Files:**
- Modify: `module/sheets/actor-sheet.mjs`

- [ ] **Step 1: import 추가**

`module/sheets/actor-sheet.mjs` 상단 helper import 그룹에 추가:
```js
import { postItemCard } from "../helpers/item-chat.mjs";
```

- [ ] **Step 2: `#onItemChat` 본문 교체**

현재:
```js
  static async #onItemChat(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<b>${item.name}</b>`,
    });
  }
```
를 다음으로 교체:
```js
  static async #onItemChat(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await postItemCard(this.actor, item);
  }
```

- [ ] **Step 3: 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add module/sheets/actor-sheet.mjs
git commit -m "feat(chat): render item card on inventory name click"
```

---

## Task 5: `&.item-card` 스타일

**Files:**
- Modify: `scss/component/_chat-card.scss`

- [ ] **Step 1: 삽입 위치 확인**

Run: `grep -n "&.consumable-card\|&.picnic-card" scss/component/_chat-card.scss`
Expected: `&.consumable-card {`(약 438행), `&.picnic-card {`(약 559행). `&.item-card` 블록을 이들 변형과 같은 부모(`.aster-chat-card`) 안, `&.consumable-card { ... }` 블록 닫는 `}` 바로 뒤에 추가한다(다른 `&.*-card` 변형과 나란히).

- [ ] **Step 2: `&.item-card` 블록 추가**

`&.consumable-card { ... }` 블록 종료 직후에 삽입:
```scss
  // ── 아이템 정보 카드 (이름 클릭) ───────────────────────────
  &.item-card {
    .item-body {
      color: var(--cc-ink);
      font-family: var(--cc-font);
      font-size: 13px;
      line-height: 1.6;

      p {
        margin: 0 0 0.5em;
      }
      p:last-child {
        margin-bottom: 0;
      }
      ul,
      ol {
        margin: 0.3em 0;
        padding-left: 1.4em;
      }
    }

    .item-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--cc-rule);
    }

    .meta-line {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 12.5px;

      i {
        width: 14px;
        color: var(--cc-gold);
        font-size: 0.9em;
        text-align: center;
      }
      .meta-label {
        color: var(--cc-ink-soft);
        font-weight: var(--cc-weight-sm);
      }
      .meta-value {
        margin-left: auto;
        color: var(--cc-ink);
        text-align: right;
      }
    }
  }
```

- [ ] **Step 3: 게이트 (SCSS 컴파일 확인)**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과(Vite가 SCSS를 aster.css로 컴파일 — 문법 오류 시 build 실패).

- [ ] **Step 4: 커밋**

```bash
git add scss/component/_chat-card.scss
git commit -m "feat(chat): style item-card variant with herbarium tokens"
```

---

## Task 6: 최종 검증 + Foundry 수동 확인

**Files:** (없음 — 검증)

- [ ] **Step 1: 전체 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과. item-chat 테스트 포함 green.

- [ ] **Step 2: 단방향 의존 확인**

Run: `grep -nE "from ['\"].*actor-sheet" module/helpers/item-chat.mjs`
Expected: 출력 없음(item-chat이 sheet를 import하지 않음).

- [ ] **Step 3: Foundry 수동 확인 (단위 테스트 비대상 부분)**

`npm run link:foundry` 후 Foundry에서:
- 소지품 탭에서 consumable/equipment/food/bag 이름 클릭 → 카드 출력 확인.
- description 있는 아이템: 본문 리치텍스트 렌더. description 없는 아이템: 헤더+메타만.
- 타입별 메타 표기: 소비품(회복/치유/타이밍), 음식(포만/추가효과), 장비(카테고리/비활성 경고), 가방(용량).
- 라이트(약초첩) / 다크(`.aster-night` 또는 `.theme-dark`) 양쪽에서 시각 일관.
- NPC 시트 아이템 이름 클릭도 동일 카드 출력.

- [ ] **Step 4: 계획 문서 커밋 (gitignore 주의)**

`.gitignore`의 `*.md`가 무시하므로 `-f` 필요:
```bash
git add -f docs/superpowers/plans/2026-06-16-item-chat-card.md
git commit -m "docs: add item chat card implementation plan"
```

- [ ] **Step 5: 완료 처리**

`superpowers:finishing-a-development-branch` 스킬로 병합/PR/정리 옵션 결정.

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지:**
- §4 아키텍처(item-chat.mjs, 위임자) → Task 1·4. §5 buildItemCardData/postItemCard → Task 1. §6 템플릿 → Task 3. §7 SCSS → Task 5. §8 preload·lang → Task 2·3. §9 위임자 → Task 4. §11 테스트 → Task 1(단위) + Task 6(수동). 누락 없음.
- §5.1 메타 표의 모든 행(공통 effect/requirement, 소비품 4종, 음식 2종, 장비 2종, 가방 1종)이 Task 1 구현·테스트에 1:1 대응.

**2. 플레이스홀더 스캔:** "TBD/TODO/적절히" 없음. 모든 코드·테스트·edit가 완전한 실제 내용. SCSS/lang 삽입 위치는 grep 앵커로 구체 지정(플레이스홀더 아님).

**3. 타입/이름 일관성:** `buildItemCardData(item, localize)` 시그니처가 Task 1 구현·테스트·Task 1의 postItemCard 호출에서 일치. 반환 키(`itemImg/itemName/typeLabel/description/meta`)가 템플릿(Task 3)의 참조와 일치. 메타 객체 형태 `{icon,label,value}`가 빌더·테스트·템플릿에서 일치. 신규 lang 키 `ASTER.itemcard.capacity`가 Task 1 코드·Task 2 추가에서 일치.

**알려진 경미 사항:** 음식 `bonusEffect`는 전용 lang 키가 없어 `ASTER.item.effect`("효과") 라벨을 재사용한다(스펙 §5.1 "기존 키 최대 재사용" 지시 준수). 의도된 선택.

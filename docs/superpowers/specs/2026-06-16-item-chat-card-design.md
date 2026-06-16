# 아이템 채팅 카드 템플릿화 설계

- **작성일**: 2026-06-16
- **대상 프로젝트**: Aster FVTT (`2.0.0-dev.0`)
- **상태**: 승인됨, 구현 계획 작성 대기

## 1. 배경과 목표

### 1.1 문제

소지품(인벤토리) 탭에서 아이템 이름을 클릭하면(`itemChat` 액션) 현재 `#onItemChat`이 채팅에 `<b>${item.name}</b>` 한 줄만 출력한다.

```js
// module/sheets/actor-sheet.mjs (현재)
static async #onItemChat(_event, target) {
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: `<b>${item.name}</b>`,
  });
}
```

이 시스템의 다른 채팅 카드(소비품·피크닉·소생·전투·주문·합주·대미지)는 모두 `templates/chat/*.html` 템플릿 + `.aster-chat-card` 약초첩 스킨을 쓰는데, 아이템 정보 카드만 이 패턴에서 벗어나 있다.

### 1.2 목표

아이템 이름 클릭 시 **description(리치텍스트) 중심 + 핵심 메타**를 담은 채팅 카드를 기존 패턴(`templates/chat/` + `.aster-chat-card`)으로 출력한다.

### 1.3 비목표 (YAGNI)

- 굴림·판정·버튼 액션 없음 — 순수 정보 카드.
- `material`(제작 비용 배열)·`grid` 좌표·`container` 같은 내부/비표시 필드 비노출.
- 아이템 타입별 전용 템플릿 분리(접근 B)·시트 템플릿 재사용(접근 C)은 채택하지 않는다.

## 2. 사실 확인 (코드 근거)

- 모든 아이템 타입은 `module/data/base-item.mjs`의 `BaseItemModel`을 상속해 공유 필드를 가진다: `material`(NumberField[6]), `effect`(StringField), `requirement`(StringField), **`description`(HTMLField, 리치텍스트)**.
- 타입별 기능 필드:
  - **consumable**: `timing`, `mod`, `healHealth`, `cureStatus`(string[]), `cureAllStatus`(bool)
  - **food**: `restore`, `bonusEffect`
  - **equipment**: `type`(슬롯 종류, 예 `magicTool`), `size`
  - **bag**: `grid.cols`, `grid.rows`
- 채팅 카드 스킨은 `scss/component/_chat-card.scss`에 집중. CSS 커스텀 프로퍼티 토큰(`--cc-surface`, `--cc-ink`, `--cc-gold`, `--cc-font` 등) 기반이며 라이트(약초첩) 기본값 + `.aster-night`(또는 Foundry `.theme-dark`) 부모로 다크(별밤) 전환. 카드 변형은 `.aster-chat-card` 안의 `&.consumable-card`, `&.picnic-card` 등으로 정의.
- `itemChat` 액션 바인딩 위치: `templates/actor/parts/actor-sub-inventory.html`(3곳, 소지품 탭) + `templates/actor/actor-npc-sheet.html`(1곳).
- 기존 카드 helper 관용구(예: `module/helpers/consumable.mjs`의 `renderConsumableCard`): `buildXData` → `foundry.applications.handlebars.renderTemplate("systems/aster/templates/chat/X.html", data)` → `ChatMessage.create({ content, speaker })`.

## 3. 접근 방식

검토한 3가지 중 **A(단일 범용 템플릿 + 데이터 빌더)** 채택.

| 접근 | 내용 | 채택 |
|---|---|---|
| A — 단일 범용 `item-card.html` + `buildItemCardData` | 공유 헤더/description + `{{#if type}}` 조건부 메타 | **채택** |
| B — 타입별 템플릿 | `item.type`로 템플릿 선택 | 미채택 (공유 헤더/description N중 복제, 과설계) |
| C — 시트 부분 템플릿 재사용 | 시트 description partial을 채팅에 렌더 | 미채택 (채팅이 시트 레이아웃에 결합, 스킨 불일치) |

**선택 근거**: 내용 대부분(헤더·description·공통 메타)이 타입 공유라 단일 템플릿이 DRY하고, 갓 끝낸 거대 파일 분해의 helper 패턴(`consumable.mjs`/`revive.mjs`)에 정확히 들어맞는다.

## 4. 아키텍처 (신규/수정)

```
module/helpers/item-chat.mjs        # 신규 — buildItemCardData(순수) + postItemCard(렌더·전송)
module/sheets/actor-sheet.mjs       # 수정 — #onItemChat을 얇은 위임자로
templates/chat/item-card.html       # 신규 — .aster-chat-card.item-card
module/helpers/templates.mjs        # 수정 — preload 목록에 item-card.html 추가
scss/component/_chat-card.scss       # 수정 — &.item-card 변형 블록 추가
lang/ko.json                        # 수정 — 신규 키 최소 추가(가방 용량 라벨 등)
test/item-chat.test.mjs             # 신규 — buildItemCardData 단위 테스트
```

### 4.1 단방향 의존 (분해 아키텍처 유지)

`item-chat.mjs`는 `actor-sheet.mjs`를 import하지 않는다. 필요 시 `helpers/`의 순수 함수(예: `sheet-tooltips.mjs`의 `isMagicToolInactive`)만 단방향 import.

## 5. `item-chat.mjs` 사양

### 5.1 `buildItemCardData(item)` — 순수 함수 (테스트 대상)

아이템을 받아 템플릿 데이터 객체를 반환한다. 동작 없음(굴림·DB 쓰기 없음) → Vitest로 검증 가능(프로젝트 "순수 함수는 test/에 Vitest" 관례).

반환 형태:

```js
{
  itemImg: item.img,
  itemName: item.name,
  typeLabel: "<localized type label>",   // ASTER.itemType.* (없으면 "")
  description: item.system.description ?? "",  // 리치텍스트 — 템플릿에서 triple-stache
  meta: [ { icon: "<fa class>", label: "<localized>", value: "<text>" }, ... ],  // 조건부 라인 배열
}
```

`meta` 라인 구성 규칙 (값이 의미 있을 때만 push):

| 타입 | 조건 | label (재사용 lang 키) | value |
|---|---|---|---|
| 공통 | `effect` 비어있지 않음 | `ASTER.item.effect` ("효과") | `effect` |
| 공통 | `requirement` 비어있지 않음 | `ASTER.equipment.requirement` ("작성 전제") | `requirement` |
| consumable | `healHealth > 0` | `ASTER.consumable.healHealth` ("건강 회복량") | `+{healHealth}` |
| consumable | `cureAllStatus === true` | `ASTER.item.cureAllStatus` ("모든 상태이상 해제") | `ASTER.consumable.cureAllResult` |
| consumable | `cureStatus.length > 0` (그리고 cureAllStatus 아님) | `ASTER.item.cureStatus` ("해제 상태이상") | 상태이상 라벨 join (consumable.mjs의 badstatus 라벨 helper 재사용) |
| consumable | `timing` 비어있지 않음 | `ASTER.consumable.timingLabel` ("사용 타이밍") | `timing` (데이터 어휘 그대로) |
| food | `restore > 0` | `ASTER.food.restore` ("포만 회복량") | `+{restore}` |
| food | `bonusEffect` 비어있지 않음 | `ASTER.equipment.effect`/적절 키 재사용 | `bonusEffect` |
| equipment | `type` 있음 | 슬롯 라벨 (`ASTER.equipment.type.{type}`) | 라벨 값 |
| equipment | `isMagicToolInactive(item) === true` | — | 경고 라인 (기존 키 `ASTER.equipment.effectHint` 재사용 가능) |
| bag | 항상 | **신규 키** `ASTER.itemcard.capacity` ("용량") | `{cols}×{rows}` |

> 정확한 키 경로·라벨 텍스트는 구현 계획에서 `lang/ko.json` grep으로 확정한다. 원칙: **기존 키 최대 재사용, 신규 키는 공백(가방 용량 등)에만 최소 추가.**

### 5.2 `postItemCard(actor, item)` — 렌더·전송

```js
export async function postItemCard(actor, item) {
  const data = buildItemCardData(item);
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

기존 `renderConsumableCard`와 동일 관용구.

## 6. 템플릿 `templates/chat/item-card.html`

기존 `.aster-chat-card` 구조 답습(헤더 img+title, 본문 섹션). 다크/라이트는 부모 클래스 토큰 스왑이라 템플릿 분기 없음.

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
      {{#if this.icon}}<i class="fa-solid {{this.icon}}"></i>{{/if}}
      <span class="meta-label">{{this.label}}</span>
      <span class="meta-value">{{this.value}}</span>
    </div>
    {{/each}}
  </div>
  {{/if}}
</div>
```

- `description`은 HTMLField 리치텍스트 → **triple-stache `{{{description}}}`**. 사용자 작성 리치텍스트는 Foundry 에디터 산출물이므로 신뢰(기존 시트도 동일 처리).
- `itemName`은 더블-스태시(이스케이프). 헤더는 consumable-card와 동일.

## 7. 스타일 `scss/component/_chat-card.scss`

`.aster-chat-card` 안에 `&.item-card { ... }` 블록 추가. **기존 `--cc-*` 토큰만 사용** → 라이트/다크 자동.

- `.item-body`: description 가독성 — `--cc-font`, 줄간격 ~1.6, 본문 잉크색 `--cc-ink`. 내부 `p`/`ul` 기본 여백 정리.
- `.item-meta`: 라벨+값 라인 묶음. `.meta-line`은 아이콘(`--cc-gold`) + 라벨(`--cc-ink-soft`) + 값(`--cc-ink`). 시안의 consumable-card/picnic-card 메타 라인과 시각 일관.
- 헤더는 공용 `.card-header` 규칙 상속 — 추가 작업 불필요.

## 8. 등록·로컬라이즈

- `templates.mjs` `preloadHandlebarsTemplates` 목록에 `"systems/aster/templates/chat/item-card.html"` 추가.
- `lang/ko.json`: 신규 키는 공백에만 최소 추가(예: `ASTER.itemcard.capacity`). 나머지는 §5.1 표의 기존 키 재사용.

## 9. `#onItemChat` 위임자 (수정)

```js
import { postItemCard } from "../helpers/item-chat.mjs";

static async #onItemChat(_event, target) {
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;
  await postItemCard(this.actor, item);
}
```

## 10. 범위·호환

- 소지품 탭(consumable/equipment/food/bag) + NPC 시트 아이템 모두 동일 카드. 타입별 메타가 없는 타입은 description+공통 메타만 표시 → 전 타입 안전.
- description·메타가 모두 비어도 카드는 출력(헤더만) → 클릭 피드백 보장.

## 11. 테스트 전략

- `test/item-chat.test.mjs` (Vitest): `buildItemCardData`를 타입별 픽스처(consumable/food/equipment/bag, description 유/무, 각 메타 조건)로 검증 — 메타 라인 구성·typeLabel·description 패스스루.
- 템플릿/SCSS는 단위 테스트 비대상 → Foundry 수동 확인(라이트/다크, 긴 description, 메타 다수/없음).
- 게이트: `npm run build && npm run lint && npm run typecheck && npm run test`.

## 12. 성공 기준

- 소지품/NPC 아이템 이름 클릭 시 `.aster-chat-card.item-card`가 출력되고, description·타입별 핵심 메타가 표시된다.
- 라이트/다크 양쪽에서 기존 카드들과 시각 일관.
- `buildItemCardData` 단위 테스트 통과 + 게이트 4종 통과.
- `item-chat.mjs`가 `actor-sheet.mjs`를 import하지 않는 단방향 의존 유지.

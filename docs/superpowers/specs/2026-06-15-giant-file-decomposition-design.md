# 거대 파일 구조 분해 설계 (TS 전환 전 단계)

- **작성일**: 2026-06-15
- **대상 프로젝트**: Aster FVTT (`2.0.0-dev.0`)
- **상태**: 승인됨, 구현 계획 작성 대기

## 1. 배경과 목표

### 1.1 문제

소스 7,603줄 중 두 파일이 55%를 차지해 읽기·수정이 어렵다.

- `module/sheets/actor-sheet.mjs` — 2,938줄. `AsterActorSheet` 하나에 컨텍스트 준비, DOM 렌더, 인벤토리·전투·합주·소비품·소생·장비·공방·주문·기록 액션이 모두 응집.
- `module/aster.mjs` — 1,223줄. 진입점에 부트스트랩 등록 + 훅 배선 + 도메인 로직(데미지/회복/상태이상 ~400줄)이 혼재.

### 1.2 목표

거대 파일을 책임별 모듈로 분해한다. `actor-sheet.mjs`를 **< ~800줄**로 축소하는 것을 정량 목표로 삼는다.

### 1.3 비목표 (이번 스펙 범위 밖)

- **TypeScript 전환** — 별도 후속 스펙. 본 작업은 JS(`.mjs`) 상태에서 구조만 분해한다.
- 중복 로직 제거·결합도 개선·테스트 가능성 향상을 위한 별도 리팩토링 — 분해에 부수적으로 따라오는 범위로 한정한다.
- 동작 변경·기능 추가·버그 수정.

## 2. 불변 원칙

1. **동작 보존**: 본문 로직은 바꾸지 않는다. 코드를 옮기거나, `this.x` 의존을 명시 인자로 승격하는 시그니처 조정만 허용한다.
2. **기존 패턴 답습**: 로직은 이미 존재하는 `helpers/`(spell-roll, roll-result, unison-table, target-select, dice-select 등) 관용구를 따른다. 새 아키텍처 패턴을 도입하지 않는다.
3. **단계별 검증**: 추출 1건 = 커밋 1건. 각 커밋 후 `npm run build && npm run lint && npm run typecheck && npm run test` 통과를 확인한다.
4. **TS는 범위 밖**: 본 스펙은 JS 구조 분해까지만 다룬다.

## 3. 접근 방식

검토한 3가지 중 **A + C 하이브리드**를 채택했다.

| 접근 | 내용 | 채택 여부 |
|---|---|---|
| A — 도메인 자유 함수 추출 + 얇은 위임자 | 복잡한 도메인 덩어리를 `(actor, data) ⇒ ...` 자유 함수로 추출, 액션 핸들러는 얇은 래퍼로 잔류 | `actor-sheet.mjs`에 적용 |
| B — 믹스인 합성 | 메서드를 메서드로 유지한 채 믹스인으로 분리 | 미채택 (결합도 미개선, 정교한 패턴·TS 난이도 ↑) |
| C — 진짜 기계적 이동 | 이미 자유 함수/훅인 것만 이동 | `aster.mjs`에 적용 |

**선택 근거**: `aster.mjs`는 이미 `export`된 자유 함수·훅이라 기계적 이동(C)이 안전·충분하다. `actor-sheet.mjs`는 내용 대부분이 클래스 메서드라 기계적 이동이 불가하며, 합주·전투·데미지 같은 **업무 개념 단위**로 자유 함수 추출(A)하는 것이 파일 축소 + 명료성 + 후속 TS 포석을 동시에 만족한다.

## 4. 목표 디렉토리 구조 (신규 파일)

```
module/
  aster.mjs                      # 진입점 — init/ready 등록 + 훅 모듈 부수효과 import만 (~120줄 목표)
  hooks/
    item-hooks.mjs               # preCreateItem, preDeleteItem (가방/인벤 생명주기)
    combat-hooks.mjs             # create/deleteCombatant, combatStart, deleteCombat, updateCombatant, renderCombatTracker, refresh*
    chat-hooks.mjs               # renderChatMessageHTML 핸들러 2개
    ui-hooks.mjs                 # getSceneControlButtons, renderTokenHUD(+패널), rollItemMacro/createItemMacro, hotbarDrop·updateSetting
  helpers/
    health-status.mjs            # DAMAGE_STATUSES, applyDamageAndStatus, applyHealHealth, applyCure* (aster.mjs에서 이동)
    theme.mjs                    # applyAsterTheme
    unison.mjs                   # 합주 ~700줄
    combat-actions.mjs           # resolveCombatAction, resolveNpcActionUse, renderNpcActionCard
    spell-cast.mjs               # 주문 시전 흐름 + processSpellRoll
    consumable.mjs               # useConsumable, renderConsumableCard, consumableHasHeal
    revive.mjs                   # requestRevive, renderReviveCard
    equipment.mjs                # equipItem, unequipItem
    craft-actions.mjs            # 공방 취득/초기화 (비용 차감)
  sheets/
    actor-sheet.mjs              # 슬림화된 클래스 (< ~800줄 목표)
    sheet-context.mjs            # _prepare* + buildCombat/ReviveContext
    sheet-tooltips.mjs           # build*Tooltip, inventorySummary, formatFormula
```

## 5. `aster.mjs` 분해 (접근 C)

### 5.1 잔류 항목 (~120줄, 진입점)

- SCSS + 모든 document/sheet/datamodel import
- `Hooks.once("init")` 등록 블록 전체 (`game.aster`, `CONFIG.*`, 시트 등록, settings 등록, handlebars)
- `Hooks.once("ready")` 부트스트랩 골격
- 신규 훅 모듈 부수효과 import (`import "./hooks/item-hooks.mjs"` 등) — 현재 top-level 등록과 동일한 동작·순서 보존
- `theme.mjs`의 `applyAsterTheme`, `ui-hooks.mjs`의 `rollItemMacro`를 import해 `init`/`game.aster`에서 참조

### 5.2 이동 매핑

| 신규 파일 | 이동 항목 (현재 aster.mjs 라인) | 비고 |
|---|---|---|
| `helpers/health-status.mjs` | `DAMAGE_STATUSES`(402), `applyCureStatus`(420), `applyCureAllStatus`(442), `applyHealHealth`(473), `applyDamageAndStatus`(609) | 순수 이동. actor-sheet의 import 경로를 `aster.mjs`→`health-status.mjs`로 교체 |
| `helpers/theme.mjs` | `applyAsterTheme`(138) | aster.mjs(init)·ui-hooks 양쪽에서 import |
| `hooks/item-hooks.mjs` | `preDeleteItem`(151), `preCreateItem`(174), `SINGLETON_TYPES`(172) | |
| `hooks/chat-hooks.mjs` | `renderChatMessageHTML`(274), `renderChatMessageHTML`(820) | |
| `hooks/combat-hooks.mjs` | `createCombatant`(1008), `deleteCombatant`(1017), `combatStart`(1027), `deleteCombat`(1033), `updateCombatant`(1041), `renderCombatTracker`(1047), `refreshCombatSheets`(1002), `refreshActorSheet`(996) | |
| `hooks/ui-hooks.mjs` | `getSceneControlButtons`(254), `renderTokenHUD`(1201)+`buildAsterHudPanel`(1170), `rollItemMacro`(1142)+`createItemMacro`, `hotbarDrop`·`updateSetting` 배선 | `ready` 안 중첩 등록을 ui-hooks top-level로 평탄화 |

### 5.3 불가피한 최소 변경

- `ready` 콜백 내부에 중첩 등록되던 `hotbarDrop`/`updateSetting`을 ui-hooks 모듈 top-level 등록으로 옮긴다. 런타임 발화 시점이 ready 이후라 동작은 동일하다.
- `applyDamageAndStatus` 등이 aster.mjs 내 다른 헬퍼(`resolveOpposed` 등)를 참조하면 해당 import를 `health-status.mjs`로 동반 이동한다.

## 6. `actor-sheet.mjs` 분해 (접근 A)

### 6.1 핵심 패턴 — 얇은 위임자

Foundry 액션 바인딩(`actions: { combatAction: AsterActorSheet.#onCombatAction }`)은 클래스 정적 메서드를 가리켜야 한다. 따라서 액션 핸들러 껍데기는 클래스에 남기고, 무거운 본문만 자유 함수로 추출한다.

```js
// helpers/combat-actions.mjs (추출된 본문)
export async function resolveCombatAction({ actor, combatant, actionKey, ... }) {
  /* 기존 본문 그대로 */
}

// sheets/actor-sheet.mjs (남는 얇은 래퍼)
static async #onCombatAction(_event, target) {
  const actionKey = target.dataset.action; // 컨텍스트 수집만
  return resolveCombatAction({ actor: this.actor, combatant: ..., actionKey });
}
```

### 6.2 추출 매핑

| 신규 파일 | 이동 항목 (라인) | 비고 |
|---|---|---|
| `helpers/unison.mjs` | `_proceedUnisonDice`(1221), `_applyUnisonMainEffect`(1306), `_applyUnisonSubEffect`(1457), `_unisonSubRed/Green/Yellow`(1501/1544/1592), `_renderUnisonCard`(1623) | 최대 덩어리 ~700줄. `#onUnisonAttack` 껍데기만 잔류. `unison-table.mjs`와 협력 |
| `helpers/combat-actions.mjs` | `#onCombatAction` 본문(744), `#onNpcActionUse` 본문(930), `#renderNpcActionCard`(1089) | ~350줄. 껍데기 2개 잔류 |
| `helpers/spell-cast.mjs` | `#processSpellRoll`(2510), `#onSpellCast`/`#onSpellCastWithExtra` 본문(2393/2416) | `spell-roll.mjs`(계산)와 분리 |
| `helpers/consumable.mjs` | `useConsumable`(2008), `#renderConsumableCard`(2044), `#consumableHasHeal`(1987) | static-public이라 이동 쉬움 |
| `helpers/revive.mjs` | `requestRevive`(2101), `#renderReviveCard`(2170) | |
| `helpers/equipment.mjs` | `equipItem`(2212), `unequipItem`(2227) | 순수 이동에 가까움 |
| `helpers/craft-actions.mjs` | `#onToggleSkill` 본문(2231), `#onCraftReset` 본문(2319) | `craft-cost.mjs`와 협력 |
| `sheets/sheet-context.mjs` | `_prepareCharacterData`(198), `_prepareInventory`(216), `_prepareCraft`(318)+`#craftWarn`(457), `_prepareItems`(478), `_prepareSpellList`(487), `_prepareRecord`(513), `#buildCombatContext`(151), `#buildReviveContext`(188) | `(actor, context) ⇒ ...` 형태. `_prepareContext`가 오케스트레이션 |
| `sheets/sheet-tooltips.mjs` | `#inventorySummary`(1874), `#isMagicToolInactive`(1891), `#buildStatusTooltips`(1907), `#buildItemTooltip`(1937), `#buildSpellTooltip`(1969), `#formatFormula`(505) | 순수 포맷팅 |

### 6.3 잔류 항목 (< ~800줄 목표)

- `DEFAULT_OPTIONS`, `PARTS`, `get title`, `_configureRenderOptions`
- `_prepareContext` (얇은 오케스트레이터), `_onRender`
- 셀 좌표 헬퍼 `#cellToXY`/`#clampStart`/`#promptItemChoice`
- 인벤토리/음식/피크닉 액션, 공방 lock/itemOpen/`openCraftDialog`, 기록 prev/next/add/delete
- itemChat/Edit/Delete/Create, rollDodge/rollHit, abl/emo/asterStep 굴림
- 모든 `#onX` 액션 핸들러 껍데기 (위임자)

### 6.4 불가피한 최소 변경

- `#private` 메서드를 모듈로 빼면 호출부가 `this.#foo()` → import한 `foo(...)`로 바뀐다. 이때 `this.actor` 등 의존을 명시 인자로 승격한다. 접근 A가 감수하는 유일한 본문 변경이다.
- 추출 함수 간 공유 상수(예: `#BADSTATUS_KEYS`)는 적절한 모듈로 동반 이동한다.
- helpers/* 모듈은 sheet를 import하지 않는다(순환 의존 방지). sheet가 helpers를 단방향 import한다.

## 7. 작업 순서

저위험·무의존 먼저, 고위험·다의존 나중. 각 단계는 독립 커밋이라 문제 시 해당 커밋만 되돌린다.

- **Phase 0 — 베이스라인**: 현재 `build/lint/typecheck/test` 모두 통과 확인 → `develop`에서 작업 브랜치 분기.
- **Phase 1 — `aster.mjs` 분해** (저위험·기계적): ① `health-status.mjs` (sheet import 경로 교체 동반) → ② `theme.mjs` → ③ `item-hooks.mjs` → ④ `chat-hooks.mjs` → ⑤ `combat-hooks.mjs` → ⑥ `ui-hooks.mjs`.
- **Phase 2 — sheet 순수 추출**: ⑦ `sheet-tooltips.mjs` → ⑧ `equipment.mjs` → ⑨ `consumable.mjs` → ⑩ `revive.mjs`.
- **Phase 3 — sheet 컨텍스트 분리**: ⑪ `sheet-context.mjs` (`_prepareContext`를 오케스트레이터로 축소).
- **Phase 4 — sheet 도메인 액션** (위임자 패턴): ⑫ `craft-actions.mjs` → ⑬ `spell-cast.mjs` → ⑭ `combat-actions.mjs` → ⑮ `unison.mjs` (최후·최대, 하위 함수 단위로 더 분할 가능).
- **Phase 5 — 마감**: 최종 검증 + `actor-sheet.mjs` 라인 수 측정(목표 달성 확인) + 설계 문서 커밋.

## 8. 커밋 전략

- **자동 커밋 안 함.** 각 단계 검증 통과 후 커밋은 사용자가 직접 하거나 명시 요청 시 수행한다.
- 형식: Conventional Commits, 영어, co-author 없음, 명세 넘버링 없음. 예: `refactor(aster): move health/status logic to health-status.mjs`, `refactor(sheet): extract unison flow into unison.mjs`.
- 리팩토링 커밋과 설계 문서(docs) 커밋은 분리한다.

## 9. 검증 전략과 한계

- 단계별 게이트: `npm run build && npm run lint && npm run typecheck && npm run test`.
- **한계 (명시)**: 전략이 "순수 이동"이고 `checkJs:false`이므로 `typecheck`는 로직 회귀를 잡지 못한다. `build`/`lint`는 문법·import 오류만 잡는다.
- 따라서 실질 안전망은 ① 작은 커밋 단위 ② 단계별 Foundry 수동 동작 확인이다. Foundry 구동이 어려운 단계는 커밋을 더 잘게 쪼개 위험을 분산한다.
- 롤백: 각 커밋은 독립 revert 가능. 특정 기능이 Foundry에서 깨지면 해당 커밋만 되돌린다.

## 10. 성공 기준

- `actor-sheet.mjs` < ~800줄, `aster.mjs` ~120줄.
- 모든 단계에서 `build/lint/typecheck/test` 통과.
- 동작 회귀 없음 (단계별 Foundry 수동 확인).
- helpers/* 가 sheet를 import하지 않는 단방향 의존 유지.

## 11. TS 후속 연결 (범위 밖, 포석)

이번 분해의 부수 효과로 `helpers/*`의 작은 자유 함수들이 TS 전환의 가장 쉬운 1차 대상이 된다. 후속 TS 스펙 권장 순서: 순수 헬퍼 → **DataModel 타입 선언(키스톤)** → documents → sheet. 별도 스펙으로 분리한다.

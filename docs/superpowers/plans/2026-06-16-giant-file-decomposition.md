# 거대 파일 구조 분해 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `module/sheets/actor-sheet.mjs`(2,938줄)와 `module/aster.mjs`(1,223줄)를 책임별 모듈로 순수 이동 분해해, actor-sheet < ~800줄·aster < ~140줄로 축소한다.

**Architecture:** 동작을 바꾸지 않는 순수 이동. `aster.mjs`는 이미 자유 함수/훅인 것을 기계적으로 `hooks/`·`helpers/`로 옮긴다(접근 C). `actor-sheet.mjs`는 클래스 메서드의 무거운 본문만 `helpers/`의 자유 함수로 추출하고, Foundry 액션 바인딩이 가리키는 정적 메서드는 얇은 위임자(thin wrapper)로 잔류시킨다(접근 A). helpers/* 는 sheet를 import하지 않는 단방향 의존을 유지한다.

**Tech Stack:** JavaScript ESM(`.mjs`), Vite(lib 모드), Foundry VTT V13 API, Vitest, ESLint flat config, Prettier. (TypeScript 전환은 본 계획 범위 밖.)

**관련 스펙:** [`docs/superpowers/specs/2026-06-15-giant-file-decomposition-design.md`](../specs/2026-06-15-giant-file-decomposition-design.md) — 설계 근거·접근 채택 이유는 스펙 참조.

---

## ⚠️ 이 계획은 "순수 이동" 리팩토링이다 — 표준 TDD 플랜과 다른 점

일반적인 writing-plans는 "실패 테스트 → 구현 → 통과" TDD 사이클을 쓴다. 본 작업은 **신규 동작이 없는 코드 이동**이라 새 테스트를 작성하지 않는다. 대신:

- **회귀 안전망 = 검증 게이트 + 작은 커밋**: 추출 1건 = 커밋 1건. 각 커밋 직전 `npm run build && npm run lint && npm run typecheck && npm run test` 전부 통과를 확인한다.
- **검증의 한계(명시)**: `checkJs:false`라 typecheck는 로직 회귀를 못 잡고, build/lint는 문법·import 오류만 잡는다. 따라서 **실질 안전망은 작은 커밋 단위 + 단계별 Foundry 수동 동작 확인**이다. Foundry 심링크: `npm run link:foundry`.
- **이동 본문은 계획에 복붙하지 않는다**: 옮길 코드는 소스에 이미 정확한 라인 범위로 존재한다. 본 계획은 **새로 생기는 코드만**(파일 헤더, import 문, 얇은 위임자 시그니처, 호출부 수정)을 정확히 보여주고, 이동 본문은 `파일:시작-끝` 라인 범위로 지시한다. 라인 범위는 **그 단계 진입 시점 기준**이며, 앞선 추출로 라인이 밀리므로 **반드시 작업 직전 해당 함수명을 grep으로 재확인**한다.

### 이동 레시피 (모든 추출 작업의 공통 절차)

각 추출 작업(Task)은 아래 5스텝을 따른다. Task 본문은 이 레시피의 **변수**(어떤 함수를, 어디로, 어떤 import로)만 채운다.

1. **새 파일 생성**: 대상 모듈 파일을 만들고 ① 필요한 import ② 옮긴 함수 본문(소스에서 잘라옴) ③ `export` 부착(외부에서 부르는 함수만)을 넣는다.
2. **원본에서 제거**: `aster.mjs`/`actor-sheet.mjs`에서 옮긴 함수 정의를 삭제한다. (클래스 메서드 추출이면 본문을 자유 함수로 옮기고 껍데기 위임자만 남긴다.)
3. **호출부 배선**: 원본/다른 파일에서 옮긴 함수를 부르던 곳에 새 모듈 import를 추가한다. 부수효과 훅 모듈은 `import "./hooks/xxx.mjs";` 형태로 진입점에 등록.
4. **검증 게이트**: `npm run build && npm run lint && npm run typecheck && npm run test` → 모두 통과 확인. (build는 미사용 import·미정의 참조를 잡는다.)
5. **커밋**: Conventional Commits, 영어, co-author 없음, 명세 넘버링 없음. **자동 커밋 금지 — 사용자 승인 후 수행.**

---

## 파일 구조 (생성/수정 대상)

**신규 생성:**

```
module/hooks/item-hooks.mjs      # preCreateItem, preDeleteItem, SINGLETON_TYPES, promptFoodReplace
module/hooks/chat-hooks.mjs      # renderChatMessageHTML×2, CRIT_COLORS, 데미지 카드 흐름
module/hooks/combat-hooks.mjs    # combatant/combat 훅 5개 + refreshActorSheet/refreshCombatSheets
module/hooks/ui-hooks.mjs        # getSceneControlButtons, renderTokenHUD, HUD패널, rollItemMacro, createItemMacro, hotbarDrop/updateSetting
module/helpers/health-status.mjs # DAMAGE_STATUSES, applyCure*, applyHealHealth, applyDamageAndStatus + reduction 헬퍼
module/helpers/theme.mjs         # applyAsterTheme
module/helpers/sheet-tooltips.mjs# build*Tooltip, inventorySummary, isMagicToolInactive, formatFormula, BADSTATUS_KEYS, TOOLTIP_ICON
module/helpers/equipment.mjs     # equipItem, unequipItem
module/helpers/consumable.mjs    # useConsumable, renderConsumableCard, consumableHasHeal
module/helpers/revive.mjs        # requestRevive, renderReviveCard
module/helpers/craft-actions.mjs # acquireSkill(=onToggleSkill 본문), resetCraft(=onCraftReset 본문)
module/helpers/spell-cast.mjs    # castSpell, castSpellWithExtra 본문, processSpellRoll
module/helpers/combat-actions.mjs# resolveCombatAction, resolveNpcActionUse, renderNpcActionCard
module/helpers/unison.mjs        # 합주 흐름 ~700줄
module/sheets/sheet-context.mjs  # _prepare* + buildCombat/ReviveContext
```

**수정:**

```
module/aster.mjs                 # 진입점으로 축소 (~140줄)
module/sheets/actor-sheet.mjs    # 슬림 클래스 (< ~800줄)
module/sheets/item-sheet.mjs     # DAMAGE_STATUSES import 경로 교체 (1줄)
```

---

## Phase 0 — 베이스라인 + 작업 브랜치

### Task 0: 베이스라인 확인 및 분기

**Files:** (없음 — 환경 준비)

- [ ] **Step 1: 현재 develop에서 게이트 통과 확인**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 4개 모두 성공 (exit 0). 실패 시 분해 작업을 시작하지 말 것 — 베이스라인이 깨진 상태에서는 회귀를 구분할 수 없다.

- [ ] **Step 2: 작업 브랜치 분기**

```bash
git checkout develop
git checkout -b refactor/decompose-giant-files
```

- [ ] **Step 3: 현재 라인 수 기록 (사후 비교용)**

Run: `wc -l module/aster.mjs module/sheets/actor-sheet.mjs`
Expected: `aster.mjs` 1223, `actor-sheet.mjs` 2938. (Phase 5에서 이 값과 비교한다.)

---

## Phase 1 — `aster.mjs` 분해 (저위험·기계적, 접근 C)

> **순환 의존 주의**: 현재 `actor-sheet.mjs`와 `item-sheet.mjs`가 `aster.mjs`에서 `DAMAGE_STATUSES` 등을 import하고, `aster.mjs`는 `AsterActorSheet`를 import한다(순환). Task 1이 이 순환을 끊는다 — 가장 먼저 수행한다.

### Task 1: `helpers/health-status.mjs` — 데미지/회복/상태이상 (순환 의존 차단)

**Files:**
- Create: `module/helpers/health-status.mjs`
- Modify: `module/aster.mjs` (함수 제거 + 데미지 카드 잔존 함수의 import 추가)
- Modify: `module/sheets/actor-sheet.mjs:14-21` (import 경로 교체)
- Modify: `module/sheets/item-sheet.mjs:1` (import 경로 교체)

- [ ] **Step 1: 이동 대상 함수의 현재 라인을 재확인**

Run: `grep -nE 'DAMAGE_STATUSES|applyCureStatus|applyCureAllStatus|applyHealHealth|applyDefendReduction|applyYellowReduction|applyDamageAndStatus' module/aster.mjs`
Expected(베이스라인 기준): `export const DAMAGE_STATUSES`(402), `applyCureStatus`(420), `applyCureAllStatus`(442), `applyHealHealth`(473), `applyDefendReduction`(549), `applyYellowReduction`(579), `applyDamageAndStatus`(609).

- [ ] **Step 2: `module/helpers/health-status.mjs` 생성**

이동할 함수 7개: `DAMAGE_STATUSES`, `applyCureStatus`, `applyCureAllStatus`, `applyHealHealth`, `applyDefendReduction`, `applyYellowReduction`, `applyDamageAndStatus`. 이 중 외부 호출용은 `DAMAGE_STATUSES`, `applyCureStatus`, `applyCureAllStatus`, `applyHealHealth`, `applyDamageAndStatus`에 `export` 유지. `applyDefendReduction`/`applyYellowReduction`은 `applyDamageAndStatus` 내부 전용이므로 **export 없이** 모듈 내부 함수로 둔다(단, Task 4의 데미지 카드 흐름도 사용 → **export 부착**한다. 아래 주의 참조).

> **주의(동반 사용)**: `applyDefendReduction`/`applyYellowReduction`은 Task 4로 갈 `applyDamageFromCard`/`applyDamageFromOpposed` 경로에서는 사용하지 않고 `applyDamageAndStatus` 경유로만 쓰인다. 따라서 두 함수는 health-status.mjs 내부 비-export로 두면 충분하다. Step에서 grep으로 외부 참조가 없음을 재확인할 것.

파일 골격(헤더 + import만 신규, 함수 본문은 소스에서 그대로 이동):

```js
/**
 * 데미지·회복·상태이상 적용 로직.
 * aster.mjs에서 분리 — 동작 변경 없음.
 */
import { BADSTATUS_EFFECTS } from "./badstatus-effects.mjs";

// ↓ aster.mjs에서 이동: DAMAGE_STATUSES, applyCureStatus, applyCureAllStatus,
//   applyHealHealth, applyDefendReduction, applyYellowReduction, applyDamageAndStatus
//   (export 키워드는 DAMAGE_STATUSES / applyCure* / applyHealHealth / applyDamageAndStatus 에만 유지)
```

> **import 확정 절차**: 옮긴 7개 함수 본문이 참조하는 식별자를 확인하라.
> Run: `sed -n '402,650p' module/aster.mjs | grep -oE '\b(BADSTATUS_EFFECTS|CONFIG|game|foundry|ChatMessage|CONST)\b' | sort -u`
> 결과에 나온 import-필요 식별자(현재 aster.mjs 상단에서 온 것: `BADSTATUS_EFFECTS`)만 health-status.mjs 상단에 추가한다. `game`/`foundry`/`CONFIG`/`CONST`/`ChatMessage`는 전역이라 import 불필요.

- [ ] **Step 3: `aster.mjs`에서 7개 함수 정의 제거**

해당 7개 함수 정의 블록을 삭제한다. `aster.mjs` 안에서 이 함수들을 부르던 곳(`applyDamageFromCard`/`applyDamageFromOpposed`가 `applyDamageAndStatus`를 호출)에 import를 추가:

`aster.mjs` 상단 helpers import 그룹에 추가:
```js
import { applyDamageAndStatus } from "./helpers/health-status.mjs";
```
(나머지 4개 export는 aster.mjs 내부에서 직접 호출되지 않으면 import하지 않는다 — Step 5 grep으로 확인.)

- [ ] **Step 4: `actor-sheet.mjs`·`item-sheet.mjs` import 경로 교체**

`actor-sheet.mjs:14-21` 의 블록을:
```js
import {
  DAMAGE_STATUSES,
  applyCureStatus,
  applyCureAllStatus,
  applyDamageAndStatus,
  applyHealHealth,
} from "../aster.mjs";
```
→ `from "../helpers/health-status.mjs";` 로 교체.

`item-sheet.mjs:1`:
```js
import { DAMAGE_STATUSES } from "../aster.mjs";
```
→ `import { DAMAGE_STATUSES } from "../helpers/health-status.mjs";`

- [ ] **Step 5: 잔존 참조·미사용 import 확인**

Run: `grep -rnE 'from .*aster\.mjs' module/ && grep -nE 'applyDamageAndStatus|applyDefendReduction|applyYellowReduction' module/aster.mjs`
Expected: `aster.mjs`에서 import한 `aster.mjs`는 더 이상 없음(순환 끊김). `applyDamageAndStatus`는 import 1줄 + 호출부에만 등장. `applyDefendReduction`/`applyYellowReduction`은 aster.mjs에 더 이상 없음(health-status로 이동됨).

- [ ] **Step 6: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과. build가 미정의 참조/순환을 잡는다.

- [ ] **Step 7: 커밋 (사용자 승인 후)**

```bash
git add module/helpers/health-status.mjs module/aster.mjs module/sheets/actor-sheet.mjs module/sheets/item-sheet.mjs
git commit -m "refactor(aster): move health/damage/status logic to health-status.mjs"
```

---

### Task 2: `helpers/theme.mjs` — applyAsterTheme

**Files:**
- Create: `module/helpers/theme.mjs`
- Modify: `module/aster.mjs`

- [ ] **Step 1: 라인 재확인**

Run: `grep -nE 'function applyAsterTheme|applyAsterTheme\(' module/aster.mjs`
Expected: 정의 1곳(베이스라인 138) + 호출(ready 훅 내부 1곳, Task 4의 chat-hooks 등 다른 곳에서 호출 안 함 → grep 결과로 확정).

- [ ] **Step 2: `module/helpers/theme.mjs` 생성**

```js
/**
 * body data-attribute로 Aster 테마 영역을 토글한다. aster.mjs에서 분리.
 */
export function applyAsterTheme(theme) {
  // ↓ aster.mjs의 applyAsterTheme 본문 그대로 이동
}
```
(본문이 외부 식별자를 참조하면 Step에서 grep 후 import 추가 — `sed -n '138,150p' module/aster.mjs`로 본문 범위 확인.)

- [ ] **Step 3: `aster.mjs`에서 정의 제거 + import 추가**

`aster.mjs` 상단에 `import { applyAsterTheme } from "./helpers/theme.mjs";` 추가. ready 훅 내부 호출부는 그대로 둔다(import한 함수로 해석됨).

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋 (승인 후)**

```bash
git add module/helpers/theme.mjs module/aster.mjs
git commit -m "refactor(aster): move applyAsterTheme to theme.mjs"
```

---

### Task 3: `hooks/item-hooks.mjs` — 아이템 생명주기 훅

**Files:**
- Create: `module/hooks/item-hooks.mjs`
- Modify: `module/aster.mjs`

이동 항목: `Hooks.on("preDeleteItem", …)`(베이스라인 151), `SINGLETON_TYPES`(172), `Hooks.on("preCreateItem", …)`(174), `promptFoodReplace`(207, preCreateItem이 호출).

- [ ] **Step 1: 라인·의존 재확인**

Run: `grep -nE 'preDeleteItem|preCreateItem|SINGLETON_TYPES|promptFoodReplace' module/aster.mjs`
그리고 `promptFoodReplace` 본문의 외부 참조:
Run: `sed -n '174,253p' module/aster.mjs | grep -oE '\b(foundry|game|ChatMessage|CONFIG|Dialog|DialogV2)\b' | sort -u`

- [ ] **Step 2: `module/hooks/item-hooks.mjs` 생성 (부수효과 모듈)**

```js
/**
 * 아이템 생명주기 훅 — 가방/음식 단일 슬롯 제약 등.
 * import 시 top-level에서 Hooks.on(...) 등록(부수효과). aster.mjs에서 분리.
 */

const SINGLETON_TYPES = ["bag", "food"];

// ↓ aster.mjs에서 이동: Hooks.on("preDeleteItem", …), Hooks.on("preCreateItem", …),
//   async function promptFoodReplace(...) {}
```
(필요 import는 Step 1 grep 결과로 확정. 전역(`game`/`foundry`)은 불필요.)

- [ ] **Step 3: `aster.mjs`에서 제거 + 부수효과 import 등록**

해당 4개 항목 삭제. `aster.mjs` 상단(다른 import 뒤, init 훅 앞)에 추가:
```js
// 훅 모듈 — import 시 top-level에서 Hooks.on(...) 등록 (부수효과)
import "./hooks/item-hooks.mjs";
```

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋 (승인 후)**

```bash
git add module/hooks/item-hooks.mjs module/aster.mjs
git commit -m "refactor(aster): move item lifecycle hooks to item-hooks.mjs"
```

---

### Task 4: `hooks/chat-hooks.mjs` — 채팅 카드 훅 + 데미지 카드 흐름

**Files:**
- Create: `module/hooks/chat-hooks.mjs`
- Modify: `module/aster.mjs`

이동 항목(베이스라인 라인): `CRIT_COLORS`(272), `Hooks.on("renderChatMessageHTML", …)` 크리티컬 편집(274), `promptDamageDialog`(511), `renderDamageResultCard`(650), `applyDamageFromCard`(726), `applyDamageFromOpposed`(780), `Hooks.on("renderChatMessageHTML", …)` 데미지 카드(820).

> **import 의존**: 이 흐름은 `applyDamageAndStatus`(→ health-status.mjs, Task 1 완료)와 `resolveOpposed`(→ roll-result.mjs)를 사용한다.

- [ ] **Step 1: 라인·의존 재확인**

Run: `grep -nE 'CRIT_COLORS|renderChatMessageHTML|promptDamageDialog|renderDamageResultCard|applyDamageFromCard|applyDamageFromOpposed|applyDamageAndStatus|resolveOpposed' module/aster.mjs`
Expected: 위 7개 항목 정의 + `applyDamageAndStatus`는 Task 1에서 추가한 import 1줄과 데미지 흐름 호출부에 등장, `resolveOpposed`는 상단 import + applyDamageFromOpposed 내부 호출.

- [ ] **Step 2: `module/hooks/chat-hooks.mjs` 생성 (부수효과 모듈)**

```js
/**
 * 채팅 카드 훅 — 크리티컬 결과 편집 + 데미지 적용 카드.
 * import 시 top-level에서 Hooks.on("renderChatMessageHTML", …) 2건 등록(부수효과).
 * aster.mjs에서 분리.
 */
import { applyDamageAndStatus } from "../helpers/health-status.mjs";
import { resolveOpposed } from "../helpers/roll-result.mjs";

const CRIT_COLORS = ["red", "blue", "white", "yellow", "green"];

// ↓ aster.mjs에서 이동: 두 renderChatMessageHTML 훅 + promptDamageDialog,
//   renderDamageResultCard, applyDamageFromCard, applyDamageFromOpposed
```
(추가 import 필요 여부는 `sed -n '274,400p;505,940p' module/aster.mjs | grep -oE …` 로 확정. 후보: `ChatMessage`, `foundry`, `game` → 전역.)

- [ ] **Step 3: `aster.mjs`에서 제거 + 배선 정리**

7개 항목 삭제. Task 1에서 aster.mjs에 넣은 `import { applyDamageAndStatus } …`는 이제 aster.mjs에서 미사용이면 **제거**(grep으로 확인). `resolveOpposed` import도 aster.mjs에서 다른 사용처가 없으면 제거. 부수효과 import 등록:
```js
import "./hooks/chat-hooks.mjs";
```

- [ ] **Step 4: 미사용 import 확인**

Run: `grep -nE 'applyDamageAndStatus|resolveOpposed|CRIT_COLORS' module/aster.mjs`
Expected: 전부 0건(모두 chat-hooks로 이동). 남아있으면 미사용 import → 삭제.

- [ ] **Step 5: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과. (lint의 no-unused-vars가 잔존 import를 잡는다.)

- [ ] **Step 6: 커밋 (승인 후)**

```bash
git add module/hooks/chat-hooks.mjs module/aster.mjs
git commit -m "refactor(aster): move chat card hooks and damage flow to chat-hooks.mjs"
```

---

### Task 5: `hooks/combat-hooks.mjs` — 전투 훅

**Files:**
- Create: `module/hooks/combat-hooks.mjs`
- Modify: `module/aster.mjs`

이동 항목(베이스라인): `refreshActorSheet`(996), `refreshCombatSheets`(1002), `Hooks.on("createCombatant",…)`(1008), `deleteCombatant`(1017), `combatStart`(1027), `deleteCombat`(1033), `updateCombatant`(1041), `renderCombatTracker`(1047).

> **의존**: `combatStart`/`deleteCombat`이 `AsterCombat`을 `instanceof` 체크에 사용 → `import { AsterCombat } from "../documents/combat.mjs";` 필요.

- [ ] **Step 1: 라인·의존 재확인**

Run: `grep -nE 'refreshActorSheet|refreshCombatSheets|createCombatant|deleteCombatant|combatStart|deleteCombat|updateCombatant|renderCombatTracker|AsterCombat' module/aster.mjs`

- [ ] **Step 2: `module/hooks/combat-hooks.mjs` 생성 (부수효과 모듈)**

```js
/**
 * 전투 훅 — 전투원 추가/제거/라운드 시작/종료 시 시트 동기화 + Combat Tracker AP 표시.
 * import 시 top-level에서 Hooks.on(...) 등록(부수효과). aster.mjs에서 분리.
 */
import { AsterCombat } from "../documents/combat.mjs";

// ↓ aster.mjs에서 이동: refreshActorSheet, refreshCombatSheets,
//   Hooks.on("createCombatant"/"deleteCombatant"/"combatStart"/"deleteCombat"/"updateCombatant"/"renderCombatTracker", …)
```

- [ ] **Step 3: `aster.mjs`에서 제거 + 배선 정리**

8개 항목 삭제. `AsterCombat`이 aster.mjs에서 다른 곳에 안 쓰이면 import 제거(grep 확인 — ready 훅 등에서 쓸 수 있으니 주의). 부수효과 import:
```js
import "./hooks/combat-hooks.mjs";
```

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋 (승인 후)**

```bash
git add module/hooks/combat-hooks.mjs module/aster.mjs
git commit -m "refactor(aster): move combat hooks to combat-hooks.mjs"
```

---

### Task 6: `hooks/ui-hooks.mjs` — UI 훅 + 매크로 + HUD

**Files:**
- Create: `module/hooks/ui-hooks.mjs`
- Modify: `module/aster.mjs`

이동 항목(베이스라인): `Hooks.on("getSceneControlButtons",…)`(254), `createItemMacro`(1080), `rollItemMacro`(1142), `ASTER_HUD_FIELDS`(1161), `buildAsterHudPanel`(1170), `onAsterHudAdjust`(1186), `Hooks.on("renderTokenHUD",…)`(1201). 추가로 `ready` 훅 내부 중첩 등록 `Hooks.on("hotbarDrop", …)`·`Hooks.on("updateSetting", …)`를 ui-hooks top-level로 평탄화(스펙 §5.3).

> **주의(아키텍처)**:
> - `rollItemMacro`는 `aster.mjs`의 `init` 훅에서 `game.aster.rollItemMacro = rollItemMacro`로 노출된다 → ui-hooks에서 `export function rollItemMacro` 하고 aster.mjs가 import해 참조.
> - `updateSetting` 훅 본문은 `AsterGMPanel`·`WORLD_VALUES`를 참조 → ui-hooks가 import.
> - `hotbarDrop` 훅은 `createItemMacro`를 호출 → 같은 모듈 내.
> - 중첩 등록을 top-level로 옮겨도 발화는 런타임(ready 이후)이라 동작 동일(스펙 §5.3).

- [ ] **Step 1: 라인·의존 재확인**

Run: `grep -nE 'getSceneControlButtons|createItemMacro|rollItemMacro|ASTER_HUD_FIELDS|buildAsterHudPanel|onAsterHudAdjust|renderTokenHUD|hotbarDrop|updateSetting|AsterGMPanel|WORLD_VALUES' module/aster.mjs`

- [ ] **Step 2: `module/hooks/ui-hooks.mjs` 생성 (부수효과 + rollItemMacro export)**

```js
/**
 * UI 훅 — 씬 컨트롤 버튼, 토큰 HUD(Aster 패널), 핫바 매크로, 설정 동기화.
 * import 시 top-level에서 Hooks.on(...) 등록(부수효과).
 * rollItemMacro는 game.aster 노출용으로 export. aster.mjs에서 분리.
 */
import { AsterGMPanel } from "../apps/gm-panel.mjs";
import { WORLD_VALUES } from "../helpers/world-values.mjs";

const ASTER_HUD_FIELDS = [ /* ↓ aster.mjs에서 이동 */ ];

// ↓ aster.mjs에서 이동(자유 함수): createItemMacro, buildAsterHudPanel, onAsterHudAdjust
// ↓ rollItemMacro 는 export 부착:
export function rollItemMacro(itemUuid) {
  // aster.mjs의 rollItemMacro 본문 그대로
}

// ↓ top-level 훅 등록: getSceneControlButtons, renderTokenHUD,
//   그리고 ready에서 평탄화해 옮긴 hotbarDrop / updateSetting
Hooks.on("hotbarDrop", (bar, data, slot) => createItemMacro(data, slot));
// updateSetting 훅 본문: ready에서 옮김 (WORLD_VALUES·AsterGMPanel 참조)
```
(정확한 import 후보는 `sed` + grep으로 확정. `Macro`/`game`/`ui`/`foundry`는 전역.)

- [ ] **Step 3: `aster.mjs`에서 제거 + 배선**

위 항목 삭제 + `ready` 훅 내부의 `hotbarDrop`/`updateSetting` 중첩 등록 2블록 삭제(ui-hooks로 평탄화됨). `aster.mjs`는 `rollItemMacro`를 `game.aster`에 노출하므로 import 유지:
```js
import "./hooks/ui-hooks.mjs";
import { rollItemMacro } from "./hooks/ui-hooks.mjs";
```
(부수효과 + 명시 import를 한 모듈에서 함께. 두 줄로 분리해도, `import { rollItemMacro } from "./hooks/ui-hooks.mjs";` 한 줄만 둬도 부수효과는 실행된다 — 한 줄로 통합 권장.)

aster.mjs에서 `AsterGMPanel`/`WORLD_VALUES`가 더 이상 안 쓰이면 import 제거(grep 확인 — `init`의 `openGMPanel` 등에서 `AsterGMPanel`을 쓰면 유지).

- [ ] **Step 4: 미사용 import·잔존 참조 확인**

Run: `grep -nE 'rollItemMacro|createItemMacro|buildAsterHudPanel|onAsterHudAdjust|ASTER_HUD_FIELDS' module/aster.mjs`
Expected: `rollItemMacro`만 import 1줄 + `game.aster` 노출 1줄. 나머지 0건.

- [ ] **Step 5: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 6: aster.mjs 라인 수 중간 점검**

Run: `wc -l module/aster.mjs`
Expected: ~140줄 근방(목표). 크게 벗어나면 남은 항목 확인.

- [ ] **Step 7: 커밋 (승인 후)**

```bash
git add module/hooks/ui-hooks.mjs module/aster.mjs
git commit -m "refactor(aster): move UI hooks, macros and HUD to ui-hooks.mjs"
```

---

## Phase 2 — sheet 순수 추출 (정적/순수 메서드, 접근 A)

> Phase 2~4의 모든 추출은 `actor-sheet.mjs` **클래스 메서드 → helpers 자유 함수** 변환이다. 공통 규칙:
> - **얇은 위임자 잔류**: Foundry 액션 바인딩(`actions: { … }`, 베이스라인 28-70)이 가리키는 `static #onX`는 클래스에 **남긴다**. 본문만 자유 함수로 옮기고, 위임자는 컨텍스트(`this.actor` 등)를 수집해 자유 함수에 인자로 넘긴다.
> - **`this` 의존 승격**: `this.actor`/`this.document` 등은 자유 함수의 명시 인자로 올린다(스펙 §6.4). 이것이 접근 A가 감수하는 유일한 본문 변경.
> - **단방향 의존**: helpers/* 는 `actor-sheet.mjs`를 import하지 않는다.

### Task 7: `helpers/sheet-tooltips.mjs` — 툴팁/포맷팅 (순수, 위임자 불필요)

**Files:**
- Create: `module/helpers/sheet-tooltips.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `#formatFormula`(505), `#inventorySummary`(1874), `#isMagicToolInactive`(1891), `#BADSTATUS_KEYS`(1900), `#buildStatusTooltips`(1907), `#TOOLTIP_ICON`(1920), `#buildItemTooltip`(1937), `#buildSpellTooltip`(1969).

> 이들은 액션 바인딩이 아닌 **내부 헬퍼**(static private). 호출부가 `this.#foo()`/`AsterActorSheet.#foo()` → import한 `foo()`로 바뀐다. 위임자 껍데기 불필요.

- [ ] **Step 1: 호출부 전수 조사**

Run: `grep -nE '#formatFormula|#inventorySummary|#isMagicToolInactive|#BADSTATUS_KEYS|#buildStatusTooltips|#TOOLTIP_ICON|#buildItemTooltip|#buildSpellTooltip' module/sheets/actor-sheet.mjs`
각 호출부(정의 외)를 기록 — Step 4에서 `this.#x(`/`AsterActorSheet.#x(` → `x(` 로 바꿀 대상.

- [ ] **Step 2: 각 함수의 인자 의존 파악**

이동 대상이 `this`를 참조하면(예: `this.actor`) 자유 함수 인자로 승격해야 한다.
Run: `sed -n '505,512p;1874,1986p' module/sheets/actor-sheet.mjs | grep -nE 'this\.'`
Expected: 순수 포맷터라면 `this.` 참조가 거의 없다. 있으면 그 변수를 인자로 추가.

- [ ] **Step 3: `module/helpers/sheet-tooltips.mjs` 생성**

```js
/**
 * 시트 툴팁·수식 포맷팅 — 순수 함수. actor-sheet.mjs에서 분리.
 */

const BADSTATUS_KEYS = ["injury", "biginj", "sleepy", "exhaustion", "hungry"];
const TOOLTIP_ICON = { /* ↓ 이동 */ };

export function formatFormula(spell) { /* ↓ #formatFormula 본문 */ }
export function inventorySummary(item) { /* ↓ */ }
export function isMagicToolInactive(item) { /* ↓ */ }
export function buildStatusTooltips() { /* ↓ #buildStatusTooltips 본문 */ }
export function buildItemTooltip(item, locationLabel) { /* ↓ */ }
export function buildSpellTooltip(spell) { /* ↓ */ }
```
(`game.i18n`·`CONFIG` 전역은 import 불필요. `BADSTATUS_EFFECTS` 등 참조 시 import 추가 — grep으로 확정.)

- [ ] **Step 4: `actor-sheet.mjs`에서 정의 제거 + import + 호출부 교체**

상단 import에 추가:
```js
import {
  formatFormula,
  inventorySummary,
  isMagicToolInactive,
  buildStatusTooltips,
  buildItemTooltip,
  buildSpellTooltip,
} from "../helpers/sheet-tooltips.mjs";
```
Step 1의 모든 호출부 `this.#formatFormula(` / `AsterActorSheet.#formatFormula(` → `formatFormula(` 등으로 교체. 8개 정의 블록 삭제.

- [ ] **Step 5: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과. (남은 `this.#xxx` 참조가 있으면 build 실패 → 호출부 누락.)

- [ ] **Step 6: 커밋 (승인 후)**

```bash
git add module/helpers/sheet-tooltips.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract tooltip and format helpers to sheet-tooltips.mjs"
```

---

### Task 8: `helpers/equipment.mjs` — 장비 착용/해제

**Files:**
- Create: `module/helpers/equipment.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `static async equipItem(actor, item)`(2212), `static async unequipItem(item)`(2227). 이미 `(actor, item)` 시그니처라 순수 이동에 가깝다. 호출 위임자: `#onEquipmentEquip`(2194), `#onEquipmentUnequip`(2200)는 클래스에 잔류.

- [ ] **Step 1: 호출부·의존 조사**

Run: `grep -nE 'equipItem|unequipItem' module/sheets/actor-sheet.mjs`
Expected: 정의 2 + `#onEquipmentEquip`/`#onEquipmentUnequip` 내부 호출 `AsterActorSheet.equipItem(...)` 형태. 다른 파일에서의 사용도 확인: `grep -rn 'equipItem\|unequipItem' module/`.

- [ ] **Step 2: `module/helpers/equipment.mjs` 생성**

```js
/**
 * 장비 착용/해제. actor-sheet.mjs에서 분리.
 */
import { EQUIP_SLOT_CONTAINERS, isEquipSlotContainer } from "./inventory-capacity.mjs";

export async function equipItem(actor, item) { /* ↓ 본문 이동 */ }
export async function unequipItem(item) { /* ↓ 본문 이동 */ }
```
(실제 import는 본문 참조로 확정: `sed -n '2212,2230p' module/sheets/actor-sheet.mjs | grep -oE '\b(EQUIP_SLOT_CONTAINERS|isEquipSlotContainer|checkBagCapacity|checkStorageAdd)\b' | sort -u`)

- [ ] **Step 3: `actor-sheet.mjs`에서 제거 + 위임자 배선**

상단 import 추가: `import { equipItem, unequipItem } from "../helpers/equipment.mjs";`
`#onEquipmentEquip`/`#onEquipmentUnequip` 본문의 `AsterActorSheet.equipItem(...)` → `equipItem(...)`. 정의 2블록 삭제.

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋 (승인 후)**

```bash
git add module/helpers/equipment.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract equip/unequip to equipment.mjs"
```

---

### Task 9: `helpers/consumable.mjs` — 소비품 사용

**Files:**
- Create: `module/helpers/consumable.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `#consumableHasHeal`(1987), `static async useConsumable(actor, item)`(2008), `#renderConsumableCard`(2044). 위임자 `#onConsumableUse`(1995)는 잔류.

> **의존**: `useConsumable`이 회복을 처리하면 `applyHealHealth`(health-status.mjs)를 쓸 수 있다 → 확인 후 import.

- [ ] **Step 1: 호출부·의존 조사**

Run: `grep -nE 'consumableHasHeal|useConsumable|renderConsumableCard' module/sheets/actor-sheet.mjs`
Run: `sed -n '1987,2090p' module/sheets/actor-sheet.mjs | grep -oE '\b(applyHealHealth|applyDamageAndStatus|DAMAGE_STATUSES|ChatMessage|foundry|game)\b' | sort -u`

- [ ] **Step 2: `module/helpers/consumable.mjs` 생성**

```js
/**
 * 소비품 사용 — 효과 적용 + 결과 카드. actor-sheet.mjs에서 분리.
 */
// import는 Step 1 grep 결과로 확정 (예: applyHealHealth from "./health-status.mjs")

export function consumableHasHeal(item) { /* ↓ */ }
export async function useConsumable(actor, item) { /* ↓ */ }
export async function renderConsumableCard(actor, results) { /* ↓ #renderConsumableCard 본문 */ }
```

- [ ] **Step 3: `actor-sheet.mjs`에서 제거 + 위임자 배선**

import 추가: `import { useConsumable } from "../helpers/consumable.mjs";` (외부에서 부르는 것만 — `consumableHasHeal`/`renderConsumableCard`가 sheet에서 직접 호출되면 함께 import). `#onConsumableUse` 본문의 `AsterActorSheet.useConsumable(...)` → `useConsumable(...)`. 정의 3블록 삭제.

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋 (승인 후)**

```bash
git add module/helpers/consumable.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract consumable use flow to consumable.mjs"
```

---

### Task 10: `helpers/revive.mjs` — 소생

**Files:**
- Create: `module/helpers/revive.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `static async requestRevive(fallenActor)`(2101), `#renderReviveCard`(2170). 위임자 `#onRevive`(2091) 잔류.

- [ ] **Step 1: 호출부·의존 조사**

Run: `grep -nE 'requestRevive|renderReviveCard|#onRevive' module/sheets/actor-sheet.mjs`
Run: `sed -n '2101,2193p' module/sheets/actor-sheet.mjs | grep -oE '\b(applyHealHealth|ChatMessage|foundry|game|getTargetedTokens)\b' | sort -u`

- [ ] **Step 2: `module/helpers/revive.mjs` 생성**

```js
/**
 * 소생 요청 + 결과 카드. actor-sheet.mjs에서 분리.
 */
// import는 Step 1 grep 결과로 확정

export async function requestRevive(fallenActor) { /* ↓ */ }
export async function renderReviveCard(fallenActor, satietyResults) { /* ↓ #renderReviveCard 본문 */ }
```

- [ ] **Step 3: `actor-sheet.mjs`에서 제거 + 위임자 배선**

import 추가: `import { requestRevive } from "../helpers/revive.mjs";` (`renderReviveCard`는 revive.mjs 내부 전용이면 export 불필요·import 불필요). `#onRevive` 본문 호출부 교체. 정의 2블록 삭제.

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋 (승인 후)**

```bash
git add module/helpers/revive.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract revive flow to revive.mjs"
```

---

## Phase 3 — sheet 컨텍스트 분리

### Task 11: `sheets/sheet-context.mjs` — _prepare* 오케스트레이션 분리

**Files:**
- Create: `module/sheets/sheet-context.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `#buildCombatContext`(151), `#buildReviveContext`(188), `_prepareCharacterData`(198), `_prepareInventory`(216), `_prepareCraft`(318), `#craftWarn`(457), `_prepareItems`(478), `_prepareSpellList`(487), `_prepareRecord`(513).

> **잔류**: `_prepareContext`는 클래스에 남되 **얇은 오케스트레이터**로 축소 — 각 `_prepareX(this, context)` 자유 함수를 순서대로 호출. (`_prepareContext` 본문은 현재 이 메서드들을 호출하는 구조이므로, 호출만 `prepareX(this, context)`로 바꾼다.)
> **시그니처 규약**: 각 함수를 `export function prepareInventory(sheet, context) { … }` 형태로 — 기존 `this`를 `sheet` 인자로 받는다. 본문의 `this.` → `sheet.`로 일괄 치환.

- [ ] **Step 1: `_prepareContext` 본문에서 prepare* 호출 순서 기록**

Run: `grep -nE '_prepareCharacterData|_prepareInventory|_prepareCraft|_prepareItems|_prepareSpellList|_prepareRecord|#buildCombatContext|#buildReviveContext|#craftWarn' module/sheets/actor-sheet.mjs`
`_prepareContext`(베이스라인 위치는 `get title`/`_configureRenderOptions` 부근 → grep으로 확정) 내부에서 이들을 부르는 순서·인자를 기록.

- [ ] **Step 2: 각 함수의 `this` 의존 파악**

각 `_prepareX`는 `this.actor`/`this.document`/`this.#craftWarn` 등을 참조한다. `#craftWarn`은 `_prepareCraft` 내부 전용 → 같은 모듈로 옮기고 비-export 자유 함수 `craftWarn(reasons, dependents)`로. `#buildCombatContext`/`#buildReviveContext`도 `_prepareContext`(또는 character data)에서 호출되면 함께 이동.

- [ ] **Step 3: `module/sheets/sheet-context.mjs` 생성**

```js
/**
 * 시트 _prepareContext 하위 컨텍스트 빌더 — (sheet, context) ⇒ context 변형.
 * actor-sheet.mjs의 _prepareContext가 오케스트레이션. 동작 변경 없음.
 */
// import: craft-tree/craft-cost/inventory-capacity 등 — 기존 actor-sheet import에서 이동분 확정

export function prepareCharacterData(sheet, context) { /* this → sheet */ }
export function prepareInventory(sheet, context) { /* … */ }
export function prepareCraft(sheet, context) { /* #craftWarn → 모듈 내 craftWarn */ }
function craftWarn(reasons, dependents) { /* 비-export 내부 */ }
export function prepareItems(sheet, context) { /* … */ }
export function prepareSpellList(sheet, context) { /* … */ }
export function prepareRecord(sheet, context) { /* … */ }
export function buildCombatContext(sheet) { /* … */ }
export function buildReviveContext(sheet) { /* … */ }
```
> **import 이동 주의**: `CRAFT_TREE`, `prereqMet/sumCost/canAcquire/canRelease`, `validateCraft/craftItem/getCraftRequiresBaseList`, `checkBagCapacity/checkStorageAdd/EQUIP_SLOT_CONTAINERS/isEquipSlotContainer` 중 이동 함수들이 쓰는 것을 sheet-context.mjs로 옮긴다. actor-sheet.mjs에서 더는 안 쓰이는 import는 제거(grep 확인). **양쪽에서 쓰면 양쪽에 import 유지.**

- [ ] **Step 4: `actor-sheet.mjs`의 `_prepareContext`를 오케스트레이터로 축소**

```js
import {
  prepareCharacterData, prepareInventory, prepareCraft,
  prepareItems, prepareSpellList, prepareRecord,
  buildCombatContext, buildReviveContext,
} from "./sheet-context.mjs";
```
`_prepareContext` 본문에서 `this._prepareInventory(context)` → `prepareInventory(this, context)` 등으로 교체(Step 1 순서 보존). 9개 정의 블록 삭제.

- [ ] **Step 5: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 6: 커밋 (승인 후)**

```bash
git add module/sheets/sheet-context.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract context builders to sheet-context.mjs"
```

---

## Phase 4 — sheet 도메인 액션 (위임자 패턴, 고위험)

> Phase 4는 가장 큰 본문들이다. **각 Task 후 Foundry 수동 동작 확인을 강력 권장**(스펙 §9). 위험 분산을 위해 unison(Task 15)은 하위 함수 단위로 더 쪼갤 수 있다.

### Task 12: `helpers/craft-actions.mjs` — 공방 취득/초기화

**Files:**
- Create: `module/helpers/craft-actions.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `#onToggleSkill` 본문(2231), `#onCraftReset` 본문(2319). 위임자 `static #onToggleSkill`/`static #onCraftReset` 껍데기는 잔류.

> **잔류 주의**: 공방 lock/itemOpen/`openCraftDialog`(2347/2352/2361)와 그 하위 모듈 자유 함수들(`_formatCraftCost` 등 2677~2938)은 **이동하지 않는다**(스펙 §6.3).

- [ ] **Step 1: 본문 의존 파악**

Run: `sed -n '2231,2346p' module/sheets/actor-sheet.mjs | grep -oE '\b(prereqMet|sumCost|canAcquire|canRelease|CRAFT_TREE|this\.actor|this\.render)\b' | sort -u`
위임자가 넘길 컨텍스트(주로 `this.actor`, `target.dataset`)와 본문이 쓰는 helpers import를 기록.

- [ ] **Step 2: `module/helpers/craft-actions.mjs` 생성**

```js
/**
 * 공방 스킬 취득/초기화 — 비용 차감 포함. actor-sheet.mjs에서 분리.
 */
import { CRAFT_TREE } from "./craft-tree.mjs";
import { prereqMet, sumCost, canAcquire, canRelease } from "./craft-cost.mjs";

export async function acquireSkill({ actor, skillKey }) { /* ↓ #onToggleSkill 본문, this.actor → actor */ }
export async function resetCraft({ actor }) { /* ↓ #onCraftReset 본문 */ }
```
(인자 형태는 본문이 실제로 쓰는 컨텍스트에 맞춘다 — `skillKey`는 위임자가 `target.dataset`에서 수집.)

- [ ] **Step 3: `actor-sheet.mjs` 위임자로 축소**

```js
import { acquireSkill, resetCraft } from "../helpers/craft-actions.mjs";
```
```js
static async #onToggleSkill(_event, target) {
  const skillKey = target.dataset.skill; // 실제 dataset 키는 Step 1에서 확인
  return acquireSkill({ actor: this.actor, skillKey });
}
static async #onCraftReset(_event, _target) {
  return resetCraft({ actor: this.actor });
}
```
(위임자 시그니처/dataset 키는 기존 본문 첫머리의 컨텍스트 수집 코드를 그대로 위임자에 남기는 방식으로 맞춘다.)

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: Foundry 수동 확인 (권장)**

공방 탭에서 스킬 취득/해제/초기화 시 비용 차감·트리 갱신이 기존과 동일한지 확인.

- [ ] **Step 6: 커밋 (승인 후)**

```bash
git add module/helpers/craft-actions.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract craft acquire/reset to craft-actions.mjs"
```

---

### Task 13: `helpers/spell-cast.mjs` — 주문 시전 흐름

**Files:**
- Create: `module/helpers/spell-cast.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `#onSpellCast` 본문(2393), `#onSpellCastWithExtra` 본문(2416), `#processSpellRoll`(2510). 위임자 `static #onSpellCast`/`static #onSpellCastWithExtra` 잔류.

> **분리 원칙**: 계산(`computeSpellRoll`, `getAbilityTotal`, `isSpecialty` — spell-roll.mjs)과 굴림/UI 흐름을 구분. spell-cast.mjs는 흐름만, 계산은 기존 spell-roll.mjs를 import.

- [ ] **Step 1: 본문 의존·위임자 컨텍스트 파악**

Run: `sed -n '2393,2599p' module/sheets/actor-sheet.mjs | grep -oE '\b(computeSpellRoll|getAbilityTotal|isSpecialty|detectCritFumble|computePenalties|pickDiceDialog|getTargetedTokens|this\.actor|this\.#processSpellRoll)\b' | sort -u`

- [ ] **Step 2: `module/helpers/spell-cast.mjs` 생성**

```js
/**
 * 주문 시전 흐름 — 다이스 선택·굴림·결과 카드. 계산은 spell-roll.mjs에 위임.
 * actor-sheet.mjs에서 분리.
 */
import { computeSpellRoll, getAbilityTotal, isSpecialty } from "./spell-roll.mjs";
import { detectCritFumble, computePenalties } from "./roll-result.mjs";
import { pickDiceDialog } from "./dice-select.mjs";
import { getTargetedTokens } from "./target-select.mjs";
// (실제 필요 import는 Step 1 grep으로 확정)

export async function castSpell({ actor, spell }) { /* ↓ #onSpellCast 본문 */ }
export async function castSpellWithExtra({ actor, spell }) { /* ↓ #onSpellCastWithExtra 본문 */ }
async function processSpellRoll(actor, spell, roll, selectedDice, extraDice, ctx) {
  /* ↓ #processSpellRoll 본문, this.actor → actor */
}
```
(`processSpellRoll`은 두 cast 함수 내부 전용이면 비-export.)

- [ ] **Step 3: `actor-sheet.mjs` 위임자로 축소**

```js
import { castSpell, castSpellWithExtra } from "../helpers/spell-cast.mjs";
```
위임자는 `target.dataset`에서 spell 식별 후 `castSpell({ actor: this.actor, spell })` 호출. (spell 조회 코드는 기존 본문 첫머리를 위임자에 남긴다.) 3개 정의 블록 삭제.

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: Foundry 수동 확인 (권장)**

주문 시전(일반/추가 다이스)이 다이스 선택·크리티컬·페널티 표시까지 동일한지 확인.

- [ ] **Step 6: 커밋 (승인 후)**

```bash
git add module/helpers/spell-cast.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract spell cast flow to spell-cast.mjs"
```

---

### Task 14: `helpers/combat-actions.mjs` — 전투 행동/NPC 행동

**Files:**
- Create: `module/helpers/combat-actions.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `#onCombatAction` 본문(744), `#onNpcActionUse` 본문(930), `#renderNpcActionCard`(1089). 위임자 `static #onCombatAction`/`static #onNpcActionUse` 잔류.

- [ ] **Step 1: 본문 의존·위임자 컨텍스트 파악**

Run: `sed -n '744,1138p' module/sheets/actor-sheet.mjs | grep -oE '\b(applyDamageAndStatus|DAMAGE_STATUSES|detectCritFumble|computePenalties|pickDiceDialog|getTargetedTokens|this\.actor|this\.#renderNpcActionCard)\b' | sort -u`
전투 행동은 combatant·actionKey를 위임자가 수집한다(스펙 §6.1 예시).

- [ ] **Step 2: `module/helpers/combat-actions.mjs` 생성**

```js
/**
 * 전투 행동 / NPC 행동 사용 — 굴림·데미지·결과 카드. actor-sheet.mjs에서 분리.
 */
// import는 Step 1 grep 결과로 확정 (예: applyDamageAndStatus, DAMAGE_STATUSES from "./health-status.mjs")

export async function resolveCombatAction({ actor, combatant, actionKey /* … */ }) {
  /* ↓ #onCombatAction 본문, this.* → 인자 */
}
export async function resolveNpcActionUse({ actor, action /* … */ }) {
  /* ↓ #onNpcActionUse 본문 */
}
async function renderNpcActionCard(action, cost, damageTotal, effectResults, hitResult = null) {
  /* ↓ #renderNpcActionCard 본문 (resolveNpcActionUse 내부 전용이면 비-export) */
}
```

- [ ] **Step 3: `actor-sheet.mjs` 위임자로 축소**

```js
import { resolveCombatAction, resolveNpcActionUse } from "../helpers/combat-actions.mjs";
```
```js
static async #onCombatAction(_event, target) {
  const actionKey = target.dataset.action; // 실제 키는 Step 1 확인
  const combatant = /* 기존 본문의 combatant 수집 코드 */;
  return resolveCombatAction({ actor: this.actor, combatant, actionKey });
}
```
`#onNpcActionUse`도 동일 패턴. 3개 정의 블록 삭제.

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: Foundry 수동 확인 (권장)**

전투 탭 행동(방어/회피/공격 등)과 NPC 행동 사용이 데미지 카드·AP 차감까지 동일한지 확인.

- [ ] **Step 6: 커밋 (승인 후)**

```bash
git add module/helpers/combat-actions.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract combat actions to combat-actions.mjs"
```

---

### Task 15: `helpers/unison.mjs` — 합주 흐름 (최후·최대 ~700줄)

**Files:**
- Create: `module/helpers/unison.mjs`
- Modify: `module/sheets/actor-sheet.mjs`

이동 항목(베이스라인): `#onUnisonAttack` 본문(1139)부터 시작하는 합주 메서드 군 — `_proceedUnisonDice`(1221), `_applyUnisonMainEffect`(1306), `_applyUnisonSubEffect`(1457), `_unisonSubRed`(1501), `_unisonSubGreen`(1544), `_unisonSubYellow`(1592), `_renderUnisonCard`(1623). 위임자 `static #onUnisonAttack` 껍데기만 잔류.

> **분할 권장(위험 분산)**: ~700줄 한 번에 옮기기 부담되면 **하위 함수 단위로 커밋을 쪼갠다** — 예: ① 서브이펙트 색상 함수(`_unisonSubRed/Green/Yellow`) + `_renderUnisonCard` 먼저(말단·피호출), ② `_applyUnisonMainEffect`/`_applyUnisonSubEffect`, ③ `_proceedUnisonDice` + `#onUnisonAttack` 본문(최상위 흐름) 순으로. 의존 방향(말단 먼저)을 지켜 각 단계가 빌드되게 한다.

- [ ] **Step 1: 합주 함수 군의 정확한 라인·상호 호출·외부 의존 파악**

Run: `grep -nE '_proceedUnisonDice|_applyUnisonMainEffect|_applyUnisonSubEffect|_unisonSubRed|_unisonSubGreen|_unisonSubYellow|_renderUnisonCard|#onUnisonAttack|lookupUnisonEffect|getUnisonDescription' module/sheets/actor-sheet.mjs`
Run: `sed -n '1139,1845p' module/sheets/actor-sheet.mjs | grep -oE '\b(lookupUnisonEffect|getUnisonDescription|applyDamageAndStatus|DAMAGE_STATUSES|pickDiceDialog|getTargetedTokens|this\.actor)\b' | sort -u`
상호 호출 그래프를 그려 "말단(아무도 안 부르는 것 없이 남이 부르기만 하는 함수)"부터 옮길 순서를 정한다.

- [ ] **Step 2: `module/helpers/unison.mjs` 생성**

```js
/**
 * 합주(Unison) 공격 흐름 — 다이스 진행·메인/서브 효과·결과 카드.
 * actor-sheet.mjs에서 분리. unison-table.mjs(효과 조회)와 협력.
 */
import { lookupUnisonEffect, getUnisonDescription } from "./unison-table.mjs";
// 그 외 import는 Step 1 grep 결과로 확정 (applyDamageAndStatus 등)

// 최상위 진입: #onUnisonAttack 본문을 자유 함수로
export async function performUnisonAttack({ actor /* … */ }) { /* ↓ */ }

// 하위 함수들 (모듈 내부, 필요 시 export):
async function proceedUnisonDice(/* … */) { /* ↓ */ }
async function applyUnisonMainEffect(/* … */) { /* ↓ */ }
async function applyUnisonSubEffect(/* … */) { /* ↓ */ }
async function unisonSubRed(/* … */) { /* ↓ */ }
async function unisonSubGreen(/* … */) { /* ↓ */ }
async function unisonSubYellow(/* … */) { /* ↓ */ }
async function renderUnisonCard(/* … */) { /* ↓ */ }
```
> `this.actor` 등은 `performUnisonAttack`의 인자로 승격하고, 하위 함수 간에는 필요한 값만 인자로 전달. 메서드 간 `this.#_proceedUnisonDice(...)` 호출은 모듈 내 `proceedUnisonDice(...)` 직접 호출로 바뀐다.

- [ ] **Step 3: `actor-sheet.mjs` 위임자로 축소**

```js
import { performUnisonAttack } from "../helpers/unison.mjs";
```
```js
static async #onUnisonAttack(_event, _target) {
  return performUnisonAttack({ actor: this.actor /* 기존 본문의 컨텍스트 수집분 */ });
}
```
합주 메서드 8개 정의 블록 삭제.

- [ ] **Step 4: 검증 게이트**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 5: Foundry 수동 확인 (필수 — 최대 위험 구간)**

합주 공격: 4색 다이스 진행, 메인/서브 효과(빨강/초록/노랑 분기), 결과 카드 렌더가 기존과 완전히 동일한지 확인.

- [ ] **Step 6: 커밋 (승인 후)**

```bash
git add module/helpers/unison.mjs module/sheets/actor-sheet.mjs
git commit -m "refactor(sheet): extract unison attack flow to unison.mjs"
```
(분할 진행 시: `refactor(sheet): extract unison sub-effects to unison.mjs` → `… main effect …` → `… attack entrypoint …` 등 단계별 커밋.)

---

## Phase 5 — 마감

### Task 16: 최종 검증 + 목표 달성 측정 + 설계/계획 문서 커밋

**Files:**
- Modify: (없음 — 측정·문서 커밋)

- [ ] **Step 1: 전체 게이트 최종 통과**

Run: `npm run build && npm run lint && npm run typecheck && npm run test`
Expected: 전부 통과.

- [ ] **Step 2: 라인 수 목표 달성 확인**

Run: `wc -l module/aster.mjs module/sheets/actor-sheet.mjs`
Expected: `aster.mjs` ~140줄 이하, `actor-sheet.mjs` < ~800줄. 목표 미달이면 잔여 큰 덩어리를 재점검(스펙 §6.3 잔류 항목과 대조).

- [ ] **Step 3: 단방향 의존 확인 (순환 없음)**

Run: `grep -rnE "from ['\"].*actor-sheet" module/helpers/ module/hooks/`
Expected: **0건** — helpers/* 와 hooks/* 는 actor-sheet를 import하지 않는다.
Run: `grep -rnE "from ['\"].*aster\.mjs" module/`
Expected: **0건** — aster.mjs는 진입점이므로 누구도 import하지 않는다(순환 완전 제거 확인).

- [ ] **Step 4: 신규 파일 라인 수 점검 (각 모듈이 적정 크기인지)**

Run: `wc -l module/hooks/*.mjs module/helpers/health-status.mjs module/helpers/theme.mjs module/helpers/sheet-tooltips.mjs module/helpers/equipment.mjs module/helpers/consumable.mjs module/helpers/revive.mjs module/helpers/craft-actions.mjs module/helpers/spell-cast.mjs module/helpers/combat-actions.mjs module/helpers/unison.mjs module/sheets/sheet-context.mjs`
Expected: 각 파일이 단일 책임 크기(대체로 수십~수백 줄, unison.mjs가 최대).

- [ ] **Step 5: 설계 문서 상태 갱신 + 계획 문서 커밋**

`docs/superpowers/specs/2026-06-15-giant-file-decomposition-design.md` 의 상태를 "구현 완료"로 갱신(선택). 본 계획 문서를 커밋한다.
> **gitignore 주의(핸드오프 §7)**: `.gitignore`의 `*.md`가 마크다운을 무시한다. 신규 `.md`는 `git add -f` 필요.

```bash
git add -f docs/superpowers/plans/2026-06-16-giant-file-decomposition.md
git commit -m "docs: add giant-file decomposition implementation plan"
```

- [ ] **Step 6: 완료 처리**

`superpowers:finishing-a-development-branch` 스킬로 병합/PR/정리 옵션을 결정한다.

---

## Self-Review (작성자 점검 결과)

**1. 스펙 커버리지** — 스펙 §4~6의 모든 이동 매핑 항목이 Task로 배정됨:
- aster.mjs §5.2 전 항목 → Task 1~6. (스펙 미기재 보조 함수 `promptFoodReplace`→Task 3, `CRIT_COLORS`/데미지 카드 흐름→Task 4, reduction 헬퍼→Task 1, `onAsterHudAdjust`/`ASTER_HUD_FIELDS`→Task 6 로 클러스터 귀속 명시.)
- actor-sheet §6.2 전 항목 → Task 7~15.
- **스펙 누락 보강**: `item-sheet.mjs`도 `DAMAGE_STATUSES`를 import → Task 1 Step 4에 반영(스펙은 actor-sheet만 언급).

**2. 플레이스홀더 스캔** — 본 계획은 "순수 이동"이라 이동 본문을 의도적으로 라인 범위로 지시한다(맨 위 규약 명시). 이는 표준 플랜의 "TODO/나중에 구현" 플레이스홀더와 다르다 — 신규 코드(import·시그니처·위임자·호출부)는 모두 구체화됨. 라인 범위는 단계 진입 시 grep 재확인을 각 Task Step 1에 강제.

**3. 타입/이름 일관성** — 자유 함수 명명 규약: 위임자 `#onX` → 자유 함수는 동사형(`resolveCombatAction`, `castSpell`, `performUnisonAttack`, `acquireSkill`, `prepareInventory`). 컨텍스트 빌더는 `prepare*`/`build*Context` 유지(actor-sheet의 `_prepareContext`가 호출). `rollItemMacro`만 `game.aster` 노출 계약 때문에 이름 보존(Task 6).

**남은 불확실성(실행 중 grep으로 해소)**: 각 추출 함수의 정확한 인자 시그니처는 본문의 `this.*` 참조에 의존하므로 Task별 Step 1~2의 grep으로 확정한다. 이것이 "순수 이동" 플랜의 의도된 절차이며, 동작 보존(인자 승격만 허용)은 스펙 §2·§6.4가 보증한다.

# STEP 4 — 체크 인터랙션 (취득/해제/거부/초기화)

> 목표: 체크박스로 취득/해제. 선행·비용 위반 시 거부+알람. 전체 초기화. 상시 초과 빨강(STEP3 표시 갱신).
> 선행: STEP2(로직), STEP3(렌더).
> 산출: 커밋 1개. `feat(craft): add skill toggle, prereq block, and reset`
> 도구: Claude Code 골격 → Cursor 알람/마감.

---

## 4-1. 동작 정의 (확정)

- **취득(체크):** `canAcquire`로 선행+비용 판정. 통과 시 `acquired[id]=true` 저장. 실패 시 체크 되돌리고 사유 알람.
- **해제(언체크):** `canRelease`로 판정. 후속 취득돼 있으면(`HAS_DEPENDENTS`) 거부+알람. 통과 시 `acquired[id]` 제거.
- **전체 초기화:** 확인 후 `acquired` 전체 비움.
- **상시 초과 표시:** 자원이 줄어 취득 합계가 초과되면 STEP3의 `overBudget`가 자동 빨강(렌더 시 `checkAffordable` 재계산).

> 결합 규칙: 취득 시점은 거부(못 찍게), 이미 취득된 것이 자원 감소로 초과되면 빨강 표시만(강제 해제 안 함).

---

## 4-2. action 등록

```js
actions: {
  // ...기존...
  toggleSkill: AsterActorSheet.#onToggleSkill,
  craftReset: AsterActorSheet.#onCraftReset,
},
```

---

## 4-3. 취득/해제 핸들러

```js
import { canAcquire, canRelease } from "../helpers/craft-cost.mjs";

static async #onToggleSkill(event, target) {
  const skillId = target.dataset.skillId;
  const acquired = foundry.utils.deepClone(this.actor.system.craft?.acquired ?? {});
  const isAcquired = acquired[skillId] === true;

  const resources = this.#craftResources();

  if (!isAcquired) {
    // 취득 시도
    const r = canAcquire(skillId, acquired, resources);
    if (!r.ok) {
      target.checked = false; // 체크 되돌림
      this.#craftWarn(r.reasons);
      return;
    }
    acquired[skillId] = true;
  } else {
    // 해제 시도
    const r = canRelease(skillId, acquired);
    if (!r.ok) {
      target.checked = true; // 체크 유지
      this.#craftWarn(r.reasons, r.dependents);
      return;
    }
    delete acquired[skillId];
  }
  await this.actor.update({ "system.craft.acquired": acquired });
}

static async #onCraftReset(event, target) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ASTER.craft.reset") },
    content: game.i18n.localize("ASTER.craft.resetConfirm"),
  }).catch(() => false);
  if (!ok) return;
  await this.actor.update({ "system.craft.acquired": {} });
}

// 자원 수집 (STEP3와 동일)
#craftResources() {
  const a = this.actor.system.aster ?? {};
  return {
    material: this.actor.system.material ?? 0,
    aster: {
      red: a.red?.value ?? 0, blue: a.blue?.value ?? 0,
      green: a.green?.value ?? 0, yellow: a.yellow?.value ?? 0,
      white: a.white?.value ?? 0,
    },
  };
}

// 사유 → 알람 메시지
#craftWarn(reasons, dependents) {
  const map = {
    PREREQ: "ASTER.craft.warn.PREREQ",
    MATERIAL_SHORT: "ASTER.craft.warn.MATERIAL_SHORT",
    ASTER_TOTAL_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_RED_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_BLUE_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_GREEN_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_YELLOW_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    HAS_DEPENDENTS: "ASTER.craft.warn.HAS_DEPENDENTS",
    ALREADY: "ASTER.craft.warn.ALREADY",
  };
  const key = map[reasons[0]] ?? "ASTER.craft.warn.GENERIC";
  let msg = game.i18n.localize(key);
  if (reasons[0] === "HAS_DEPENDENTS" && dependents?.length) {
    msg += " (" + dependents.join(", ") + ")";
  }
  ui.notifications.warn(msg);
}
```

> `update` 후 시트가 재렌더되며 STEP3의 잠금/초록/초과 표시가 최신 상태로 갱신된다.

---

## 4-4. 언어 키

```json
{
  "ASTER.craft.over": "취득 비용이 보유 자원을 초과했습니다",
  "ASTER.craft.reset": "공방 초기화",
  "ASTER.craft.resetConfirm": "취득한 모든 공방 스킬을 초기화할까요?",
  "ASTER.craft.warn.PREREQ": "선행 스킬을 먼저 취득해야 합니다.",
  "ASTER.craft.warn.MATERIAL_SHORT": "마테리얼이 부족합니다.",
  "ASTER.craft.warn.ASTER_SHORT": "아스테르가 부족합니다.",
  "ASTER.craft.warn.HAS_DEPENDENTS": "후속 스킬이 취득되어 있어 해제할 수 없습니다.",
  "ASTER.craft.warn.ALREADY": "이미 취득한 스킬입니다.",
  "ASTER.craft.warn.GENERIC": "취득할 수 없습니다."
}
```

---

## 4-5. 사역마 배타 취득(선택) — STEP1 확인사항 반영

사역마가 "택1"이라면 `#onToggleSkill`에 분기 추가:

```js
// 사역마 카테고리이고 이미 다른 사역마를 취득 중이면 거부
const node = NODE_MAP[skillId];
if (node?.category === "familiar" && !isAcquired) {
  const hasOther = CRAFT_TREE.nodes.some(
    (n) => n.category === "familiar" && n.id !== skillId && acquired[n.id],
  );
  if (hasOther) {
    target.checked = false;
    this.#craftWarn(["FAMILIAR_ONE"]);
    return;
  }
}
```

> STEP1에서 사역마가 독립 취득이면 이 블록 생략.

---

## 4-6. 검증

```bash
npm run lint && npm run typecheck && npm run build
# Foundry:
# 1) 선행 없는 노드 체크 → 취득(초록), 후속 노드 잠금 해제
# 2) 선행 미취득 노드 체크 시도 → disabled라 클릭 불가 (또는 거부 알람)
# 3) 자원 부족 상태로 취득 → 거부 + 알람
# 4) 후속 취득된 선행 해제 시도 → 거부 + 알람
# 5) 전체 초기화 → 확인 후 모두 해제
# 6) 자원 줄여서 합계 초과 만들기 → 상단 빨강 표시(강제 해제는 안 함)
# 7) 새로고침 → 취득 상태 유지
```

## 완료 기준

- 취득/해제/거부 알람/전체 초기화 동작.
- 선행 해제 거부, 비용 초과 취득 거부.
- 상시 초과 빨강 표시(취득 시점 거부와 같은 함수 공유).
- 영속 저장.

## 사람 확인 항목

- [ ] 사역마 택1 여부(STEP1과 연동).
- [ ] 잠금 노드를 disabled로 아예 못 누르게(기본) vs 누르면 알람.

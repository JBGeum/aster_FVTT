# Aster 그리드 인벤토리 — 구현 문서 세트 (INDEX)

> Foundry VTT V13 / ApplicationV2 기준. Claude Code에 STEP 단위로 넘겨 구현.
> 각 STEP = 한 묶음의 커밋 단위. 순서대로 진행.

---

## 한 줄 정의

가방(bag) 아이템이 격자를 가지며, 소지한 아이템(consumable/equipment)을 **빈 칸 클릭 → 선택**으로 가방 격자에 배치한다.
배치 좌표는 영속 저장. 겹침 허용. 회전 미지원. 가방 용량은 **면적+차원 경고만**. 창고는 **개수 제한**(표시/차단).

---

## 핵심 아키텍처 — 참조 방식 (Foundry 친화)

Foundry는 "아이템 안의 아이템" 중첩을 기본 지원하지 않으므로, **물리적 중첩이 아닌 논리적 소속(참조)** 으로 구현한다.

- 모든 아이템은 평소처럼 액터가 소유한다.
- 각 배치 아이템은 `system.container`(소속 가방의 id)를 가진다.
  - `container === 가방 id` → 그 가방 격자 안에 있음
  - `container === ""` (빈 값) → **창고**(시트에 격자로 그리지 않음, 데이터로만 존재)
- 각 배치 아이템은 `system.grid = {x, y}` (소속 가방 격자 내 좌상단 시작점)를 가진다.
- 가방(bag) 아이템은 `system.grid = {cols, rows}` (자기 격자 크기)를 가진다. **가방마다 크기 다름.**

---

## 확정 명세 (모든 결정 완료)

| 항목               | 결정                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| 중첩 구조          | 참조 방식. `container`로 소속 표현                                    |
| 배치 대상 타입     | `consumable`, `equipment` 만 (size 보유)                              |
| 비배치 타입        | `food`, `feature`, `spell` (size 없음). food는 별도 1개 슬롯          |
| 배치 방식          | **클릭-선택** (빈 칸 클릭 → 소지 아이템 목록에서 선택). 드래그 미채택 |
| 좌표 저장          | 영속. `system.grid={x,y}`, 0-base, 소속 가방 기준                     |
| 겹침               | 허용. 충돌 판정 없음. 사람이 보고 재배치                              |
| 회전               | 미지원. size[0]=가로, size[1]=세로 고정                               |
| 가방 소지 제한     | bag 타입 **1개만** 소지                                               |
| food 소지 제한     | food 타입 **1개만** 소지 (bag과 같은 규칙, 별도 카운트)               |
| 가방 용량 경고     | (A) 빈 칸 < 아이템 면적 OR (B) 아이템 변 > 격자 변. 막지 않고 경고만  |
| 창고(container="") | **개수 제한**(면적 아님). 초과 허용하되 추가 차단, 꺼내기만 가능      |
| 창고 용량값        | 임시 수동 입력(액터 스키마). **추후 craft 스킬트리와 연동 예정**      |

---

## STEP 구성

| STEP | 문서                      | 내용                                                            | 도구                 |
| ---- | ------------------------- | --------------------------------------------------------------- | -------------------- |
| 1    | `STEP1_data_model.md`     | 참조 스키마(`container`,`grid`), 가방/창고 필드, 1개 소지 제약  | Claude Code          |
| 2    | `STEP2_capacity_logic.md` | 가방 면적/차원 + 창고 개수 판정 순수 함수 + Vitest              | Claude Code          |
| 3    | `STEP3_static_render.md`  | 가방 격자 렌더 + food 슬롯 + 창고 카운터 (배치 인터랙션 없음)   | Claude Code → Cursor |
| 4    | `STEP4_click_place.md`    | 빈 칸 클릭 → 선택 배치, 꺼내기, 경고/차단                       | Claude Code → Cursor |
| 5    | `STEP5_polish_extend.md`  | 가방 교체 시 창고 이관, 다중 영역(EQUIPMENT/BASKET/COMPA), 시각 | Cursor               |

### 진행 원칙

- 한 번에 한 STEP. 완료 = `lint`/`typecheck`/`build`(STEP2는 `test`) 통과 후 커밋.
- **선행:** `MIGRATION_V13.md` TASK 3(ActorSheetV2) 완료 후 진행. 이 인벤토리는 `actor-sheet-parts-design.md`의 `inventory` part에 연결.
- 클릭-선택이라 드래그 픽셀 추적이 없어 STEP4 난이도가 낮음. action 시스템으로 처리.

### 커밋 메시지 예시

```
feat(inventory): add container reference schema and bag/storage fields
feat(inventory): add bag capacity and storage count checks with tests
feat(inventory): render bag grid, food slot, storage counter
feat(inventory): click-to-place items into bag grid
```

---

## ⚠️ 추후 연동 표시 (지금 구현 안 함)

- **창고 용량 → craft 스킬트리:** 현재는 액터 스키마의 수동 입력값. craft 탭(스킬트리) 구현 시 스킬 기반 파생값으로 대체 예정. STEP1에서 해당 필드에 주석으로 명시.
- **COMPA(사역마):** 이미지 2의 4영역 중 companion. 아이템 격자와 성격이 다를 수 있음 → STEP5에서 별도 검토.
- **다중 영역(EQUIPMENT/BASKET):** 기본은 단일 가방 격자. 영역 분리는 STEP5.

---

## 의존 관계

```
MIGRATION_V13 (TASK 3) → STEP1 → STEP2 (독립 테스트 가능)
                            │         │
                            ▼         ▼
                         STEP3 ────► STEP4 (STEP2 로직 사용)
                            │
                            ▼
                         STEP5 (+ craft 연동은 별도 논의)
```

# Handoff — 거대 파일 구조 분해 작업

> 다른 PC/세션에서 이 작업을 이어받기 위한 인수인계 문서. 콜드 스타트 가정.

- **작성일**: 2026-06-15
- **브랜치**: `develop` (작업 시작 시 여기서 분기 예정)
- **관련 스펙**: [`2026-06-15-giant-file-decomposition-design.md`](./2026-06-15-giant-file-decomposition-design.md) ← **먼저 정독**

## 1. 지금 어디까지 왔나

brainstorming 스킬 플로우 기준 진행 상황:

- [x] 1. 프로젝트 컨텍스트 탐색
- [x] 2. 명확화 질문 (4건 답변 완료 — 아래 §3)
- [x] 3. 2~3 접근법 제안 (A+C 하이브리드 채택)
- [x] 4. 설계 제시 및 승인 (섹션 1~4 전부 승인)
- [x] 5. 설계 문서 작성 + self-review + 커밋
- [ ] **6. 구현 계획 작성 — `writing-plans` 스킬 호출 (← 다음 할 일)**
- [ ] 7. 구현 (Phase 0~5)

## 2. 다음에 할 일 (재개 지점)

1. 스펙 문서를 정독한다.
2. **`writing-plans` 스킬을 호출**해 스펙을 Phase별 상세 구현 계획으로 전개한다. (brainstorming의 종착점은 writing-plans 호출이며, 다른 구현 스킬을 부르지 않는다.)
3. 계획 승인 후 Phase 0부터 구현. 추출 1건 = 커밋 1건, 단계마다 검증 게이트 통과.

## 3. 확정된 의사결정 (질문 답변)

작업 범위를 좁히며 사용자가 내린 결정 — **재논의 불필요, 그대로 따른다**:

1. **작업 순서**: 구조 리팩토링을 JS 상태에서 먼저 끝내고, 안정화 후 TS 전환은 별도로. (TS는 이번 범위 밖)
2. **1순위 대상**: 거대 파일 분해 (`actor-sheet.mjs` 2,938줄, `aster.mjs` 1,223줄).
3. **검증 전략**: 순수 이동 원칙 준수 — 동작 변경 없이 옮기기만, 작은 커밋 단위로 검증.
4. **sheet 분해 방식**: A+C 하이브리드 — aster.mjs는 기계적 이동(C), actor-sheet은 도메인 자유 함수 추출 + 얇은 위임자(A).

## 4. 핵심 컨텍스트 (콜드 스타트용 요약)

- 소스 ~7,603줄, 두 파일이 55% 차지. 도구 체인은 이미 TS 준비 완료(Vite/tsc/typescript-eslint/fvtt-types), `allowJs:true`, `checkJs:false`.
- `actor-sheet.mjs`의 최대 덩어리는 **합주(Unison) 로직 ~700줄**(라인 1139~1840). 가장 마지막(Phase 4-15)에 추출.
- `aster.mjs`의 **데미지/회복/상태이상 함수 ~400줄**은 이미 `export`라 순수 이동 가능. actor-sheet이 이 함수들을 `aster.mjs`에서 import 중이므로 이동 시 import 경로 교체 필요.
- 목표 디렉토리 구조·이동 매핑·라인 번호는 스펙 §4~6 표 참조.

## 5. 검증 명령

각 추출 커밋 후 게이트:

```bash
npm run build && npm run lint && npm run typecheck && npm run test
```

**한계**: `checkJs:false`라 typecheck는 로직 회귀를 못 잡는다. build/lint는 문법·import 오류만. **실질 안전망 = 작은 커밋 + Foundry 수동 동작 확인.** Foundry 심링크는 `npm run link:foundry`.

## 6. 커밋 규칙 (프로젝트/사용자 메모리)

- **자동 커밋 금지** — 수동, 또는 명시 요청 시에만.
- Conventional Commits, **영어**, **co-author 없음**, **명세 넘버링 없음**.
- 예: `refactor(aster): move health/status logic to health-status.mjs`
- 리팩토링 커밋과 docs 커밋은 분리.

## 7. ⚠️ gitignore 주의

`.gitignore` 35번 줄 `*.md` 가 **모든 마크다운을 무시**한다. 이 스펙/handoff 문서는 `git add -f` 로 강제 추가해 커밋했다.

- 다른 PC에서 `git pull` 하면 두 문서는 정상적으로 받아진다(이미 추적됨 → 이후 편집은 `git status`에 정상 표시).
- **새 마크다운 문서**(예: writing-plans가 만들 구현 계획 `.md`)를 커밋하려면 `git add -f <file>` 가 다시 필요하다.

## 8. 성공 기준 (스펙 §10 재게시)

- `actor-sheet.mjs` < ~800줄, `aster.mjs` ~120줄
- 모든 단계 `build/lint/typecheck/test` 통과
- 동작 회귀 없음 (Foundry 수동 확인)
- helpers/* 가 sheet를 import하지 않는 단방향 의존 유지

# 개발 환경 셋업 기록 (개인용 참조)

> 작성일: 2026-05-26
> 목적: Aster FVTT 시스템을 V13/V14 대응으로 새로 빌드할 수 있는 개발 환경을 구축하면서
> 도입한 도구들과 V13 호환 패치 내역을 정리. 익숙하지 않은 개념을 다시 들춰볼 때 보는 노트.

---

## 0. 한 줄 요약

> **Gulp + sass 단일 빌드 → Vite + TS + ESLint + Prettier + Husky + Vitest 종합 스택으로 전환**하면서,
> Foundry V10 코드의 글로벌 API 호출을 V13 네임스페이스(`foundry.utils.*`, `foundry.applications.handlebars.*`)로 1차 마이그레이션.

---

## 1. 도입한 도구 카탈로그

각 도구가 "무엇을 / 왜 / 어떻게" 쓰는지 정리.

### 1.1 빌드 & 런타임

#### Node.js 20+ (실제로는 v22)

- **무엇**: JavaScript 런타임. npm 패키지 매니저가 동작하는 기반.
- **왜**: Vite 8 / Vitest 4 / Husky 9 등 모든 도구가 Node 20 이상 요구.
- **메모**: `.nvmrc`에 `22`로 명시. `nvm use`로 자동 전환 가능 (nvm-windows 설치 시).

#### npm

- 기본 패키지 매니저. `yarn`/`pnpm`도 가능하지만 표준이 가장 마찰이 적음.
- `npm ci` (clean install): `package-lock.json`만 보고 정확히 재설치. CI/CD용.
- `npm install`: lock 갱신 가능. 평소 개발용.

#### Vite 8 (`vite`, `vite-plugin-static-copy`)

- **무엇**: 번들러 + 개발 서버. esbuild/Rollup 기반.
- **왜 Gulp 대신**:
  - ES module 네이티브 지원 (Foundry V13의 esmodules 방식과 잘 맞음)
  - HMR(Hot Module Replacement) → 코드 수정 즉시 반영
  - SCSS/TS/CSS 처리 빌트인 → 별도 플러그인 체인 불필요
  - dnd5e, pf2e 등 주요 V13 시스템이 모두 Vite 채택
- **이 프로젝트에서의 역할**:
  - `module/aster.mjs`를 진입점 라이브러리로 컴파일 → `dist/module/aster.mjs`
  - 진입점이 import한 `scss/aster.scss` → `dist/aster.css`로 추출
  - `vite-plugin-static-copy`가 `system.json`, `templates/`, `lang/`, `lib/` 등을 `dist/`로 복사
- **핵심 옵션**:
  - `build.lib` : 라이브러리 빌드 모드 (HTML entry 대신 esm export)
  - `build.cssCodeSplit: false` : CSS를 하나로 합침
  - `rollupOptions.output.assetFileNames` : 추출된 CSS를 `aster.css`로 고정

#### sass

- SCSS → CSS 컴파일러. Vite가 내부적으로 호출.
- **참고**: 현재 `@import`는 Dart Sass 3.0에서 제거 예정. 추후 `@use`/`@forward`로 마이그레이션 필요.

### 1.2 언어

#### TypeScript 6 (`typescript`, `tsx`)

- **무엇**: JS의 상위 집합. 타입 시스템 + 컴파일러(`tsc`).
- **왜 도입**: V13의 API들이 클래스/객체 형태로 잘 정리되어 있어 타입 도움이 큼. 잘못된 호출을 IDE/CI에서 미리 잡을 수 있음.
- **점진 도입 전략**:
  - `tsconfig.json`에 `"allowJs": true`로 `.mjs` 그대로 인식
  - `"checkJs": false`로 시작 → 안정되면 `true`로 올려서 JS도 타입 체크
  - 새 코드는 `.ts`/`.mts`로 작성, 기존은 그대로 두고 필요할 때만 변환
- **`tsx`**: Node로 `.ts`/`.mts` 파일을 직접 실행. `tools/link-to-foundry.mts` 같은 스크립트용.
  - 비교: `ts-node`(레거시), `bun run`(다른 런타임). `tsx`는 esbuild 기반이라 빠르고 가벼움.

#### `fvtt-types`

- **무엇**: Foundry VTT 전체 API의 TypeScript 타입 정의.
- **출처**: `github:League-of-Foundry-Developers/foundry-vtt-types#main` (GitHub에서 직접 설치)
- **왜 GitHub에서**: V13 지원이 활발한 main 브랜치를 추적하기 위함. npm 정식 릴리스는 베타 상태.
- **사용**: `tsconfig.json`의 `"types": ["fvtt-types"]`만 하면 자동으로 글로벌 `game`, `CONFIG`, `Hooks`, `foundry.*` 전부 인식.

### 1.3 코드 품질

#### ESLint 10 (`eslint`, `@eslint/js`, `typescript-eslint`)

- **무엇**: 코드 정적 분석 도구. 버그 패턴, 안티 패턴, 스타일 위반 검출.
- **flat config**: 9.x부터 도입된 새 설정 형식 (`eslint.config.js`). 기존 `.eslintrc.*`보다 명시적이고 모듈러.
- **이 프로젝트의 룰**:
  - `js.configs.recommended`: 기본 권장 규칙
  - `tseslint.configs.recommended` (`.ts` 파일만): TS 권장 규칙
  - `no-unused-vars`: `_` 접두사는 허용 (의도적 미사용 표시 컨벤션)
  - `eqeqeq: "smart"`: `==` 금지 (null 체크 같은 예외만 허용)
  - `prefer-const`, `no-var`: 변수 선언 모범 사례
  - Foundry 글로벌(`game`, `Hooks` 등) `readonly`로 등록 → `no-undef` 미발생
- **학습 팁**: 규칙 이름이 곧 검색어. `prefer-const` → eslint.org에서 룰 설명 + 예제 확인.

#### Prettier 3.8 (`prettier`, `eslint-config-prettier`)

- **무엇**: 코드 포매터. 들여쓰기/따옴표/줄바꿈 등 "스타일" 결정.
- **왜 ESLint와 분리**: ESLint는 "버그 잡기", Prettier는 "스타일 통일". 역할 분담.
- **`eslint-config-prettier`**: ESLint의 스타일 관련 규칙을 모두 비활성화 → Prettier와 충돌 방지.
- **설정 핵심** (`.prettierrc.json`):
  - `printWidth: 100`, `tabWidth: 2`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`
  - HTML/HBS만 `printWidth: 120` (Handlebars 표현식이 길어지는 경향)

#### EditorConfig (`.editorconfig`)

- **무엇**: 에디터별 기본 설정(들여쓰기, 줄끝 문자 등)을 통일.
- **왜**: Prettier가 못 잡는 영역(예: SCSS 외 파일, 에디터가 새 파일 만들 때 기본값) 커버.
- **WebStorm, VS Code 등 거의 모든 IDE가 기본 지원** (별도 플러그인 없음).

### 1.4 Git 워크플로

#### Husky 9

- **무엇**: Git 훅(commit 직전/직후 등 특정 시점에 스크립트 자동 실행)을 관리.
- **9.x부터의 변화**: `husky install` 명령 폐지. `package.json`의 `"prepare": "husky"`만 있으면 `npm install` 시 자동 설정.
- **이 프로젝트 훅**:
  - `.husky/pre-commit` → `npx lint-staged`
  - `.husky/commit-msg` → `npx commitlint --edit "$1"`

#### lint-staged 17

- **무엇**: Git 스테이지(`git add` 된)된 파일에만 명령 실행.
- **왜**: 전체 코드베이스에 매번 lint/format을 돌리면 느림. **변경한 파일만** 검사해 속도 확보.
- **설정**: `package.json`의 `lint-staged` 키.
  ```json
  {
    "*.{js,mjs,ts,mts}": ["eslint --fix", "prettier --write"],
    "*.{json,md,scss,html,hbs}": ["prettier --write"]
  }
  ```

#### Commitlint 21 (`@commitlint/cli`, `@commitlint/config-conventional`)

- **무엇**: 커밋 메시지 형식 검증.
- **규칙**: [Conventional Commits](https://www.conventionalcommits.org/ko/)

  ```
  <type>(<scope>): <subject>

  <body>

  <footer>
  ```

- **허용 type**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- **왜 도입**:
  - 커밋 로그가 곧 변경 이력. `git log --oneline` 만으로 무엇이 바뀌었는지 파악
  - CHANGELOG 자동 생성 도구(standard-version, semantic-release)와 호환
  - 팀 합류 시 컨벤션 학습 효과
- **예시**:
  - `feat(actor): add craft tab to character sheet`
  - `fix(roll): respect DC=0 as opposed roll`
  - `chore(deps): bump vite to 8.0.15`
  - `refactor(actor): extract ability total computation`

### 1.5 테스트

#### Vitest 4

- **무엇**: Vite 기반 테스트 러너. Jest API 호환.
- **왜 Jest 대신**:
  - Vite 설정/플러그인을 그대로 재사용
  - ESM 네이티브 (Jest는 ESM 지원이 여전히 까다로움)
  - TS 즉시 실행
- **사용 예** (`test/sample.test.ts`):
  ```ts
  import { describe, expect, it } from "vitest";
  describe("...", () => {
    it("...", () => { expect(...).toBe(...); });
  });
  ```
- **Foundry 객체 테스트 전략**: 런타임 객체(`Roll`, `ChatMessage`)는 mock 하기 어려우므로, 로직을 **순수 함수**로 분리한 뒤 그 함수만 단위 테스트. 예: `formula = isFavColor ? "2d6+1" : "2d6"` 결정 로직.

---

## 2. 파일/구조 변화 비교

### Before (V10 시절)

```
package.json        # gulp + sass 5개 패키지만
gulpfile.js         # SCSS 컴파일만
system.json         # compatibility: { minimum: 10, maximum: 10 }
module/             # 글로벌 mergeObject, DEFAULT_TOKEN 등 사용
scss/aster.css      # gulp 빌드 결과물이 git에 포함됨
css/aster.css       # 그것도 또 한 번 복사
```

### After (V13 대응)

```
package.json        # devDependencies 18개 + 풍부한 scripts
vite.config.ts      # 모든 빌드 정의
tsconfig.json       # TS 점진 도입
eslint.config.js    # flat config
.prettierrc.json
.editorconfig
commitlint.config.js
vitest.config.ts
.husky/
  pre-commit
  commit-msg
tools/
  link-to-foundry.mts   # tsx로 실행되는 배포 스크립트
test/
  sample.test.ts
dist/                # Vite 빌드 산출물 (gitignore, Foundry가 이쪽을 봄)
  module/aster.mjs
  aster.css
  system.json
  template.json
  templates/, lang/, lib/
```

### 삭제된 것

- `gulpfile.js` (Vite로 대체)
- `package-lock.json` (재생성됨)
- `scss/aster.css`, `scss/aster.css.map`, `css/aster.css` (모두 빌드 결과물 → gitignore)

---

## 3. V13 코드 패치 매핑표

| 위치                                | Before (V10)                         | After (V13)                                                                 | 이유                             |
| ----------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- | -------------------------------- |
| `aster.mjs`                         | `Actors.unregisterSheet(...)`        | `foundry.documents.collections.Actors.unregisterSheet(...)` (fallback 포함) | 컬렉션 네임스페이스 정리         |
| `aster.mjs`                         | `import` 없음                        | `import "../scss/aster.scss"`                                               | Vite가 CSS 추출하도록            |
| `actor-sheet.mjs`, `item-sheet.mjs` | `mergeObject(...)`                   | `foundry.utils.mergeObject(...)`                                            | 글로벌 헬퍼 제거                 |
| `actor-sheet.mjs`                   | `DEFAULT_TOKEN`                      | `CONST.DEFAULT_TOKEN`                                                       | 동일                             |
| `actor-sheet.mjs`                   | `duplicate(...)`                     | `foundry.utils.duplicate(...)`                                              | 동일                             |
| `actor.mjs`                         | `renderTemplate(...)`                | `foundry.applications.handlebars.renderTemplate(...)`                       | applications 네임스페이스로 이동 |
| `templates.mjs`                     | `loadTemplates(...)`                 | `foundry.applications.handlebars.loadTemplates(...)`                        | 동일                             |
| `roll.mjs`, `actor.mjs`             | `roll.evaluate({async: true})`       | `roll.evaluate()`                                                           | async 옵션 제거                  |
| `actor.mjs`                         | `ChatMessage.create({..., type: 3})` | `style: CONST.CHAT_MESSAGE_STYLES.OTHER`                                    | type → style 필드                |
| `effects.mjs`                       | `{label: "...", icon: "..."}`        | `{name: "...", img: "..."}`                                                 | ActiveEffect 필드 변경 (V11+)    |
| `system.json`                       | `compatibility.maximum: 10`          | `{ minimum: "13", verified: "13", maximum: "14" }`                          | V13 타겟                         |
| `system.json`                       | `gridDistance: 5, gridUnits: "ft"`   | `grid: { distance: 5, units: "ft" }`                                        | 그리드 설정 객체화 (V10+)        |

---

## 4. 명령어 치트시트

### 자주 쓰는 것 (외워두면 좋음)

```powershell
npm run dev          # 백그라운드 자동 재빌드 (개발 중 항상 켜둠)
npm run build        # 한 번만 빌드
npm run lint:fix     # 자동 수정 가능한 린트 이슈 처리
npm run format       # 전체 파일 Prettier 적용
npm test             # 1회 실행
npm run test:watch   # 파일 변경 시 자동 재실행
```

### 가끔 쓰는 것

```powershell
npm run typecheck    # tsc --noEmit
npm run format:check # Prettier 검증만 (CI용)
npm run link:foundry # Foundry Data/systems/aster 심볼릭 링크 갱신
```

### 트러블슈팅

```powershell
# 의존성이 꼬였을 때
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json
npm install

# 빌드 산출물 정리
Remove-Item dist -Recurse -Force
npm run build

# Husky가 안 걸릴 때 (Git 훅 재설치)
npm run prepare
```

### Git + Commitlint

```powershell
# 커밋
git add .
git commit -m "feat(sheet): add craft tab"

# 커밋 메시지가 형식에 안 맞으면 commit-msg 훅에서 거부됨.
# 다시 수정해서 commit:
git commit -m "feat(sheet): add craft tab to character sheet"

# 마지막 커밋 메시지만 고치고 싶을 때 (push 전):
git commit --amend
```

---

## 5. 개념 노트 (학습용)

### 5.1 ES Module vs CommonJS

- `package.json`에 `"type": "module"` → 기본이 ESM. `.mjs`/`.js`는 ESM, `.cjs`는 CommonJS.
- `import/export` vs `require/module.exports`.
- Foundry V13은 `esmodules` 필드로 ESM 진입점 받음.
- **Top-level await** 가능 (ESM의 장점).

### 5.2 라이브러리 모드(Library Mode)

- 일반 Vite는 웹 앱(HTML entry)을 빌드.
- 라이브러리 모드는 **import 가능한 모듈**을 빌드 → Foundry 같은 호스트가 그걸 import.
- 출력 포맷 선택: `es`(ESM), `cjs`, `umd`, `iife`. 우린 `es`만 필요.

### 5.3 심볼릭 링크 vs 정션(Junction)

- **Symlink**: 파일이든 폴더든 가리킬 수 있음. Windows에서 디렉터리 symlink는 관리자 권한 필요.
- **Junction** (Windows): 폴더만 가리킴. 일반 권한으로 가능. `mklink /J` 또는 `fs.symlink(path, 'junction')`.
- 우리 `link-to-foundry.mts`는 Windows에서 자동으로 junction 사용 → 권한 문제 회피.

### 5.4 ApplicationV2 (3단계에서 본격 도입)

- V12+의 새 UI 프레임워크. `ActorSheet` 같은 V1 클래스는 V13에서 deprecated.
- 차이:
  - **Mixin 기반** (`HandlebarsApplicationMixin` 등 조합)
  - **Parts** 개념: 시트를 작은 partial들로 쪼개 부분 갱신
  - **Form 핸들링** 통합
- 지금은 deprecation warning만 뜨고 동작하므로, 3단계로 미룸.

### 5.5 DataModel (3단계에서 본격 도입)

- `template.json`의 자유 JSON 스키마 → **클래스로 정의된 데이터 모델**.
- 장점: 타입 안정성, 검증, 마이그레이션 메서드, IDE 자동완성.
- 패턴:
  ```ts
  class CharacterData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
      const fields = foundry.data.fields;
      return {
        health: new fields.SchemaField({
          value: new fields.NumberField({ initial: 20, min: 0 }),
          max: new fields.NumberField({ initial: 20 }),
        }),
        // ...
      };
    }
    prepareDerivedData() {
      /* 계산식 */
    }
  }
  ```

---

## 6. 트러블슈팅 메모 (셋업 중 만난 것)

### 6.1 `@eslint/js@^10.4.0` 설치 실패

- 원인: ESLint 본 패키지는 10.4.0이지만 `@eslint/js`는 별도 버저닝(10.0.1).
- 해결: `^10.0.1`로 명시.

### 6.2 `baseUrl` deprecation in TS 6

- 원인: TypeScript 6에서 `baseUrl` 옵션이 deprecated.
- 해결: `paths`에서 상대 경로(`./module/*`)를 직접 사용. `baseUrl` 제거.

### 6.3 vite-plugin-static-copy가 폴더명을 중복시킴

- 원인: `src: "templates/**/*"` + `dest: "templates"` → `dist/templates/templates/...`로 복사됨.
- 해결: `src: "templates"`(디렉터리 통째로) + `dest: "."`로 변경.

### 6.4 Sass `api: "modern-compiler"` 타입 에러

- 원인: Vite 8 + sass 1.100에서 modern-compiler가 기본값. 명시하면 타입 매치 안 됨.
- 해결: 옵션 자체를 제거.

### 6.5 lint-staged Node 버전 경고

- 원인: lint-staged 17.0.5는 Node 22.22.1+ 권장. 현재 22.18.0.
- 영향: 경고만 발생, 동작은 정상.
- 해결: 추후 Node를 최신 22.x LTS로 업데이트하면 사라짐.

---

## 7. 추후 학습 자료 (북마크용)

### Foundry VTT V13

- [공식 V13 마이그레이션 가이드](https://foundryvtt.com/article/v13-migration/)
- [API 문서](https://foundryvtt.com/api/)
- [ApplicationV2 패턴 가이드](https://foundryvtt.wiki/en/development/api/applicationv2)
- [DataModel 가이드](https://foundryvtt.wiki/en/development/api/datamodel)
- [League of Foundry Developers Discord](https://discord.gg/foundryvtt) - 질문에 가장 빠른 답

### 도구 공식 문서

- [Vite](https://vitejs.dev/) - 라이브러리 모드 섹션 정독 권장
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Prettier Options](https://prettier.io/docs/en/options.html)
- [Vitest](https://vitest.dev/)
- [Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/)
- [Husky 9](https://typicode.github.io/husky/)

### 참고할 만한 V13 시스템 코드 (모범 사례)

- [pf2e](https://github.com/foundryvtt/pf2e) - 대규모, TS 풀 적용
- [dnd5e](https://github.com/foundryvtt/dnd5e) - 공식, JS 기반
- [boilerplate](https://github.com/asacolips-projects/boilerplate) - 학습용 미니멀 시스템

---

## 8. 진행 체크리스트 (마이그레이션 전체)

### 1단계: 분석 (완료)

- [x] 현재 코드 상태 파악
- [x] V13 호환성 갭 식별

### 2단계: 환경 셋업 + 1차 호환 패치 (완료, 2026-05-26)

- [x] Gulp → Vite 이전
- [x] TypeScript / ESLint / Prettier / Vitest / Husky / Commitlint 도입
- [x] `foundry.utils.*`, `foundry.applications.*` 네임스페이스 적용
- [x] `Roll.evaluate({async:true})` 정리
- [x] `DEFAULT_TOKEN`, `mergeObject`, `duplicate` 글로벌 제거
- [x] `ChatMessage.type` → `style`
- [x] ActiveEffect `label`/`icon` → `name`/`img`
- [x] `system.json` V13 호환
- [x] `dist/` 빌드 산출물 구조 정리
- [x] Foundry 심볼릭 링크 스크립트
- [x] README + 개인 노트

### 3단계: 본격 마이그레이션 (예정)

- [ ] `template.json` → DataModel 클래스 (`module/data/` 신설)
- [ ] `ActorSheet` → `ActorSheetV2` + `HandlebarsApplicationMixin`
- [ ] `ItemSheet` → `ItemSheetV2` + `HandlebarsApplicationMixin`
- [ ] Handlebars 템플릿 정리 (`parts/old/` 제거, 필요한 것만 유지)
- [ ] 글로벌 헬퍼 함수들 TS로 마이그레이션 (`module/helpers/`)
- [ ] SCSS `@import` → `@use`/`@forward`
- [ ] `lib/some-lib` 빈 placeholder 정리 또는 제거
- [ ] 자동 변경 함수: 기존 액터 데이터 새 DataModel 스키마로 변환

### 4단계: 기능 구현 (예정, `memo/TODO.txt` 참조)

- [ ] 정동판정 결과창에 아스테르 획득 메시지/버튼
- [ ] 공방 시트 (캐릭터 시트 탭)
- [ ] 기록 시트 (세션별 아스테르 증감)
- [ ] 상태이상(부상/큰부상/졸림/피로/배고픔) 토글
- [ ] 아이템 정렬

### 5단계: 출시 준비 (예정)

- [ ] `system.json`의 `url`/`manifest`/`download` URL 채우기
- [ ] GitHub Actions로 CI (lint + typecheck + test + build)
- [ ] GitHub Release 자동화 (태그 → zip + manifest 갱신)
- [ ] V14 베타 호환성 확인

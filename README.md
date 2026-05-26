# Aster - Foundry VTT System

마녀와 채애의 아스테르 (Aster) TTRPG 룰을 위한 Foundry VTT 시스템.
대상 Foundry 버전: **V13**(현재) / V14(예정).

---

## 개발 환경 요구사항

| 도구        | 버전                              |
| ----------- | --------------------------------- |
| Node.js     | 20 LTS 이상 (`.nvmrc` 기준 22)    |
| npm         | 10 이상                           |
| Foundry VTT | V13 이상                          |
| OS          | Windows / macOS / Linux 모두 가능 |

```powershell
node --version   # v20+
npm  --version   # 10+
```

---

## 초기 셋업

```powershell
git clone <repo>
cd aster_FVTT
npm install          # husky 훅 자동 설정 포함
npm run build        # dist/ 생성
```

### Foundry에 시스템 연결

빌드 결과물(`dist/`)을 Foundry 데이터 폴더의 `Data/systems/aster`로 심볼릭 링크합니다.

```powershell
# 환경변수로 한 번만 지정해두면 편합니다
$env:FOUNDRY_DATA_PATH = "$env:LOCALAPPDATA\FoundryVTT"
npm run link:foundry
```

또는 한 번만 사용 시:

```powershell
npm run link:foundry -- "$env:LOCALAPPDATA\FoundryVTT"
```

> Windows에서 디렉터리 심볼릭 링크는 **개발자 모드** 활성화 또는 관리자 권한 PowerShell이 필요할 수 있습니다.
> 본 스크립트는 Windows에서 자동으로 junction을 사용하므로 일반 권한으로도 동작합니다.

Foundry를 재시작하면 시스템 목록에 Aster가 표시됩니다.

---

## 일상 워크플로

```powershell
npm run dev          # 파일 변경 시 dist/ 자동 재빌드 (watch)
npm run build        # 운영용 빌드
npm run typecheck    # tsc --noEmit (TS 타입만 검사)
npm run lint         # ESLint
npm run lint:fix     # ESLint --fix
npm run format       # Prettier --write
npm run test         # Vitest 1회 실행
npm run test:watch   # Vitest watch
```

### 코드 스타일

- 포맷팅: **Prettier**가 자동 정리. 에디터의 "Format on Save"를 켜는 것을 권장.
- 린팅: **ESLint flat config** (`eslint.config.js`).
- 에디터 일관성: **EditorConfig** (`.editorconfig`).
- TS 타입 점검: **TypeScript**(`tsc --noEmit`), `allowJs`로 점진 도입 중.
- Foundry 타입: [`fvtt-types`](https://github.com/League-of-Foundry-Developers/foundry-vtt-types).

### 커밋 규칙 (Conventional Commits)

Husky가 `commit-msg` 훅으로 강제합니다. 예시:

```
feat(sheet): add craft tab to character sheet
fix(roll): respect DC=0 as opposed roll
docs(readme): update Foundry link instructions
refactor(actor): extract ability total computation
test(emotion): cover favColor branch
```

허용되는 타입: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

`pre-commit` 훅에서 lint-staged가 자동으로 변경 파일에 ESLint + Prettier를 적용합니다.

---

## 디렉터리 구조

```
.
├── module/                 # JS/TS 소스 코드 (esmodule)
│   ├── aster.mjs           # 시스템 엔트리 (Vite 진입점)
│   ├── documents/          # Actor/Item/Roll 도큐먼트 확장
│   ├── sheets/             # 시트 클래스
│   └── helpers/            # config, templates, effects 헬퍼
├── templates/              # Handlebars HTML 템플릿
├── scss/                   # SCSS 스타일 소스
├── lang/                   # 다국어 (ko.json)
├── lib/                    # 외부 라이브러리 (정적 복사)
├── tools/                  # 개발용 스크립트 (.mts)
├── test/                   # Vitest 테스트
├── system.json             # Foundry 시스템 매니페스트
├── template.json           # Actor/Item 데이터 스키마
├── vite.config.ts          # 빌드 설정
├── tsconfig.json           # TypeScript 설정
├── eslint.config.js        # ESLint flat config
├── commitlint.config.js    # 커밋 메시지 규칙
├── vitest.config.ts        # 테스트 설정
└── dist/                   # 빌드 산출물 (git ignore, Foundry가 바라보는 폴더)
```

---

## V13 / V14 마이그레이션 현황

### 1차 (현재) - 환경 셋업 + 호환 패치

- [x] Gulp → Vite 이전
- [x] TypeScript / ESLint / Prettier / Vitest 도입
- [x] Husky + Commitlint
- [x] `foundry.utils.*`, `foundry.applications.handlebars.*` 네임스페이스 적용
- [x] `Roll#evaluate({async: true})` 제거
- [x] `DEFAULT_TOKEN` → `CONST.DEFAULT_TOKEN`
- [x] `ChatMessage.type` → `style` (CONST.CHAT_MESSAGE_STYLES)
- [x] ActiveEffect `label` → `name`, `icon` → `img`
- [x] `system.json` compatibility = `{ minimum: "13", verified: "13", maximum: "14" }`
- [x] 시트 컬렉션 등록을 `foundry.documents.collections` 네임스페이스로

### 2차 (예정) - 본격 구조 개편

- [ ] `template.json` → **DataModel 클래스**로 이전
- [ ] `ActorSheet`/`ItemSheet` → `ActorSheetV2`/`ItemSheetV2` + `HandlebarsApplicationMixin`
- [ ] Handlebars 템플릿 정리 (불필요한 `parts/old` 제거)
- [ ] `lib/some-lib` 빈 placeholder 정리
- [ ] V14 베타 도입 시 호환성 재검토

---

## TODO (기능)

`memo/TODO.txt` 참조. 주요 작업:

- 정동판정 결과창에 아스테르 획득 메시지 추가
- 공방 시트, 기록 시트 구현
- 상태이상 체크 처리
- 탭 구성/아이템 정렬

---

## 라이선스

MIT - [`LICENSE.txt`](./LICENSE.txt) 참고.

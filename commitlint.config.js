/**
 * Conventional Commits 규칙으로 커밋 메시지를 강제합니다.
 * 예: `feat(actor): add emotion roll handler`, `fix(sheet): correct DC binding`.
 *
 * 허용되는 type: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};

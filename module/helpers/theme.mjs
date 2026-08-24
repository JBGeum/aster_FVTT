/**
 */

/**
 * - auto: data-aster-theme 영역 제거 → @media 영역 자동 정합 (OS 영역)
 * - dark: [data-aster-theme="dark"] 명시 → OS 영역 무시
 * - light: [data-aster-theme="light"] 명시 → OS 영역 무시
 *
 * 속성은 html(documentElement)에 토글한다. _tokens.scss의 @media·명시 selector가
 * 모두 :root(html) 기준이라, body에 붙이면 :not([data-aster-theme]) 가드가 깨져
 * OS 라이트 환경에서 명시 다크가 무력화된다.
 *
 * @param {string} theme  "auto" / "dark" / "light"
 */
export function applyAsterTheme(theme) {
  const root = document.documentElement;
  if (theme === "auto") {
    root.removeAttribute("data-aster-theme");
  } else {
    root.setAttribute("data-aster-theme", theme);
  }
}

/**
 * V13: loadTemplates는 `foundry.applications.handlebars` 네임스페이스로 이동했습니다.
 * @returns {Promise<Function[]>}
 */
export const preloadHandlebarsTemplates = async function () {
  const { loadTemplates } = foundry.applications.handlebars;
  return loadTemplates([
    "systems/aster/templates/actor/parts/actor-main-character.html",
    "systems/aster/templates/actor/parts/actor-main-craft.html",
    "systems/aster/templates/actor/parts/actor-main-record.html",

    "systems/aster/templates/actor/parts/actor-sub-inventory.html",
    "systems/aster/templates/actor/parts/actor-sub-spell.html",
    "systems/aster/templates/actor/parts/actor-sub-combat.html",
    "systems/aster/templates/actor/parts/actor-sub-effects.html",
    "systems/aster/templates/actor/parts/gm-combat-state.html",

    "systems/aster/templates/item/parts/material-mats.html",

    "systems/aster/templates/chatcard/roll-asterabl.html",
    "systems/aster/templates/chatcard/roll-asterabl-emo.html",
    "systems/aster/templates/chatcard/roll-asterabl-vs.html",
    "systems/aster/templates/chatcard/opposed-result.html",
    "systems/aster/templates/chatcard/critfumble-banner.html",
    "systems/aster/templates/chatcard/roll-critfumble.html",

    "systems/aster/templates/apps/gm-panel.html",

    "systems/aster/templates/chat/spell-card.html",

    "systems/aster/templates/chat/picnic-card.html",

    "systems/aster/templates/chat/consumable-card.html",

    "systems/aster/templates/chat/revive-card.html",

    "systems/aster/templates/chat/combat-action.html",
    "systems/aster/templates/chat/damage-result.html",
    "systems/aster/templates/chat/unison-attack.html",
    "systems/aster/templates/chat/npc-action-card.html",

    "systems/aster/templates/chat/item-card.html",
  ]);
};

/**
 * 값은 속성 안전용으로 엔티티화 — 브라우저가 디코딩하면 Foundry가 cleanHTML로 정제·렌더한다.
 * `hb-tip` 클래스로 #tooltip을 시스템 스킨에 한정(코어 전역 툴팁 오염 방지). 다크는 전역 테마
 * 신호로 CSS가 토큰 스왑하므로 여기선 부착하지 않는다(component/_tooltip.scss).
 *
 * @param {string} html  조립된 구조화 HTML
 * @returns {string}  ` data-tooltip-html="..." data-tooltip-class="hb-tip" data-tooltip-direction="UP"`
 */
function tooltipAttr(html) {
  const esc = html
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return ` data-tooltip-html="${esc}" data-tooltip-class="hb-tip" data-tooltip-direction="UP"`;
}

export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("checked", function (condition) {
    return condition ? "checked" : "";
  });
  Handlebars.registerHelper("selected", function (condition) {
    return condition ? "selected" : "";
  });
  Handlebars.registerHelper("disabled", function (condition) {
    return condition ? "disabled" : "";
  });
  // 속성을 통째로 {{#if}}로 감싸면 prettier HTML 파서가 죽으므로 단일 인라인 표현으로 처리한다.
  // 내용이 있을 때만 속성을 붙여 빈 툴팁 박스를 막는다.
  Handlebars.registerHelper("tooltipHtml", function (content) {
    const raw = content == null ? "" : String(content).trim();
    if (!raw) return "";
    return new Handlebars.SafeString(tooltipAttr(raw));
  });
  Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));
  Handlebars.registerHelper("multiply", (a, b) => Number(a) * Number(b));
  Handlebars.registerHelper("range", (n) => Array.from({ length: Number(n) }, (_, i) => i));
  // 배열 → 구분자 결합. npc-action-card의 상태이상 라벨 목록 표시에 사용.
  Handlebars.registerHelper("join", (arr, sep) =>
    Array.isArray(arr) ? arr.join(typeof sep === "string" ? sep : ", ") : "",
  );
  // 다이스 눈 시각화 — d6 결과 배열을 Font Awesome 주사위 아이콘(fa-dice-*)으로. 챗카드 .dice-pips.
  const DICE_WORDS = ["one", "two", "three", "four", "five", "six"];
  Handlebars.registerHelper("dicePips", (dice) => {
    if (!Array.isArray(dice)) return "";
    const icons = dice
      .map((v) => {
        const word = DICE_WORDS[Number(v) - 1];
        return word ? `<i class="fa-solid fa-dice-${word}"></i>` : "";
      })
      .join("");
    return new Handlebars.SafeString(icons);
  });
}

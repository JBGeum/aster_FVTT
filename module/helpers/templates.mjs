/**
 * V13: loadTemplates는 `foundry.applications.handlebars` 네임스페이스로 이동했습니다.
 * @returns {Promise<Function[]>}
 */
export const preloadHandlebarsTemplates = async function () {
  const { loadTemplates } = foundry.applications.handlebars;
  return loadTemplates([
    // Actor partials
    "systems/aster/templates/actor/parts/actor-main-character.html",
    "systems/aster/templates/actor/parts/actor-main-craft.html",
    "systems/aster/templates/actor/parts/actor-main-record.html",

    "systems/aster/templates/actor/parts/actor-sub-inventory.html",
    "systems/aster/templates/actor/parts/actor-sub-spell.html",
    "systems/aster/templates/actor/parts/actor-sub-combat.html",

    // Item partials
    "systems/aster/templates/item/parts/material-fields.html",
    "systems/aster/templates/item/parts/material-mats.html",

    // Chat cards
    "systems/aster/templates/chatcard/roll-asterabl.html",
    "systems/aster/templates/chatcard/roll-asterabl-emo.html",
    "systems/aster/templates/chatcard/roll-asterabl-vs.html",
    "systems/aster/templates/chatcard/opposed-result.html",
    // 대성공/대실패 전용 카드 + 공통 배너(기본 template — partial)
    "systems/aster/templates/chatcard/critfumble-banner.html",
    "systems/aster/templates/chatcard/roll-critfumble.html",

    // Apps
    "systems/aster/templates/apps/gm-panel.html",

    // Chat (spell)
    "systems/aster/templates/chat/spell-card.html",

    // Chat (picnic)
    "systems/aster/templates/chat/picnic-card.html",

    // Chat (consumable)
    "systems/aster/templates/chat/consumable-card.html",

    // Chat (revive)
    "systems/aster/templates/chat/revive-card.html",

    // Chat (combat)
    "systems/aster/templates/chat/combat-action.html",
    "systems/aster/templates/chat/damage-result.html",
    "systems/aster/templates/chat/unison-attack.html",
    "systems/aster/templates/chat/npc-action-card.html",
  ]);
};

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

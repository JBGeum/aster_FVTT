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

    // Chat cards
    "systems/aster/templates/chatcard/roll-asterabl.html",
    "systems/aster/templates/chatcard/roll-asterabl-emo.html",
    "systems/aster/templates/chatcard/roll-asterabl-vs.html",
    "systems/aster/templates/chatcard/opposed-result.html",

    // Apps
    "systems/aster/templates/apps/gm-panel.html",

    // Chat (spell)
    "systems/aster/templates/chat/spell-card.html",
  ]);
};

export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("checked", function (condition) {
    return condition ? "checked" : "";
  });
  Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));
  Handlebars.registerHelper("multiply", (a, b) => Number(a) * Number(b));
  Handlebars.registerHelper("range", (n) => Array.from({ length: Number(n) }, (_, i) => i));
}

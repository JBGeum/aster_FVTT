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
  ]);
};

export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("checked", function (condition) {
    return condition ? "checked" : "";
  });
}

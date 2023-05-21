/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
 export const preloadHandlebarsTemplates = async function() {
  return loadTemplates([

    // Actor partials.
    "systems/aster/templates/actor/parts/actor-features.html",
    "systems/aster/templates/actor/parts/actor-items.html",
    "systems/aster/templates/actor/parts/actor-spells.html",
    "systems/aster/templates/actor/parts/actor-effects.html",


    "systems/aster/templates/chatcard/roll-asterabl.html",
    "systems/aster/templates/chatcard/roll-asterabl-emo.html",
    "systems/aster/templates/chatcard/roll-asterabl-vs.html",
  ]);
};

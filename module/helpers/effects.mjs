/**
 * @param {ActiveEffect[]} effects    The array of Active Effect instances to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {
  const categories = {
    temporary: {
      type: "temporary",
      label: "Temporary Effects",
      effects: [],
    },
    passive: {
      type: "passive",
      label: "Passive Effects",
      effects: [],
    },
    inactive: {
      type: "inactive",
      label: "Inactive Effects",
      effects: [],
    },
  };

  for (const e of effects) {
    e._getSourceName?.(); // Trigger a lookup for the source name
    if (e.disabled) categories.inactive.effects.push(e);
    else if (e.isTemporary) categories.temporary.effects.push(e);
    else categories.passive.effects.push(e);
  }
  return categories;
}

import { formatEffectDeltas } from "./effect-deltas.mjs";

/**
 * @param {ActiveEffect[]} effects    The array of Active Effect instances to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {
  const categories = {
    temporary: {
      type: "temporary",
      label: "ASTER.effects.cat.temporary",
      effects: [],
    },
    passive: {
      type: "passive",
      label: "ASTER.effects.cat.passive",
      effects: [],
    },
    inactive: {
      type: "inactive",
      label: "ASTER.effects.cat.inactive",
      effects: [],
    },
  };

  for (const e of effects) {
    const row = {
      id: e.id,
      name: e.name,
      img: e.img,
      disabled: e.disabled,
      durationLabel: e.duration?.remaining ? e.duration.label : null,
      deltas: formatEffectDeltas(e.changes),
      isStatus: (e.statuses?.size ?? 0) > 0,
    };
    if (e.disabled) categories.inactive.effects.push(row);
    else if (e.isTemporary) categories.temporary.effects.push(row);
    else categories.passive.effects.push(row);
  }
  return categories;
}

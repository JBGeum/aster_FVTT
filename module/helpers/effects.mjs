import { formatEffectDeltas } from "./effect-deltas.mjs";
import { labelKeyFor } from "./effect-targets.mjs";

/**
 * @param {ActiveEffect[]} effects    The array of Active Effect instances to prepare sheet data for
 * @return {object}                   Data for rendering
 */
/**
 * 증감에 대상 라벨을 붙여 한 줄로 잇는다. 라벨이 없는 키는 값만 남긴다.
 *
 * @param {object[]} changes
 * @returns {string|null}
 */
function describeDeltas(changes) {
  const parts = formatEffectDeltas(changes).map((d) => {
    const labelKey = labelKeyFor(d.key);
    return labelKey ? `${game.i18n.localize(labelKey)} ${d.text}` : d.text;
  });
  return parts.length ? parts.join(", ") : null;
}

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
      deltas: describeDeltas(e.changes),
      isStatus: (e.statuses?.size ?? 0) > 0,
    };
    if (e.disabled) categories.inactive.effects.push(row);
    else if (e.isTemporary) categories.temporary.effects.push(row);
    else categories.passive.effects.push(row);
  }
  return categories;
}

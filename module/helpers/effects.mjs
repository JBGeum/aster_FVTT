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
      // duration이 없으면 코어 label이 "None"을 돌려준다.
      durationLabel: e.duration?.remaining ? e.duration.label : null,
      // 상태이상은 system.badstatus가 정본이다 — AE를 직접 지우면 필드가 남아 어긋난다.
      isStatus: (e.statuses?.size ?? 0) > 0,
    };
    if (e.disabled) categories.inactive.effects.push(row);
    else if (e.isTemporary) categories.temporary.effects.push(row);
    else categories.passive.effects.push(row);
  }
  return categories;
}

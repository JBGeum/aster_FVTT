// @ts-check

/**
 * 효과 추가 다이얼로그의 대상 목록.
 *
 * 능력치는 `.total`이 prepareDerivedData에서 base+mod로 재계산되므로 `.mod`에 건다.
 * `speed`·`dodge`는 그 단계에서 AE 누적분을 보존하도록 처리돼 있어 그대로 건다.
 */
export const EFFECT_TARGETS = [
  { key: "system.speed", label: "ASTER.label.speed" },
  { key: "system.dodge", label: "ASTER.label.dodge" },
  { key: "system.ability.active.mod", label: "ASTER.ability.active" },
  { key: "system.ability.knowledge.mod", label: "ASTER.ability.knowledge" },
  { key: "system.ability.dexterity.mod", label: "ASTER.ability.dexterity" },
  { key: "system.ability.worldly.mod", label: "ASTER.ability.worldly" },
  { key: "system.health.max", label: "ASTER.effects.target.healthMax" },
  { key: "system.satiety.max", label: "ASTER.effects.target.satietyMax" },
];

/**
 * 대상 키의 i18n 라벨. 목록에 없으면 null — 코어 시트로 직접 넣은 키다.
 *
 * @param {string|null|undefined} key
 * @returns {string|null}
 */
export function labelKeyFor(key) {
  return EFFECT_TARGETS.find((t) => t.key === key)?.label ?? null;
}

/** @param {object} obj @param {string} path */
function atPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * 폼 제출값에서 **효과가 얹힌 값을 그대로 되보낸 칸만** 뺀다.
 *
 * 입력칸이 원본을 그리는 자리는 제출값이 원본과 같아 걸리지 않으므로 편집이 살아 있고,
 * 파생값을 그리는 자리만 막혀 누적을 끊는다.
 *
 * @param {Record<string, unknown>} data           formData.object
 * @param {Array<{changes?: Array<{key: string}>}>} effects  actor.appliedEffects
 * @param {object} derived                         파생 루트 (actor)
 * @param {object} source                          원본 루트 (actor.toObject())
 * @returns {Record<string, unknown>}
 */
export function stripEffectKeys(data, effects, derived, source) {
  const keys = new Set();
  for (const e of effects ?? []) {
    for (const c of e.changes ?? []) keys.add(c.key);
  }
  return Object.fromEntries(
    Object.entries(data).filter(([k, v]) => {
      if (!keys.has(k)) return true;
      const d = atPath(derived, k);
      return !(d !== atPath(source, k) && String(v) === String(d));
    }),
  );
}

/**
 * 다이얼로그 입력을 ActiveEffect 생성 데이터로 바꾼다.
 *
 * @param {object} p
 * @param {string} p.name
 * @param {string} p.key                 대상 필드
 * @param {number} p.value               더할 값
 * @param {number|null} [p.rounds]       지속 라운드. 없으면 해제 전까지 유지된다
 * @param {number|null} [p.round]        현재 라운드 (전투 중일 때만)
 * @param {string|null} [p.combatId]
 * @returns {object}
 */
export function buildEffectData({ name, key, value, rounds = 0, round = null, combatId = null }) {
  const data = {
    name,
    img: "icons/svg/aura.svg",
    // mode 2 = ACTIVE_EFFECT_MODES.ADD
    changes: [{ key, mode: 2, value, priority: 20 }],
  };
  if ((rounds ?? 0) > 0) {
    data.duration = { rounds };
    if (round != null) {
      data.duration.startRound = round;
      data.duration.combat = combatId;
    }
  }
  return data;
}

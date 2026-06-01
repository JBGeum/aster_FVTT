// @ts-check
/**
 * 상태이상별 Active Effect 템플릿.
 * key는 badstatus 필드명과 일치 (자동 동기화 키).
 *
 * statuses 배열은 Foundry의 statusEffect 시스템과 통합되어
 * actor.statuses Set으로 조회 가능 (중복 생성 방지에 활용).
 */
export const BADSTATUS_EFFECTS = {
  exhaustion: {
    key: "exhaustion",
    name: "ASTER.badstatus.exhaustion",
    img: "icons/svg/skull.svg", // 피로 — 임시 아이콘. 후속 작업에서 전용 아이콘으로.
    changes: [
      {
        key: "system.speed",
        mode: 2, // ACTIVE_EFFECT_MODES.ADD
        value: "-3",
        priority: null,
      },
    ],
    statuses: ["exhaustion"],
  },
  // 졸림은 changes 없음 (판정 보정은 rollAbility에서 직접 처리).
  // AE 존재 자체가 "표시"이고 자동 해제 트리거를 받기 위함.
  sleepy: {
    key: "sleepy",
    name: "ASTER.badstatus.sleepy",
    img: "icons/svg/sleep.svg",
    changes: [],
    statuses: ["sleepy"],
  },
};

/**
 * badstatus 필드 변경에 따라 AE를 생성/삭제하는 동기화 헬퍼.
 *
 * @param {Actor} actor
 * @param {string} key  badstatus 필드 키 (예: "exhaustion")
 * @param {boolean} active  새 상태
 */
export async function syncBadstatusEffect(actor, key, active) {
  const tpl = BADSTATUS_EFFECTS[key];
  if (!tpl) return; // 정의되지 않은 상태이상은 동기화 대상 외 (부상/큰부상/배고픔)

  // 중복 방지: 같은 statuses 키를 가진 AE 검색
  const existing = actor.effects.find((e) => e.statuses?.has(tpl.statuses[0]));

  if (active && !existing) {
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n?.localize(tpl.name) ?? tpl.name,
        img: tpl.img,
        changes: tpl.changes,
        statuses: tpl.statuses,
        origin: actor.uuid,
        // duration 미지정 → passive (해제 전까지 유지)
      },
    ]);
  } else if (!active && existing) {
    await existing.delete();
  }
}

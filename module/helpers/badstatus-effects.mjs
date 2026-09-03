// @ts-check
/**
 * key는 badstatus 필드명과 일치 (자동 동기화 키).
 *
 * statuses 배열은 Foundry의 statusEffect 시스템과 통합되어
 * actor.statuses Set으로 조회 가능 (중복 생성 방지에 활용).
 */
export const BADSTATUS_EFFECTS = {
  exhaustion: {
    key: "exhaustion",
    name: "ASTER.badstatus.exhaustion",
    img: "icons/svg/downgrade.svg", // 피로
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
  // 부상·큰부상·배고픔 — 자동 효과(changes) 없음(건강 감소는 _onEndTurn, 포만은 별도 영역).
  // AE 존재 자체가 토큰 status 아이콘 표시 + 자동 동기화 트리거다.
  injury: {
    key: "injury",
    name: "ASTER.badstatus.injury",
    img: "icons/svg/blood.svg",
    changes: [],
    statuses: ["injury"],
  },
  bigInj: {
    key: "bigInj",
    name: "ASTER.badstatus.biginj",
    img: "icons/svg/bones.svg",
    changes: [],
    statuses: ["bigInj"],
  },
  hungry: {
    key: "hungry",
    name: "ASTER.badstatus.hungry",
    img: "icons/svg/tankard.svg",
    changes: [],
    statuses: ["hungry"],
  },
};

/**
 *
 * @param {Actor} actor
 * @param {string} key  badstatus 필드 키 (예: "exhaustion")
 * @param {boolean} active  새 상태
 */
export async function syncBadstatusEffect(actor, key, active) {
  const tpl = BADSTATUS_EFFECTS[key];
  if (!tpl) return;

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

/**
 * 파티 공유(world) 값 정의.
 * 새 world 값은 이 배열에 항목 하나 추가 + setting register만 하면 GM 패널에 자동 노출됩니다.
 * 캐릭터 소유 값(아스테르·건강·스킬 등)은 여기 두지 않습니다 — 각 액터 시트가 담당합니다.
 *
 * @typedef {object} WorldValueDef
 * @property {string} key                game.settings 키
 * @property {string} label              i18n 라벨 키
 * @property {"number"|"select"} type    값 타입
 * @property {number} [min]              최소값 (클램프, number 전용)
 * @property {boolean} [rollable]        범위 굴림 지원 여부 (number 전용)
 * @property {boolean} [witchHunt]       마녀사냥 판정(d100 vs 현재값) 지원 여부 (number 전용)
 * @property {{key:string, label:string}[]} [options]  select 옵션 (select 전용)
 * @property {number|string} [default]   기본값
 */

/** 세션 페이즈 (룰북 393행) — 진행 순서대로 */
export const PHASES = [
  { key: "prep", label: "ASTER.phase.prep" }, // 준비
  { key: "opening", label: "ASTER.phase.opening" }, // 오프닝
  { key: "info", label: "ASTER.phase.info" }, // 정보수집
  { key: "exploration", label: "ASTER.phase.exploration" }, // 탐색
  { key: "climax", label: "ASTER.phase.climax" }, // 클라이막스
  { key: "talk", label: "ASTER.phase.talk" }, // 환담
  { key: "result", label: "ASTER.phase.result" }, // 리절트
];

/** @type {WorldValueDef[]} */
export const WORLD_VALUES = [
  {
    key: "alertLevel",
    label: "ASTER.world.alert",
    type: "number",
    min: 0,
    rollable: true,
    witchHunt: true,
    default: 0,
  },
  {
    key: "currentPhase",
    label: "ASTER.world.phase",
    type: "select",
    options: PHASES,
    default: "prep",
  },
];

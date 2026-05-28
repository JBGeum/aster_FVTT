/**
 * 파티 공유(world) 값 정의.
 * 새 world 값은 이 배열에 항목 하나 추가 + setting register만 하면 GM 패널에 자동 노출됩니다.
 * 캐릭터 소유 값(아스테르·건강·스킬 등)은 여기 두지 않습니다 — 각 액터 시트가 담당합니다.
 *
 * @typedef {object} WorldValueDef
 * @property {string} key       game.settings 키
 * @property {string} label     i18n 라벨 키
 * @property {"number"} type    값 타입
 * @property {number} [min]     최소값 (클램프)
 * @property {boolean} [rollable] 범위 굴림 지원 여부
 * @property {boolean} [witchHunt] 마녀사냥 판정(d100 vs 현재값) 지원 여부
 * @property {number} [default] 기본값
 */

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
];

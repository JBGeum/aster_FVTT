export const ASTER = {};

/**
 * The set of Ability Scores used within the system.
 * @type {Object}
 */
ASTER.ability = {
  active: "ASTER.ability.active",
  knowledge: "ASTER.ability.knowledge",
  dexterity: "ASTER.ability.dexterity",
  worldly: "ASTER.ability.worldly",
};

ASTER.color = {
  red: "ASTER.aster.red",
  blue: "ASTER.aster.blue",
  green: "ASTER.aster.green",
  yellow: "ASTER.aster.yellow",
};

ASTER.aster = {
  red: "ASTER.aster.red",
  blue: "ASTER.aster.blue",
  green: "ASTER.aster.green",
  yellow: "ASTER.aster.yellow",
  white: "ASTER.aster.white",
};

// 장비 카테고리 — 룰북 805 (마법구). xlsx "아이템마법구" 자료 정합. equipment 시트 드롭다운.
ASTER.equipmentType = {
  magicTool: "ASTER.equipment.type.magicTool",
};

// npcAction 대상 타입 (N2) — 룰북 【自分】/【1人】/【N人】/【전원】 정합.
ASTER.npcTargetType = {
  self: "ASTER.npcAction.target.self",
  one: "ASTER.npcAction.target.one",
  many: "ASTER.npcAction.target.many",
  all: "ASTER.npcAction.target.all",
};

// 아이템 사용 타이밍 — 룰북/데이터(아스테르 데이터.xlsx)의 타이밍 어휘. consumable 시트 드롭다운.
ASTER.itemTiming = {
  setup: "ASTER.item.timing.setup",
  initiative: "ASTER.item.timing.initiative",
  instant: "ASTER.item.timing.instant",
  anytime: "ASTER.item.timing.anytime",
  cleanup: "ASTER.item.timing.cleanup",
  conditional: "ASTER.item.timing.conditional",
  effectRef: "ASTER.item.timing.effectRef",
  exploration: "ASTER.item.timing.exploration",
  combat: "ASTER.item.timing.combat",
};

export const ASTER = {};

/** @type {Object} */
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

// 장비 카테고리 — equipment 시트 드롭다운.
ASTER.equipmentType = {
  magicTool: "ASTER.equipment.type.magicTool",
};

ASTER.npcTargetType = {
  self: "ASTER.npcAction.target.self",
  one: "ASTER.npcAction.target.one",
  many: "ASTER.npcAction.target.many",
  all: "ASTER.npcAction.target.all",
};

// 아이템 사용 타이밍 — 룰북/데이터(아스테르 데이터.xlsx)의 타이밍 어휘. consumable 시트 드롭다운.
// 데이터 timing 저장값이 한글이고 복합 어휘("클린업(효과참조)" 등)가 있어 영문 키 매핑이 불가 →
// 키·값 모두 한글로 통일해 저장값과 100% 매칭(드롭다운 localize 불필요).
ASTER.itemTiming = {
  셋업: "셋업",
  이니셔티브: "이니셔티브",
  순간: "순간",
  언제라도: "언제라도",
  클린업: "클린업",
  조건: "조건",
  효과참조: "효과참조",
  "탐색중 (효과 참조)": "탐색중 (효과 참조)",
  전투중: "전투중",
  "클린업(효과참조)": "클린업(효과참조)",
  "전투중(효과참조)": "전투중(효과참조)",
};

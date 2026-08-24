// SCSS는 Vite가 번들 시 CSS로 추출합니다.
import "../scss/aster.scss";

import { AsterActor } from "./documents/actor.mjs";
import { AsterItem } from "./documents/item.mjs";
import { AsterCombat } from "./documents/combat.mjs";
import { AsterActorSheet } from "./sheets/actor-sheet.mjs";
import { AsterItemSheet } from "./sheets/item-sheet.mjs";
import { AsterGMPanel } from "./apps/gm-panel.mjs";
import { CharacterDataModel } from "./data/actors/character.mjs";
import { NpcDataModel } from "./data/actors/npc.mjs";
import { BagDataModel } from "./data/items/bag.mjs";
import { ConsumableDataModel } from "./data/items/consumable.mjs";
import { EquipmentDataModel } from "./data/items/equipment.mjs";
import { FoodDataModel } from "./data/items/food.mjs";
import { SpellDataModel } from "./data/items/spell.mjs";
import { FeatureDataModel } from "./data/items/feature.mjs";
import { RecordDataModel } from "./data/items/record.mjs";
import { NpcActionDataModel } from "./data/items/npc-action.mjs";
import { preloadHandlebarsTemplates, registerHandlebarsHelpers } from "./helpers/templates.mjs";
import { BADSTATUS_EFFECTS } from "./helpers/badstatus-effects.mjs";
import { ASTER } from "./helpers/config.mjs";
import { WORLD_VALUES } from "./helpers/world-values.mjs";
import { applyAsterTheme } from "./helpers/theme.mjs";

// 훅 모듈 — import 시 top-level에서 Hooks.on(...)을 등록한다(부수효과).
import "./hooks/item-hooks.mjs";
import "./hooks/chat-hooks.mjs";
import "./hooks/combat-hooks.mjs";
import { rollItemMacro } from "./hooks/ui-hooks.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once("init", async function () {
  game.aster = {
    AsterActor,
    AsterItem,
    rollItemMacro,
    openGMPanel: () => AsterGMPanel.show(),
  };

  CONFIG.ASTER = ASTER;

  // getRollData()가 system 키를 최상위로 펼쳐 반환하므로 `@speed`로 참조 (not `@system.speed`).
  CONFIG.Combat.initiative = {
    formula: "@speed",
    decimals: 0,
  };

  // 토큰 상태 아이콘 표시용 status 등록 — BADSTATUS_EFFECTS에서 파생(id는 statuses 키와 정합).
  // 시트 badstatus 토글 → AE 생성/삭제(syncBadstatusEffect) → 토큰 아이콘 자동 갱신.
  CONFIG.statusEffects = [
    ...CONFIG.statusEffects,
    ...Object.values(BADSTATUS_EFFECTS).map((e) => ({
      id: e.statuses[0],
      name: e.name,
      img: e.img,
    })),
  ];

  CONFIG.Actor.documentClass = AsterActor;
  CONFIG.Item.documentClass = AsterItem;
  CONFIG.Combat.documentClass = AsterCombat;

  CONFIG.Actor.dataModels = {
    character: CharacterDataModel,
    npc: NpcDataModel,
  };
  CONFIG.Item.dataModels = {
    bag: BagDataModel,
    consumable: ConsumableDataModel,
    equipment: EquipmentDataModel,
    food: FoodDataModel,
    spell: SpellDataModel,
    feature: FeatureDataModel,
    record: RecordDataModel,
    npcAction: NpcActionDataModel,
  };

  const ActorsCls = foundry.documents.collections.Actors;
  const ItemsCls = foundry.documents.collections.Items;

  ActorsCls.unregisterSheet("core", ActorSheet);
  ActorsCls.registerSheet("aster", AsterActorSheet, { makeDefault: true });
  ItemsCls.unregisterSheet("core", ItemSheet);
  ItemsCls.registerSheet("aster", AsterItemSheet, { makeDefault: true });

  // world 값 일괄 등록 (config:false → 기본 설정 창에는 숨기고 GM 패널로만 관리)
  for (const v of WORLD_VALUES) {
    const settingType = v.type === "select" ? String : Number;
    const defaultValue = v.default ?? (settingType === Number ? 0 : "");
    game.settings.register("aster", v.key, {
      scope: "world",
      config: false,
      type: settingType,
      default: defaultValue,
    });
  }

  // 트래커는 항목 수가 가변이라 WORLD_VALUES 루프(스칼라 전용)와 별도로 등록한다.
  game.settings.register("aster", "trackers", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register("aster", "theme", {
    name: "ASTER.settings.theme.name",
    hint: "ASTER.settings.theme.hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      auto: "ASTER.settings.theme.auto",
      dark: "ASTER.settings.theme.dark",
      light: "ASTER.settings.theme.light",
    },
    default: "auto",
    onChange: (value) => applyAsterTheme(value),
  });

  registerHandlebarsHelpers();
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

Handlebars.registerHelper("concat", function (...args) {
  // 마지막 인자는 Handlebars의 options 객체이므로 제외
  return args
    .slice(0, -1)
    .filter((a) => typeof a !== "object")
    .join("");
});

Handlebars.registerHelper("ifEquals", function (arg1, arg2, options) {
  // eslint-disable-next-line eqeqeq -- 템플릿 헬퍼는 문자열/숫자 비교를 느슨하게 허용
  return arg1 == arg2 ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper("toLowerCase", function (str) {
  return String(str ?? "").toLowerCase();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function () {
  applyAsterTheme(game.settings.get("aster", "theme"));

  await migrateInventoryFields();
  await migrateSpellTarget();
  await ensureUnisonTables();
});

/**
 * 효과는 UNISON_TABLES 코드가 통제 — RollTable은 플레이버 텍스트만 담당.
 * 이미 있으면 덮어쓰지 않아 GM의 텍스트 수정이 보존된다.
 */
async function ensureUnisonTables() {
  if (!game.user.isGM) return;
  const pack = game.packs.get("aster.unison-tables");
  if (!pack) {
    console.warn("[Aster] Unison tables compendium pack not found.");
    return;
  }

  const tableNames = ["Red", "Blue", "Green", "Yellow"].map((c) => `Unison Table - ${c}`);
  const missing = tableNames.filter((name) => !game.tables.getName(name));
  if (missing.length === 0) return;

  const packContents = await pack.getDocuments();
  for (const name of missing) {
    const source = packContents.find((t) => t.name === name);
    if (!source) {
      console.warn(`[Aster] Source RollTable "${name}" not found in compendium.`);
      continue;
    }
    await RollTable.create(source.toObject(), { keepId: false });
    console.info(`[Aster] Imported unison table: ${name}`);
  }
}

/* -------------------------------------------- */
/*  Data Migration                              */
/* -------------------------------------------- */

async function migrateInventoryFields() {
  if (!game.user.isGM) return;
  for (const item of game.items.filter((i) => i.type === "bag")) {
    if (!item.system.grid?.cols) {
      await item.update({ "system.grid": { cols: 6, rows: 4 } });
    }
  }
  for (const actor of game.actors.filter((a) => a.type === "character")) {
    if (actor.system.storage?.limit == null) {
      await actor.update({ "system.storage.limit": 20 });
    }
  }
}

// spell.system.target 신설 보정. DataModel이 initial을 런타임 적용하므로
// _source(저장값)에 target이 없는 기존 아이템만 영구 기록한다.
async function migrateSpellTarget() {
  if (!game.user.isGM) return;
  for (const item of game.items.filter((i) => i.type === "spell")) {
    if (item._source.system.target == null) await item.update({ "system.target": 7 });
  }
  for (const actor of game.actors) {
    const spells = actor.items.filter((i) => i.type === "spell" && i._source.system.target == null);
    if (spells.length) {
      await actor.updateEmbeddedDocuments(
        "Item",
        spells.map((s) => ({ _id: s.id, "system.target": 7 })),
      );
    }
  }
}

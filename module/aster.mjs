// SCSS는 Vite가 번들 시 CSS로 추출합니다.
import "../scss/aster.scss";

// Documents
import { AsterActor } from "./documents/actor.mjs";
import { AsterItem } from "./documents/item.mjs";
import { AsterCombat } from "./documents/combat.mjs";
// Sheets
import { AsterActorSheet } from "./sheets/actor-sheet.mjs";
import { AsterItemSheet } from "./sheets/item-sheet.mjs";
// Apps
import { AsterGMPanel } from "./apps/gm-panel.mjs";
// DataModels
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
// Helpers
import { preloadHandlebarsTemplates, registerHandlebarsHelpers } from "./helpers/templates.mjs";
import { BADSTATUS_EFFECTS } from "./helpers/badstatus-effects.mjs";
import { ASTER } from "./helpers/config.mjs";
import { WORLD_VALUES } from "./helpers/world-values.mjs";
import { applyAsterTheme } from "./helpers/theme.mjs";

// 훅 모듈 — import 시 top-level에서 Hooks.on(...)을 등록한다(부수효과).
import "./hooks/item-hooks.mjs";
import "./hooks/chat-hooks.mjs";
import "./hooks/combat-hooks.mjs";

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

  // 룰북 574: 이니셔티브 = 민첩 비교 (다이스 굴림 없음).
  // system.speed는 D15 derived + D16 Active Effect 가산 후 최종값.
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

  // V13: 시트 컬렉션은 foundry.documents.collections 네임스페이스 사용
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

  // ============================
  // H1 — Aster 시스템 자체 theme 설정 영역 (3 영역)
  // ============================
  game.settings.register("aster", "theme", {
    name: "ASTER.settings.theme.name",
    hint: "ASTER.settings.theme.hint",
    scope: "client", // 사용자별 영역
    config: true, // Foundry 설정 메뉴 노출
    type: String,
    choices: {
      auto: "ASTER.settings.theme.auto",
      dark: "ASTER.settings.theme.dark",
      light: "ASTER.settings.theme.light",
    },
    default: "auto", // V13 OS 자동 영역 정합 기본
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
/*  GM Panel — Scene Control 버튼               */
/* -------------------------------------------- */

// V13: controls는 name으로 키된 객체, 각 control의 tools도 name 키 객체.
Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  tokens.tools["aster-gm-panel"] = {
    name: "aster-gm-panel",
    title: "ASTER.world.panelTitle",
    icon: "fa-solid fa-sliders",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => AsterGMPanel.show(),
  };
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function () {
  Hooks.on("hotbarDrop", (bar, data, slot) => createItemMacro(data, slot));

  // world 값 변경 시 열려있는 GM 패널을 동기화 (다른 클라이언트 포함)
  const worldKeys = new Set(WORLD_VALUES.map((v) => `aster.${v.key}`));
  Hooks.on("updateSetting", (setting) => {
    if (!worldKeys.has(setting.key)) return;
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof AsterGMPanel) app.render();
    }
  });

  // H1 — 초기 theme 영역 적용 (body data-attribute 토글)
  applyAsterTheme(game.settings.get("aster", "theme"));

  await migrateInventoryFields();
  await migrateSpellTarget();
  await ensureUnisonTables();
});

/**
 * 합체기 4색 RollTable이 world에 없으면 compendium pack에서 import (GM 전용).
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
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * @param {object} data
 * @param {number} slot
 * @returns {Promise<boolean>}
 */
async function createItemMacro(data, slot) {
  if (data.type !== "Item") return false;
  if (!data.uuid.includes("Actor.") && !data.uuid.includes("Token.")) {
    ui.notifications.warn("You can only create macro buttons for owned Items");
    return false;
  }
  const item = await Item.fromDropData(data);
  const command = `game.aster.rollItemMacro("${data.uuid}");`;

  let macro = game.macros.find((m) => m.name === item.name && m.command === command);
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command,
      flags: { "aster.itemMacro": true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
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

/**
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  const dropData = { type: "Item", uuid: itemUuid };
  Item.fromDropData(dropData).then((item) => {
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`,
      );
      return;
    }
    item.roll();
  });
}

/* -------------------------------------------- */
/*  토큰 HUD — 아스테르 5색 자가 증감 (안 B)      */
/* -------------------------------------------- */

// 마테리얼 제외 5색. 백색은 어두운 배경에 묻히므로 테두리 필요.
const ASTER_HUD_FIELDS = [
  { key: "red", color: "#d2776b" },
  { key: "blue", color: "#6f9ad8" },
  { key: "green", color: "#7ab06a" },
  { key: "yellow", color: "#e0c04a" },
  { key: "white", color: "#e8e4d8" },
];

// 토큰 하단에 점+값 패널 마크업 생성. 색은 인라인 지정(시트 스코프 밖이라 --el-* 미사용).
function buildAsterHudPanel(actor) {
  const cells = ASTER_HUD_FIELDS.map((f) => {
    const val = foundry.utils.getProperty(actor, `system.aster.${f.key}.value`) ?? 0;
    const label = game.i18n.localize(ASTER.aster[f.key] ?? `ASTER.aster.${f.key}`);
    const ring = f.key === "white" ? "border:1px solid #999;" : "";
    return `
      <div class="aster-hud-cell" data-aster-hud data-key="${f.key}"
           data-tooltip="${label} (좌클릭 +1 / 우클릭 −1)">
        <span class="aster-hud-dot" style="background:${f.color};${ring}"></span>
        <span class="aster-hud-val">${val}</span>
      </div>`;
  }).join("");
  return `<div class="aster-hud-panel">${cells}</div>`;
}

// 좌클릭 +1 / 우클릭 −1. actor.update()로 서버 경유 동기화, HUD 값은 수동 갱신.
async function onAsterHudAdjust(event, actor, delta) {
  event.preventDefault();
  event.stopPropagation(); // HUD 닫힘·토큰 선택·컨텍스트메뉴 방지
  if (!actor.isOwner) return; // 방어적 이중 체크

  const cell = event.currentTarget;
  const path = `system.aster.${cell.dataset.key}.value`;
  const cur = foundry.utils.getProperty(actor, path) ?? 0;
  const next = cur + delta;
  await actor.update({ [path]: next });

  const valEl = cell.querySelector(".aster-hud-val");
  if (valEl) valEl.textContent = String(next); // HUD 수동 갱신
}

Hooks.on("renderTokenHUD", (hud, html) => {
  const actor = hud.object?.actor;
  if (!actor || actor.type !== "character") return; // PC만 — NPC 미표시
  if (!actor.isOwner) return; // 본인(또는 GM)만 — 타인 차단

  // V13 TokenHUD는 AppV2 — html은 HUD 루트(#token-hud) HTMLElement.
  // 루트에 append하면 panel의 top:100% 절대배치가 토큰 하단 기준이 됨.
  html.insertAdjacentHTML("beforeend", buildAsterHudPanel(actor));

  // 위치: 토큰 아래 + 하단 기본 HUD(톱니·elevation) 영역을 넘어가게.
  // top:100%는 HUD 컨테이너 높이 기준이라 하단 컨트롤을 못 넘음 → 토큰 픽셀 높이 기준으로 직접 배치.
  const panel = html.querySelector(".aster-hud-panel");
  if (panel) {
    const tokenH = hud.object?.h ?? 100; // 토큰 픽셀 높이 (그리드 1칸 ≈ 100, 2×2 ≈ 200 → 자동 대응)
    const bottomClearance = 50; // 하단 기본 HUD 여유
    panel.style.top = `${tokenH + bottomClearance}px`; // 컨테이너 상단(0) 기준 절대 위치
  }

  html.querySelectorAll("[data-aster-hud]").forEach((el) => {
    el.addEventListener("click", (ev) => onAsterHudAdjust(ev, actor, +1));
    el.addEventListener("contextmenu", (ev) => onAsterHudAdjust(ev, actor, -1));
  });
});

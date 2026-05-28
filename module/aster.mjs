// SCSS는 Vite가 번들 시 CSS로 추출합니다.
import "../scss/aster.scss";

// Documents
import { AsterActor } from "./documents/actor.mjs";
import { AsterItem } from "./documents/item.mjs";
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
// Helpers
import { preloadHandlebarsTemplates, registerHandlebarsHelpers } from "./helpers/templates.mjs";
import { ASTER } from "./helpers/config.mjs";
import { WORLD_VALUES } from "./helpers/world-values.mjs";

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

  CONFIG.Combat.initiative = {
    formula: "1d20 + @abilities.dex.mod",
    decimals: 2,
  };

  CONFIG.Actor.documentClass = AsterActor;
  CONFIG.Item.documentClass = AsterItem;

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
  };

  // V13: 시트 컬렉션은 foundry.documents.collections 네임스페이스 사용 권장
  // (전역 Actors/Items도 아직 동작하지만 deprecation warning 발생)
  const ActorsCls = foundry.documents.collections?.Actors ?? Actors;
  const ItemsCls = foundry.documents.collections?.Items ?? Items;

  ActorsCls.unregisterSheet("core", ActorSheet);
  ActorsCls.registerSheet("aster", AsterActorSheet, { makeDefault: true });
  ItemsCls.unregisterSheet("core", ItemSheet);
  ItemsCls.registerSheet("aster", AsterItemSheet, { makeDefault: true });

  // world 값 일괄 등록 (config:false → 기본 설정 창에는 숨기고 GM 패널로만 관리)
  for (const v of WORLD_VALUES) {
    game.settings.register("aster", v.key, {
      scope: "world",
      config: false,
      type: Number,
      default: v.default ?? 0,
    });
  }

  registerHandlebarsHelpers();
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Bag Deletion → Storage Transfer             */
/* -------------------------------------------- */

Hooks.on("preDeleteItem", (item, _options, _userId) => {
  if (item.type !== "bag") return true;
  const actor = item.parent;
  if (!actor) return true;

  const orphans = actor.items.filter((i) => i.system.container === item.id);
  Hooks.once("deleteItem", async () => {
    const updates = orphans.map((i) => ({
      _id: i.id,
      "system.container": "",
      "system.grid": { x: 0, y: 0 },
    }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  });
  return true;
});

/* -------------------------------------------- */
/*  Item Creation Constraints                   */
/* -------------------------------------------- */

const SINGLETON_TYPES = ["bag", "food"];

Hooks.on("preCreateItem", (item, _data, _options, _userId) => {
  const actor = item.parent;
  if (!actor || actor.documentName !== "Actor") return true;
  if (!SINGLETON_TYPES.includes(item.type)) return true;

  const already = actor.items.some((i) => i.type === item.type);
  if (already) {
    ui.notifications.warn(
      game.i18n.format("ASTER.inventory.warn.singleton", {
        type: game.i18n.localize(`TYPES.Item.${item.type}`),
      }),
    );
    return false;
  }
  return true;
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
/*  Spell Chat Card — 추가 굴림 버튼            */
/* -------------------------------------------- */

// V13: renderChatMessage → renderChatMessageHTML (html은 HTMLElement)
Hooks.on("renderChatMessageHTML", (_message, html) => {
  const btn = html.querySelector("[data-action='spell-extra-roll']");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const actor = game.actors.get(btn.dataset.actorId);
    const spell = actor?.items.get(btn.dataset.spellId);
    if (!actor || !spell) return;

    const n = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.spell.extraTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.spell.extraN")}</label>
          <input type="number" name="n" value="1" min="1" />
        </div>
      `,
      ok: {
        label: game.i18n.localize("ASTER.spell.extraRoll"),
        callback: (_e, button) => Number(button.form.elements.n.value),
      },
    }).catch(() => null);
    if (!n || n < 1) return;

    // 아스테르 차감 없이 굴리기만 (수동 차감). 자동 차감은 후속 작업.
    const extraRoll = new Roll(`${n}d6`);
    await extraRoll.evaluate();
    const extraDice = extraRoll.dice[0].results.map((r) => r.result);
    await extraRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.format("ASTER.spell.extraFlavor", {
        name: spell.name,
        n,
        sum: extraDice.reduce((a, b) => a + b, 0),
      }),
    });
  });
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

  await migrateInventoryFields();
  await migrateSpellTarget();
});

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

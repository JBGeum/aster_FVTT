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
// Helpers
import { preloadHandlebarsTemplates, registerHandlebarsHelpers } from "./helpers/templates.mjs";
import { ASTER } from "./helpers/config.mjs";
import { WORLD_VALUES } from "./helpers/world-values.mjs";
import { resolveOpposed } from "./helpers/roll-result.mjs";

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
/*  대성공/대실패 후속 버튼                      */
/* -------------------------------------------- */

const CRIT_COLORS = ["red", "blue", "white", "yellow", "green"];

Hooks.on("renderChatMessageHTML", (_message, html) => {
  // 대실패 경계도 버튼은 GM 전용 — 비-GM 뷰어에게는 버튼을 제거한다.
  // (crit-aster-gain은 owner/PL용이므로 이 훅 자체를 early-return하지 않는다.)
  if (!game.user.isGM) {
    html.querySelectorAll("[data-action='fumble-alert']").forEach((btn) => {
      const footer = btn.closest("footer");
      btn.remove();
      // 단독 footer는 비워졌으니 정리, 다른 버튼이 남은 footer는 보존
      if (footer && !footer.querySelector("button")) footer.remove();
    });
  }

  // ----- 대성공: PL이 색 선택해 아스테르 2개 획득 -----
  html.querySelectorAll("[data-action='crit-aster-gain']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const actor = game.actors.get(btn.dataset.actorId);
      if (!actor) return;

      // 권한 체크: 본인 또는 GM만(룰: 대성공 아스테르 2개는 PL이 색 선택)
      if (!actor.isOwner) {
        ui.notifications.warn(game.i18n.localize("ASTER.roll.critOwnerOnly"));
        return;
      }

      const rows = CRIT_COLORS.map((k) => {
        const label = game.i18n.localize(`ASTER.aster.${k}`);
        return `<div class="form-group"><label>${label}</label>
                <input type="number" name="${k}" value="0" min="0" max="2" /></div>`;
      }).join("");

      const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("ASTER.roll.critGainTitle") },
        content: `<p>${game.i18n.localize("ASTER.roll.critGainHint")}</p>${rows}`,
        ok: {
          label: game.i18n.localize("ASTER.roll.critGain"),
          callback: (_e, b) =>
            Object.fromEntries(CRIT_COLORS.map((k) => [k, Number(b.form.elements[k].value) || 0])),
        },
      }).catch(() => null);
      if (!result) return;

      const total = Object.values(result).reduce((a, n) => a + n, 0);
      if (total !== 2) {
        ui.notifications.warn(game.i18n.localize("ASTER.roll.critGainTotal2"));
        return;
      }

      // 액터 시트에 직접 가산
      const update = {};
      for (const k of CRIT_COLORS) {
        if (result[k] > 0) {
          const cur = actor.system.aster?.[k]?.value ?? 0;
          update[`system.aster.${k}.value`] = cur + result[k];
        }
      }
      await actor.update(update);

      const parts = CRIT_COLORS.filter((k) => result[k] > 0).map(
        (k) => `${game.i18n.localize(`ASTER.aster.${k}`)} ${result[k]}`,
      );
      await ChatMessage.create({
        content: `<div class="aster-chat-card">
          <header class="card-header"><div class="title"><div class="name">
            ${game.i18n.format("ASTER.roll.critGained", { actor: actor.name })}
          </div></div></header>
          <div class="emo-gen-list">${parts.join(" / ")}</div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
      });
    });
  });

  // ----- 대실패: 경계도 +1d6 -----
  html.querySelectorAll("[data-action='fumble-alert']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      // 권한: GM만 (경계도는 world setting, GM만 변경 가능)
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
        return;
      }
      const roll = new Roll("1d6");
      await roll.evaluate();
      const cur = Number(game.settings.get("aster", "alertLevel")) || 0;
      const next = cur + roll.total;
      await game.settings.set("aster", "alertLevel", next);
      await roll.toMessage({
        flavor: game.i18n.format("ASTER.roll.fumbleAlertFlavor", {
          delta: roll.total,
          total: next,
        }),
        speaker: ChatMessage.getSpeaker({
          alias: game.i18n.localize("ASTER.world.panelTitle"),
        }),
      });
    });
  });
});

/* -------------------------------------------- */
/*  대결판정 결합 (능동/수동 지정 → 결과 카드)    */
/* -------------------------------------------- */

// 모듈 스코프 상태: pending 능동측 메시지 ID와 데이터.
// 단순 메모리 — 새로고침 시 사라지나, 다시 [능동 지정]을 누르면 됨.
let pendingOpposed = null;

Hooks.on("renderChatMessageHTML", (message, html) => {
  // 결합 버튼은 모두 GM 전용 — 비-GM 뷰어에게는 footer 통째 제거 후 종료.
  if (!game.user.isGM) {
    html.querySelector(".opposed-actions")?.remove();
    return;
  }

  // 능동측 지정
  html.querySelectorAll("[data-action='opposed-set-active']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
        return;
      }
      const data = message.getFlag("aster", "opposedRoll");
      if (!data) {
        ui.notifications.warn(game.i18n.localize("ASTER.opposed.notOpposedCard"));
        return;
      }
      // 같은 카드 다시 누르면 해제 (취소 동작)
      if (pendingOpposed?.messageId === message.id) {
        pendingOpposed = null;
        ui.notifications.info(game.i18n.localize("ASTER.opposed.activeCleared"));
        return;
      }
      pendingOpposed = { messageId: message.id, ...data };
      ui.notifications.info(game.i18n.format("ASTER.opposed.activeSet", { actor: data.actorName }));
    });
  });

  // 수동측 지정 → 결과 카드 생성
  html.querySelectorAll("[data-action='opposed-set-passive']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
        return;
      }
      const passive = message.getFlag("aster", "opposedRoll");
      if (!passive) {
        ui.notifications.warn(game.i18n.localize("ASTER.opposed.notOpposedCard"));
        return;
      }
      if (!pendingOpposed) {
        ui.notifications.warn(game.i18n.localize("ASTER.opposed.noActive"));
        return;
      }
      if (pendingOpposed.messageId === message.id) {
        ui.notifications.warn(game.i18n.localize("ASTER.opposed.sameCard"));
        return;
      }

      const active = pendingOpposed;
      pendingOpposed = null; // 즉시 해제 (중복 처리 방지)

      const result = resolveOpposed({
        activeAchievement: active.total,
        passiveAchievement: passive.total,
        activeCF: { critical: active.isCritical, fumble: active.isFumble },
        passiveCF: { critical: passive.isCritical, fumble: passive.isFumble },
      });

      const cardData = {
        active: { ...active, diceText: active.dice.join(", ") },
        passive: { ...passive, diceText: passive.dice.join(", ") },
        winnerKey: result.winner,
        winnerName: result.winner === "active" ? active.actorName : passive.actorName,
        isActiveWinner: result.winner === "active",
        isPassiveWinner: result.winner === "passive",
        reasonKey: result.reason,
        reasonText: game.i18n.localize(`ASTER.opposed.reason.${result.reason}`),
      };

      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/aster/templates/chatcard/opposed-result.html",
        cardData,
      );
      await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
        flags: { aster: { opposedResult: true } },
      });
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
/*  Combat Hooks                                */
/* -------------------------------------------- */

// 액터 추가 시 자동 이니셔티브(=민첩). GM만 처리해 중복 update 방지.
Hooks.on("createCombatant", async (combatant) => {
  if (!game.user.isGM) return;
  const combat = combatant.parent;
  if (!combat?._autoRollInitiative) return;
  await combat._autoRollInitiative(combatant.id);
});

// 라운드 시작 처리 (이니셔티브 갱신 + 액션 포인트 굴림 + 채팅 카드).
// 라운드 1은 combatStart, 라운드 2+는 combatRound에서 발화 (상호 배타적).
// combatStart의 _startRound가 전체 이니셔티브를 갱신하므로 G1 백업(_autoRollInitiative)을 포섭.
Hooks.on("combatStart", async (combat) => {
  if (combat instanceof AsterCombat) await combat._startRound();
});
Hooks.on("combatRound", async (combat) => {
  if (combat instanceof AsterCombat) await combat._startRound();
});

// Combat Tracker 각 PC 행에 액션 포인트 표시 (flag 변경 시 자동 재렌더로 갱신).
Hooks.on("renderCombatTracker", (_app, element) => {
  const combat = game.combat;
  if (!combat) return;
  // V13 ApplicationV2: element는 HTMLElement.
  for (const row of element.querySelectorAll(".combatant")) {
    const id = row.dataset.combatantId;
    if (!id) continue;
    const c = combat.combatants.get(id);
    if (c?.actor?.type !== "character") continue;
    const ap = c.getFlag("aster", "actionPoint");
    if (ap == null) continue;

    let apEl = row.querySelector(".aster-ap");
    if (!apEl) {
      apEl = document.createElement("span");
      apEl.classList.add("aster-ap");
      apEl.title = game.i18n.localize("ASTER.combat.actionPoints");
      (row.querySelector(".token-initiative") ?? row).appendChild(apEl);
    }
    apEl.textContent = `AP ${ap}`;
  }
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

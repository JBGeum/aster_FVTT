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

// 대미지 다이얼로그의 상태이상 목록 — { key: badstatus 필드, i18n: ASTER.badstatus.* 키 }.
// 필드명과 i18n 키가 다른 항목(bigInj→biginj) 때문에 매핑을 명시한다.
// G4 합체기(부속성 적/황)도 같은 목록을 참조하므로 export.
export const DAMAGE_STATUSES = [
  { key: "injury", i18n: "injury" },
  { key: "bigInj", i18n: "biginj" },
  { key: "sleepy", i18n: "sleepy" },
  { key: "exhaustion", i18n: "exhaustion" },
  { key: "hungry", i18n: "hungry" },
];

/**
 * 상태이상 회복 — 지정 키를 false로 갱신. applyDamageAndStatus와 대칭.
 * D16 AE 동기 hook이 false → AE 자동 제거를 처리한다.
 * D30 정책 3단계(회복 효과 확장)의 사전 회수 — 합체기 적 부속성에서 첫 사용.
 *
 * @param {Actor[]} actors  대상 액터 배열
 * @param {string} statusKey  상태이상 키 (injury, sleepy 등)
 * @returns {Promise<Array<{actorName: string, cured: boolean}>>}
 *   cured=true: 실제 회복(이전 true), false: 변화 없음(이전 false).
 */
export async function applyCureStatus(actors, statusKey) {
  const results = [];
  for (const actor of actors) {
    const current = actor.system.badstatus?.[statusKey] ?? false;
    if (current) {
      await actor.update({ [`system.badstatus.${statusKey}`]: false });
      results.push({ actorName: actor.name, cured: true });
    } else {
      results.push({ actorName: actor.name, cured: false });
    }
  }
  return results;
}

/**
 * 대미지 다이얼로그 — 대미지 수치 + 상태이상 체크박스. 취소 시 null 반환.
 * applyDamageFromCard / applyDamageFromOpposed 공통 사용.
 *
 * @param {Actor} targetActor
 * @param {number} defaultDamage
 * @returns {Promise<{amount: number, status: string[]}|null>}
 */
async function promptDamageDialog(targetActor, defaultDamage) {
  const statusRows = DAMAGE_STATUSES.map(
    (s) =>
      `<label><input type="checkbox" name="status" value="${s.key}" /> ${game.i18n.localize(`ASTER.badstatus.${s.i18n}`)}</label>`,
  ).join("");

  return foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("ASTER.damage.dialogTitle") },
    content: `
      <p class="damage-target-info">${game.i18n.format("ASTER.damage.targetInfo", { name: targetActor.name })}</p>
      <div class="form-group">
        <label>${game.i18n.localize("ASTER.damage.amount")}</label>
        <input type="number" name="amount" value="${defaultDamage}" min="0" />
      </div>
      <fieldset class="damage-status-group">
        <legend>${game.i18n.localize("ASTER.damage.inflictLegend")}</legend>
        ${statusRows}
      </fieldset>
    `,
    ok: {
      callback: (_e, b) => ({
        amount: Number(b.form.elements.amount.value) || 0,
        status: Array.from(b.form.querySelectorAll('input[name="status"]:checked')).map(
          (el) => el.value,
        ),
      }),
    },
  }).catch(() => null);
}

/**
 * 방어 차감 처리. 대상의 Combatant에 defendActive flag가 있으면 1d6 굴려 amount 차감 후 flag 해제.
 *
 * @param {Actor} targetActor
 * @param {number} amount
 * @returns {Promise<{roll: number, original: number, adjusted: number} | null>}
 *   차감이 일어났으면 결과 객체, 아니면 null (Combat 없음·Combatant 없음·flag 없음).
 */
async function applyDefendReduction(targetActor, amount) {
  const combat = game.combat;
  if (!combat) return null;
  const combatant = combat.combatants.find((c) => c.actor?.id === targetActor.id);
  if (!combatant) return null;
  if (combatant.getFlag("aster", "defendActive") !== true) return null;

  const roll = new Roll("1d6");
  await roll.evaluate();
  const reduction = roll.total;
  const adjusted = Math.max(0, amount - reduction);

  // 한 번 적용 — 즉시 해제
  await combatant.setFlag("aster", "defendActive", false);

  return { roll: reduction, original: amount, adjusted };
}

/**
 * 건강 차감 + 상태이상 부여. 상태이상은 false→true만 (D16 AE 자동 동기).
 * amount > 0이면 방어 차감(`defendActive`) 자동 적용 — 상태이상만 부여 시 방어 미소비(룰 정합).
 *
 * @param {Actor} targetActor
 * @param {number} amount
 * @param {string[]} statusList
 * @returns {Promise<{hBefore: number, hAfter: number, statusApplied: string[], defendReduced: {roll:number,original:number,adjusted:number}|null}>}
 */
async function applyDamageAndStatus(targetActor, amount, statusList) {
  const hBefore = targetActor.system.health?.value ?? 0;
  let hAfter = hBefore;

  let defendReduced = null;
  if (amount > 0) {
    defendReduced = await applyDefendReduction(targetActor, amount);
    if (defendReduced) amount = defendReduced.adjusted;
  }

  if (amount > 0 && hBefore > 0) {
    hAfter = Math.max(0, hBefore - amount);
    await targetActor.update({ "system.health.value": hAfter });
  }

  const statusApplied = [];
  const statusUpdate = {};
  for (const key of statusList) {
    if (!(targetActor.system.badstatus?.[key] ?? false)) {
      statusUpdate[`system.badstatus.${key}`] = true;
      statusApplied.push(key);
    }
  }
  if (Object.keys(statusUpdate).length > 0) await targetActor.update(statusUpdate);

  return { hBefore, hAfter, statusApplied, defendReduced };
}

/**
 * 대미지 적용 결과 카드 렌더링. applyDamageFromCard / applyDamageFromOpposed 공통 사용.
 *
 * @param {Actor} targetActor
 * @param {{amount: number, hBefore: number, hAfter: number, statusApplied: string[], defendReduced: {roll:number,original:number,adjusted:number}|null}} info
 */
async function renderDamageResultCard(
  targetActor,
  { amount, hBefore, hAfter, statusApplied, defendReduced },
) {
  const lines = [];
  // 방어 차감은 건강 라인보다 앞 — 룰적 시점 순서(차감 → 건강 적용).
  if (defendReduced) {
    lines.push(
      game.i18n.format("ASTER.damage.defendLine", {
        original: defendReduced.original,
        roll: defendReduced.roll,
        adjusted: defendReduced.adjusted,
      }),
    );
  }
  if (amount > 0) {
    lines.push(
      game.i18n.format("ASTER.damage.healthLine", {
        before: hBefore,
        after: hAfter,
        delta: hAfter - hBefore,
      }),
    );
    if (hAfter === 0) {
      lines.push(`<span class="warn-zero">${game.i18n.localize("ASTER.damage.healthZero")}</span>`);
    }
  }
  if (statusApplied.length > 0) {
    const names = statusApplied.map((k) => {
      const def = DAMAGE_STATUSES.find((s) => s.key === k);
      return game.i18n.localize(`ASTER.badstatus.${def?.i18n ?? k}`);
    });
    lines.push(game.i18n.format("ASTER.damage.statusLine", { names: names.join(", ") }));
  }
  if (lines.length === 0) lines.push(game.i18n.localize("ASTER.damage.noChange"));

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/damage-result.html",
    {
      title: game.i18n.format("ASTER.damage.applied", { target: targetActor.name }),
      lines,
    },
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
  });
}

/**
 * 채팅 카드의 "대미지 적용" 버튼 처리 (GM 전용).
 * combatAction(돌던지기) 또는 spellCast(마법) flag에서 대상을 식별하고,
 * 다이얼로그로 대미지 수치 + 상태이상을 받아 대상 액터에 적용한다.
 * 회피는 GM 판단(회피 성공 시 버튼 안 누름) — 시스템 미개입.
 *
 * @param {ChatMessage} message
 */
async function applyDamageFromCard(message) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
    return;
  }

  const combatAction = message.getFlag("aster", "combatAction");
  const spellCast = message.getFlag("aster", "spellCast");
  const data = combatAction ?? spellCast;
  if (!data) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.noCardData"));
    return;
  }
  if (data.damageApplied) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.alreadyApplied"));
    return;
  }
  if (!data.targetActorId) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.noTarget"));
    return;
  }
  const targetActor = game.actors.get(data.targetActorId);
  if (!targetActor) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.targetNotFound"));
    return;
  }

  const result = await promptDamageDialog(targetActor, data.defaultDamage ?? 0);
  if (result === null) return; // 취소

  const { hBefore, hAfter, statusApplied, defendReduced } = await applyDamageAndStatus(
    targetActor,
    result.amount,
    result.status,
  );

  // flag 갱신 — 중복 적용 방지
  const flagKey = combatAction ? "combatAction" : "spellCast";
  await message.setFlag("aster", flagKey, { ...data, damageApplied: true });

  await renderDamageResultCard(targetActor, {
    amount: result.amount,
    hBefore,
    hAfter,
    statusApplied,
    defendReduced,
  });
}

/**
 * resolveOpposed 결과 카드의 "대미지 적용" 처리 (GM 전용).
 * 회피 패배 측(opposedDamage flag의 targetActorId)을 대상으로 GM이 수치·상태이상을 입력.
 * 자동 추출 없음 (기본 수치 0). 회피 승리·미포함 카드는 opposedDamage flag가 없어 진입 불가.
 *
 * @param {ChatMessage} message
 */
async function applyDamageFromOpposed(message) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
    return;
  }

  const data = message.getFlag("aster", "opposedDamage");
  if (!data) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.noCardData"));
    return;
  }
  if (data.damageApplied) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.alreadyApplied"));
    return;
  }
  const targetActor = game.actors.get(data.targetActorId);
  if (!targetActor) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.targetNotFound"));
    return;
  }

  const result = await promptDamageDialog(targetActor, 0);
  if (result === null) return; // 취소

  const { hBefore, hAfter, statusApplied, defendReduced } = await applyDamageAndStatus(
    targetActor,
    result.amount,
    result.status,
  );

  // 중복 적용 방지
  await message.setFlag("aster", "opposedDamage", { ...data, damageApplied: true });

  await renderDamageResultCard(targetActor, {
    amount: result.amount,
    hBefore,
    hAfter,
    statusApplied,
    defendReduced,
  });
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  // 결합 버튼은 모두 GM 전용 — 비-GM 뷰어에게는 footer 통째 제거 후 종료.
  if (!game.user.isGM) {
    html.querySelector(".opposed-actions")?.remove();
    html.querySelector(".damage-actions")?.remove();
    return;
  }

  // 대미지 적용 (돌던지기·마법 카드)
  html.querySelectorAll("[data-action='apply-damage']").forEach((btn) => {
    btn.addEventListener("click", () => applyDamageFromCard(message));
  });

  // 대미지 적용 (대결판정 결과 카드 — 회피 패배 측)
  html.querySelectorAll("[data-action='apply-damage-opposed']").forEach((btn) => {
    btn.addEventListener("click", () => applyDamageFromOpposed(message));
  });

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

      // 회피 측 식별 — 회피 카드(isDodge)만 대미지 분기 대상. 둘 다 일반이면 hasDodge=false.
      const dodgeSide = active.isDodge ? "active" : passive.isDodge ? "passive" : null;
      const hasDodge = dodgeSide !== null;
      const dodger = dodgeSide === "active" ? active : dodgeSide === "passive" ? passive : null;
      const dodgeWon = hasDodge && result.winner === dodgeSide;
      const dodgeLost = hasDodge && result.winner !== dodgeSide;

      const cardData = {
        active: { ...active, diceText: active.dice.join(", ") },
        passive: { ...passive, diceText: passive.dice.join(", ") },
        winnerKey: result.winner,
        winnerName: result.winner === "active" ? active.actorName : passive.actorName,
        isActiveWinner: result.winner === "active",
        isPassiveWinner: result.winner === "passive",
        reasonKey: result.reason,
        reasonText: game.i18n.localize(`ASTER.opposed.reason.${result.reason}`),
        hasDodge,
        dodgeWon,
        dodgeLost,
      };

      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/aster/templates/chatcard/opposed-result.html",
        cardData,
      );
      await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
        flags: {
          aster: {
            opposedResult: true,
            // 회피 패배 시에만 대미지 적용 정보 부여 — 버튼 핸들러가 null 체크로 분기.
            opposedDamage: dodgeLost
              ? {
                  targetActorId: dodger.actorId,
                  targetName: dodger.actorName,
                  damageApplied: false,
                }
              : null,
          },
        },
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

/** 열려 있는 단일 액터 시트를 재렌더 (combat 탭의 전투 중 여부·AP 동기화용). */
function refreshActorSheet(actor) {
  const sheet = actor?.sheet;
  if (sheet?.rendered) sheet.render(false);
}

/** 전투에 속한 모든 전투원의 액터 시트를 재렌더. 전투 시작/종료 시 사용. */
function refreshCombatSheets(combat) {
  for (const c of combat?.combatants ?? []) refreshActorSheet(c.actor);
}

// 액터 추가 시 자동 이니셔티브(=민첩). GM만 처리해 중복 update 방지.
// 시트 재렌더는 모든 클라이언트에서 (combat 탭의 전투 중 표시 동기화).
Hooks.on("createCombatant", async (combatant) => {
  refreshActorSheet(combatant.actor);
  if (!game.user.isGM) return;
  const combat = combatant.parent;
  if (!combat?._autoRollInitiative) return;
  await combat._autoRollInitiative(combatant.id);
});

// 전투원 제거 시 해당 액터 시트 재렌더 (전투 중 표시 해제).
Hooks.on("deleteCombatant", (combatant) => {
  refreshActorSheet(combatant.actor);
});

// 라운드 시작 처리 (이니셔티브 갱신 + 액션 포인트 굴림 + 채팅 카드).
// 라운드 1은 combatStart, 라운드 2+는 combatRound에서 발화 (상호 배타적).
// combatStart의 _startRound가 전체 이니셔티브를 갱신하므로 G1 백업(_autoRollInitiative)을 포섭.
// combatStart는 추가로 전투원 시트를 재렌더해 "전투 중" 상태를 즉시 반영 (모든 클라이언트).
Hooks.on("combatStart", async (combat) => {
  if (!(combat instanceof AsterCombat)) return;
  refreshCombatSheets(combat);
  await combat._startRound();
});
Hooks.on("combatRound", async (combat) => {
  if (combat instanceof AsterCombat) await combat._startRound();
});

// 전투 종료 시 큰부상 → 부상 전이 (행동완료 시 부상 감소는 AsterCombat._onEndTurn 오버라이드가 처리).
// 전투원 시트를 재렌더해 "전투 중" 상태 해제를 즉시 반영 (모든 클라이언트).
Hooks.on("deleteCombat", async (combat) => {
  if (!(combat instanceof AsterCombat)) return;
  refreshCombatSheets(combat);
  await combat._endCombat();
});

// Combatant flag(AP 등) 변경 시 해당 액터 시트 재렌더 — AP는 Combatant 문서에 있어
// Actor 시트가 자동 갱신되지 않으므로 combat 탭의 AP 표시를 수동 동기화.
Hooks.on("updateCombatant", (combatant, changes) => {
  if (!changes.flags?.aster) return;
  refreshActorSheet(combatant.actor);
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

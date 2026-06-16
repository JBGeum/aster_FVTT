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
import { resolveOpposed } from "./helpers/roll-result.mjs";
import { DAMAGE_STATUSES, applyDamageAndStatus } from "./helpers/health-status.mjs";
import { applyAsterTheme } from "./helpers/theme.mjs";

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

  const existing = actor.items.find((i) => i.type === item.type);
  if (!existing) return true;

  // food(I1b): 하드 차단 대신 교체 다이얼로그. preCreateItem 반환값은 *동기*로 검사되어
  // Promise를 반환해도 취소되지 않으므로, 여기서 차단(false)하고 비동기 교체 흐름을 띄운다.
  if (item.type === "food") {
    void promptFoodReplace(actor, existing, item.toObject());
    return false;
  }

  // 그 외 싱글톤(bag): 기존대로 하드 차단.
  ui.notifications.warn(
    game.i18n.format("ASTER.inventory.warn.singleton", {
      type: game.i18n.localize(`TYPES.Item.${item.type}`),
    }),
  );
  return false;
});

/**
 * I1b: food 교체 확인 흐름. preCreateItem이 동기로 차단한 뒤 fire-and-forget로 호출.
 * 확인 시 기존 food 삭제 → 신규 food 재생성. 삭제→생성 순서라 잠시도 2개 상태가 없다(1→0→1).
 * 재생성 시 preCreateItem이 다시 발화하지만 기존 food가 이미 삭제돼 정상 통과한다.
 *
 * @param {Actor} actor       대상 액터
 * @param {Item} existing     기존 food (교체 대상)
 * @param {object} newData    신규 food 생성 데이터 (item.toObject())
 */
async function promptFoodReplace(actor, existing, newData) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ASTER.food.replaceConfirmTitle") },
    content: `<div class="food-replace-confirm">
      <p>${game.i18n.localize("ASTER.food.replaceIntro")}</p>
      <p><strong>${game.i18n.localize("ASTER.food.existing")}</strong>: ${existing.name}</p>
      <p><strong>${game.i18n.localize("ASTER.food.incoming")}</strong>: ${newData.name}</p>
      <p class="proceed-q">${game.i18n.localize("ASTER.food.replaceProceed")}</p>
    </div>`,
  }).catch(() => false);

  if (!confirmed) {
    ui.notifications.info(game.i18n.format("ASTER.food.cancelled", { name: newData.name }));
    return;
  }

  delete newData._id; // 새 인스턴스로 생성
  await existing.delete();
  await actor.createEmbeddedDocuments("Item", [newData]);
}

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

      // 후속 카드 — 아스테르 획득(.aster-gain-card): 색별 칩으로 표시
      const chips = CRIT_COLORS.filter((k) => result[k] > 0)
        .map(
          (k) =>
            `<span class="gain-chip el-${k}"><i class="dot"></i>${game.i18n.localize(`ASTER.aster.${k}`)} +${result[k]}</span>`,
        )
        .join("");
      await ChatMessage.create({
        content: `<div class="aster-chat-card aster-gain-card">
          <header class="card-header"><div class="title">
            <div class="name">${game.i18n.localize("ASTER.roll.critGainTitle")}</div>
            <div class="formula">${actor.name} — ${game.i18n.localize("ASTER.roll.critical")}</div>
          </div></header>
          <div class="gain-body"><div class="gain-chips">${chips}</div></div>
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
      // 후속 카드 — 경계도 상승(.alert-rise-card). rolls 배열로 다이스 애니메이션 트리거.
      await ChatMessage.create({
        content: `<div class="aster-chat-card alert-rise-card">
          <header class="card-header"><div class="title">
            <div class="name">${game.i18n.localize("ASTER.roll.alertRiseTitle")}</div>
            <div class="formula">${game.i18n.localize("ASTER.roll.fumble")} — +1d6</div>
          </div></header>
          <div class="alert-body">
            <div class="alert-roll">
              <span class="die">[${roll.total}]</span>
              <span class="delta">${game.i18n.localize("ASTER.world.alert")} +${roll.total}</span>
            </div>
            <div class="alert-total">
              <span class="label">${game.i18n.localize("ASTER.roll.alertCumulative")}</span>
              <span class="value">${next}</span>
            </div>
          </div>
        </div>`,
        rolls: [roll],
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
 * 대미지 적용 결과 카드 렌더링. applyDamageFromCard / applyDamageFromOpposed 공통 사용.
 *
 * @param {Actor} targetActor
 * @param {{amount: number, hBefore: number, hAfter: number, statusApplied: string[], defendReduced: {roll:number,original:number,adjusted:number}|null, yellowReduction?: {type:"block"|"reduction",original:number,reduction?:number,adjusted:number}|null}} info
 */
async function renderDamageResultCard(
  targetActor,
  { amount, hBefore, hAfter, statusApplied, defendReduced, yellowReduction },
) {
  const lines = [];
  // 방어 차감은 건강 라인보다 앞 — 룰적 시점 순서(차감 → 황표 차감 → 건강 적용).
  if (defendReduced) {
    lines.push(
      game.i18n.format("ASTER.damage.defendLine", {
        original: defendReduced.original,
        roll: defendReduced.roll,
        adjusted: defendReduced.adjusted,
      }),
    );
  }
  // 황표 차감·무효 — 방어 차감 뒤, 건강 라인 앞.
  if (yellowReduction) {
    if (yellowReduction.type === "block") {
      lines.push(
        game.i18n.format("ASTER.damage.yellowBlockLine", {
          original: yellowReduction.original,
        }),
      );
    } else {
      lines.push(
        game.i18n.format("ASTER.damage.yellowReductionLine", {
          original: yellowReduction.original,
          reduction: yellowReduction.reduction,
          adjusted: yellowReduction.adjusted,
        }),
      );
    }
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

  const { hBefore, hAfter, statusApplied, defendReduced, yellowReduction } =
    await applyDamageAndStatus(targetActor, result.amount, result.status);

  // flag 갱신 — 중복 적용 방지
  const flagKey = combatAction ? "combatAction" : "spellCast";
  await message.setFlag("aster", flagKey, { ...data, damageApplied: true });

  await renderDamageResultCard(targetActor, {
    amount: result.amount,
    hBefore,
    hAfter,
    statusApplied,
    defendReduced,
    yellowReduction,
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

  const { hBefore, hAfter, statusApplied, defendReduced, yellowReduction } =
    await applyDamageAndStatus(targetActor, result.amount, result.status);

  // 중복 적용 방지
  await message.setFlag("aster", "opposedDamage", { ...data, damageApplied: true });

  await renderDamageResultCard(targetActor, {
    amount: result.amount,
    hBefore,
    hAfter,
    statusApplied,
    defendReduced,
    yellowReduction,
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

// 라운드 시작 처리(이니셔티브 갱신 + 액션 포인트 굴림 + 채팅 카드)는
// AsterCombat._onStartRound 오버라이드가 담당한다 — `combatRound`/`combatStart` 훅은
// nextRound의 turn=0 커밋 "이전"에 발화해, 그 안에서 combatant를 수정하면 turn 포인터가
// 직전 라운드 마지막 전투원에 고정되는 버그가 있었다(C>C>C). 라이프사이클 메서드는
// turn 확정 이후 발화하므로 안전하다.
// combatStart 훅은 전투원 시트 재렌더("전투 중" 상태 즉시 반영, 모든 클라이언트)만 담당.
Hooks.on("combatStart", (combat) => {
  if (combat instanceof AsterCombat) refreshCombatSheets(combat);
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

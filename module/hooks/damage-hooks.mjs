/**
 * import 시 top-level에서 Hooks.on("renderChatMessageHTML", ...) 1건을 등록한다(부수효과).
 */
import {
  DAMAGE_STATUSES,
  badstatusI18nKey,
  applyDamageAndStatus,
} from "../helpers/health-status.mjs";
import { resolveOpposed } from "../helpers/roll-result.mjs";
import { resolveActor } from "../helpers/actor-resolve.mjs";

/* -------------------------------------------- */
/*  대결판정 결합 (능동/수동 지정 → 결과 카드)    */
/* -------------------------------------------- */

// 모듈 스코프 상태: pending 능동측 메시지 ID와 데이터.
// 단순 메모리 — 새로고침 시 사라지나, 다시 [능동 지정]을 누르면 됨.
let pendingOpposed = null;

/**
 * 대상 후보 — 현재 씬의 토큰. 카드가 지목한 대상이 씬에 없으면 그것도 함께 담는다.
 *
 * @param {Actor} targetActor
 * @returns {{uuid: string, name: string}[]}
 */
function damageTargetOptions(targetActor) {
  const rows = [];
  for (const token of canvas.scene?.tokens ?? []) {
    if (!token.actor) continue;
    rows.push({ uuid: token.actor.uuid, name: token.name });
  }
  if (!rows.some((r) => r.uuid === targetActor.uuid)) {
    rows.unshift({ uuid: targetActor.uuid, name: targetActor.name });
  }
  return rows;
}

/**
 * @param {Actor} targetActor
 * @param {number} defaultDamage
 * @returns {Promise<{formula: string, status: string[], targetUuid: string}|null>}
 */
async function promptDamageDialog(targetActor, defaultDamage) {
  const statusRows = DAMAGE_STATUSES.map(
    (s) =>
      `<label><input type="checkbox" name="status" value="${s.key}" /> ${game.i18n.localize(badstatusI18nKey(s.key))}</label>`,
  ).join("");
  const targetRows = damageTargetOptions(targetActor)
    .map(
      (r) =>
        `<option value="${r.uuid}"${r.uuid === targetActor.uuid ? " selected" : ""}>${foundry.utils.escapeHTML(r.name)}</option>`,
    )
    .join("");

  return foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("ASTER.damage.dialogTitle") },
    content: `
      <div class="form-group">
        <label>${game.i18n.localize("ASTER.damage.targetLabel")}</label>
        <select name="target">${targetRows}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("ASTER.damage.amount")}</label>
        <input type="text" name="amount" value="${defaultDamage}" />
        <p class="hint">${game.i18n.localize("ASTER.damage.amountHint")}</p>
      </div>
      <fieldset class="damage-status-group">
        <legend>${game.i18n.localize("ASTER.damage.inflictLegend")}</legend>
        ${statusRows}
      </fieldset>
    `,
    ok: {
      callback: (_e, b) => ({
        formula: b.form.elements.amount.value.trim(),
        targetUuid: b.form.elements.target.value,
        status: Array.from(b.form.querySelectorAll('input[name="status"]:checked')).map(
          (el) => el.value,
        ),
      }),
    },
  }).catch(() => null);
}

/**
 * 대미지 입력을 수치로 만든다. 순수 숫자는 그대로, 그 밖은 다이스 식으로 굴린다.
 * 식은 평가에 실패하면 throw한다 — 호출부가 오타로 보고 다시 묻는다.
 *
 * @param {string} formula
 * @returns {Promise<{amount: number, rollText: string}>} rollText는 식일 때만 채워진다.
 */
async function evaluateDamageInput(formula) {
  if (!formula) return { amount: 0, rollText: "" };

  const n = Number(formula);
  if (Number.isFinite(n)) return { amount: Math.max(0, Math.trunc(n)), rollText: "" };

  const roll = new Roll(formula);
  await roll.evaluate();
  // 다이스 없는 식(3+2)이면 눈이 비어 표기를 생략한다.
  const faces = roll.dice.flatMap((d) => d.values);
  const facesText = faces.length ? ` [${faces.join(", ")}]` : "";
  return { amount: Math.max(0, roll.total), rollText: `${formula} = ${roll.total}${facesText}` };
}

/**
 * 취소면 null. 식이 틀리면 한 번 더 묻는다 — pickTwoIfNeeded와 같은 1회 재시도다.
 *
 * @param {Actor} targetActor
 * @param {number} defaultDamage
 * @returns {Promise<{amount: number, rollText: string, status: string[], targetUuid: string} | null>}
 */
async function promptDamage(targetActor, defaultDamage) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const input = await promptDamageDialog(targetActor, defaultDamage);
    if (input === null) return null;
    try {
      const { amount, rollText } = await evaluateDamageInput(input.formula);
      return { amount, rollText, status: input.status, targetUuid: input.targetUuid };
    } catch {
      ui.notifications.warn(
        game.i18n.format("ASTER.damage.warn.badFormula", { formula: input.formula }),
      );
    }
  }
  return null;
}

/**
 * @param {Actor} targetActor
 * @param {{amount: number, hBefore: number, hAfter: number, statusApplied: string[], defendReduced: {roll:number,original:number,adjusted:number}|null, yellowReduction?: {type:"block"|"reduction",original:number,reduction?:number,adjusted:number}|null}} info
 */
async function renderDamageResultCard(
  targetActor,
  { amount, rollText, hBefore, hAfter, statusApplied, defendReduced, yellowReduction },
) {
  const lines = [];
  // 굴림은 방어 차감보다 앞 — 굴린 값이 차감의 입력이다.
  if (rollText) lines.push(game.i18n.format("ASTER.damage.rollLine", { text: rollText }));
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
    const names = statusApplied.map((k) => game.i18n.localize(badstatusI18nKey(k)));
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
 * @param {ChatMessage} message
 * @param {{data: object, flagKey: string}} card  카드 종류별로 읽어 온 flag와 그 키
 */
async function applyDamage(message, { data, flagKey }) {
  // 막지 않고 알린다 — 입력 오타로 0이 들어가도 다시 적용할 수 있어야 한다.
  if (data.damageApplied) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.alreadyApplied"));
  }
  if (!data.targetActorId) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.noTarget"));
    return;
  }
  const targetActor = resolveActor({ uuid: data.targetActorUuid, id: data.targetActorId });
  if (!targetActor) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.targetNotFound"));
    return;
  }

  const result = await promptDamage(targetActor, data.defaultDamage ?? 0);
  if (result === null) return; // 취소·식 오류

  // 카드 flag의 대상은 그대로 둔다 — 이력이고, 다이얼로그에서 바꾼 것은 이번 적용에만 쓴다.
  const applyTo = resolveActor({ uuid: result.targetUuid, id: null }) ?? targetActor;

  const { hBefore, hAfter, statusApplied, defendReduced, yellowReduction } =
    await applyDamageAndStatus(applyTo, result.amount, result.status);

  await message.setFlag("aster", flagKey, { ...data, damageApplied: true });

  await renderDamageResultCard(applyTo, {
    amount: result.amount,
    rollText: result.rollText,
    hBefore,
    hAfter,
    statusApplied,
    defendReduced,
    yellowReduction,
  });
}

/**
 * @param {ChatMessage} message
 */
async function applyDamageFromCard(message) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
    return;
  }

  const combatAction = message.getFlag("aster", "combatAction");
  const data = combatAction ?? message.getFlag("aster", "spellCast");
  if (!data) {
    ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.noCardData"));
    return;
  }
  await applyDamage(message, { data, flagKey: combatAction ? "combatAction" : "spellCast" });
}

/**
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
  await applyDamage(message, { data, flagKey: "opposedDamage" });
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  // 결합 버튼은 모두 GM 전용 — 비-GM 뷰어에게는 footer 통째 제거 후 종료.
  if (!game.user.isGM) {
    html.querySelector(".opposed-actions")?.remove();
    html.querySelector(".damage-actions")?.remove();
    return;
  }

  html.querySelectorAll("[data-action='apply-damage']").forEach((btn) => {
    btn.addEventListener("click", () => applyDamageFromCard(message));
  });

  html.querySelectorAll("[data-action='apply-damage-opposed']").forEach((btn) => {
    btn.addEventListener("click", () => applyDamageFromOpposed(message));
  });

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

      // 룰 "판정에 실패하면 졸림 해제" — 대결에서는 패배가 실패다.
      // 굴림 시점의 페널티 적용 여부는 flag에 없어 패자의 현재 상태로 판단한다.
      const loser = result.winner === "active" ? passive : active;
      const loserActor = resolveActor({ uuid: loser.actorUuid, id: loser.actorId });
      if (loserActor?.system?.badstatus?.sleepy) {
        await loserActor.update({ "system.badstatus.sleepy": false });
      }

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
                  targetActorUuid: dodger.actorUuid ?? null,
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

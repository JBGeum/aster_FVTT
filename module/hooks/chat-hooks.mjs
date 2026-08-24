/**
 * 채팅 카드 훅 — 크리티컬 결과 편집 + 데미지 적용 카드.
 * import 시 top-level에서 Hooks.on("renderChatMessageHTML", ...) 2건을 등록한다(부수효과).
 */
import { DAMAGE_STATUSES, applyDamageAndStatus } from "../helpers/health-status.mjs";
import { resolveOpposed } from "../helpers/roll-result.mjs";
import { applyDelta, applySet } from "../helpers/tracker-ops.mjs";
import { commitTrackers } from "../helpers/tracker-commit.mjs";
import { rangeFormula } from "../helpers/range-roll.mjs";

/* -------------------------------------------- */
/*  대성공/대실패 후속 버튼                      */
/* -------------------------------------------- */

const CRIT_COLORS = ["red", "blue", "white", "yellow", "green"];

Hooks.on("renderChatMessageHTML", (_message, html) => {
  // 경계도·트래커 버튼은 GM 전용 — 비-GM 뷰어에게는 제거한다.
  // (crit-aster-gain은 owner/PL용이므로 이 훅 자체를 early-return하지 않는다.)
  if (!game.user.isGM) {
    html
      .querySelectorAll(
        "[data-action='fumble-alert'], [data-action='tracker-sum'], [data-action='spell-alert']",
      )
      .forEach((btn) => {
        const footer = btn.closest("footer");
        btn.remove();
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

      const update = {};
      for (const k of CRIT_COLORS) {
        if (result[k] > 0) {
          const cur = actor.system.aster?.[k]?.value ?? 0;
          update[`system.aster.${k}.value`] = cur + result[k];
        }
      }
      await actor.update(update);

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
      // rolls 배열이 있어야 다이스 애니메이션이 트리거된다.
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

  // ----- 마법: 경계도 범위를 굴려 가산 (GM 전용) -----
  html.querySelectorAll("[data-action='spell-alert']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
        return;
      }
      const min = Number(btn.dataset.alertMin) || 0;
      const max = Number(btn.dataset.alertMax) || 0;
      if (min > max) {
        ui.notifications.warn(game.i18n.localize("ASTER.world.invalidRange"));
        return;
      }
      const roll = new Roll(rangeFormula(min, max));
      await roll.evaluate();
      const cur = Number(game.settings.get("aster", "alertLevel")) || 0;
      const next = cur + roll.total;
      await game.settings.set("aster", "alertLevel", next);
      const sign = roll.total < 0 ? "" : "+";
      await ChatMessage.create({
        content: `<div class="aster-chat-card alert-rise-card">
          <header class="card-header"><div class="title">
            <div class="name">${game.i18n.localize("ASTER.roll.alertRiseTitle")}</div>
            <div class="formula">${game.i18n.format("ASTER.spell.alertRiseFrom", {
              name: btn.dataset.spellName,
              min,
              max,
            })}</div>
          </div></header>
          <div class="alert-body">
            <div class="alert-roll">
              <span class="die">[${roll.total}]</span>
              <span class="delta">${game.i18n.localize("ASTER.world.alert")} ${sign}${roll.total}</span>
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

  // ----- 판정 달성치를 트래커에 합산 (GM 전용) -----
  html.querySelectorAll("[data-action='tracker-sum']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
        return;
      }
      const trackers = game.settings.get("aster", "trackers");
      if (trackers.length === 0) {
        ui.notifications.warn(game.i18n.localize("ASTER.tracker.noTrackers"));
        return;
      }

      const rows = trackers
        .map(
          (t, i) => `
          <label class="tracker-pick">
            <input type="radio" name="tracker" value="${t.id}" ${i === 0 ? "checked" : ""} />
            ${t.name} — ${t.value}${t.goal != null ? ` / ${t.goal}` : ""}
          </label>`,
        )
        .join("");

      const total = Number(btn.dataset.total) || 0;
      const r = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("ASTER.tracker.sumTitle") },
        content: `
          <p class="tracker-sum-hint">${game.i18n.format("ASTER.tracker.sumHint", { total })}</p>
          <div class="tracker-pick-list">${rows}</div>
          <label class="tracker-to-goal">
            <input type="checkbox" name="toGoal" />
            ${game.i18n.localize("ASTER.tracker.toGoal")}
          </label>
        `,
        ok: {
          label: game.i18n.localize("ASTER.tracker.sumConfirm"),
          callback: (_e, b) => ({
            id: b.form.elements.tracker.value,
            toGoal: b.form.elements.toGoal.checked,
          }),
        },
      }).catch(() => null);
      if (!r) return;

      // 목표가 없는 트래커에는 "목표값으로 설정"이 성립하지 않으므로 달성치를 가산한다.
      const picked = trackers.find((t) => t.id === r.id);
      const result =
        r.toGoal && picked.goal != null
          ? applySet(trackers, r.id, picked.goal)
          : applyDelta(trackers, r.id, total);
      await commitTrackers(r.id, result);
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
 * 대미지 적용 결과 카드 렌더링.
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

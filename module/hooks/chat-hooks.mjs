/**
 * import 시 top-level에서 Hooks.on("renderChatMessageHTML", ...)와
 * Hooks.on("updateActor", ...) 2건을 등록한다(부수효과).
 */
import { applyDelta, applySet } from "../helpers/tracker-ops.mjs";
import { commitTrackers } from "../helpers/tracker-commit.mjs";
import { rangeFormula } from "../helpers/range-roll.mjs";
import { resolveActor } from "../helpers/actor-resolve.mjs";
import {
  postAsterGrantCard,
  runAsterPick,
  replacePickedRow,
  refreshGrantCard,
  colorPickGridHTML,
} from "../helpers/aster-grant.mjs";
import { PICK_COLORS } from "../helpers/aster-grant-ops.mjs";

/* -------------------------------------------- */
/*  대성공/대실패 후속 버튼                      */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
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
      const actor = resolveActor({ uuid: btn.dataset.actorUuid, id: btn.dataset.actorId });
      if (!actor) return;

      // 권한 체크: 본인 또는 GM만(룰: 대성공 아스테르 2개는 PL이 색 선택)
      if (!actor.isOwner) {
        ui.notifications.warn(game.i18n.localize("ASTER.roll.critOwnerOnly"));
        return;
      }

      const result = await foundry.applications.api.DialogV2.prompt({
        classes: ["hb-dialog"],
        window: {
          title: game.i18n.localize("ASTER.roll.critGainTitle"),
          icon: "fa-solid fa-star",
        },
        position: { width: 420 },
        content: `<p class="crit-gain-hint">${game.i18n.localize("ASTER.roll.critGainHint")}</p>${colorPickGridHTML(PICK_COLORS, 2)}`,
        ok: {
          icon: "fa-solid fa-check",
          label: game.i18n.localize("ASTER.roll.critGain"),
          callback: (_e, b) =>
            Object.fromEntries(
              PICK_COLORS.map((k) => [k, Math.max(0, Number(b.form.elements[k].value) || 0)]),
            ),
        },
      }).catch(() => null);
      if (!result) return;

      const total = Object.values(result).reduce((a, n) => a + n, 0);
      if (total !== 2) {
        ui.notifications.warn(game.i18n.localize("ASTER.roll.critGainTotal2"));
        return;
      }

      const update = {};
      for (const k of PICK_COLORS) {
        if (result[k] > 0) {
          const cur = actor.system.aster?.[k]?.value ?? 0;
          update[`system.aster.${k}.value`] = cur + result[k];
        }
      }
      await actor.update(update);

      await postAsterGrantCard(
        [
          {
            actorId: actor.id,
            name: actor.name,
            favColor: null,
            gains: { ...result, white: 0 },
            any: 0,
            bonus: null,
          },
        ],
        {
          subtitle: `${actor.name} — ${game.i18n.localize("ASTER.roll.critical")}`,
          speaker: ChatMessage.getSpeaker({ actor }),
          crit: true,
        },
      );
    });
  });

  // ----- 임의 지급: PL이 색 선택 -----
  html.querySelectorAll("[data-action='aster-pick']").forEach((btn) => {
    const actor = resolveActor({ uuid: btn.dataset.actorUuid, id: btn.dataset.actorId });
    const picked = actor?.getFlag("aster", `grant.${message.id}`);
    if (picked) {
      replacePickedRow(btn, picked);
      return;
    }
    if (!actor?.isOwner) {
      btn.remove();
      return;
    }
    btn.addEventListener("click", () => runAsterPick(message, btn));
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

  // ----- 돌던지기: 시전자가 명중을 굴린다 -----
  html.querySelectorAll("[data-action='roll-hit']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const data = message.getFlag("aster", "combatAction");
      if (!data) return;
      const actor = resolveActor({ uuid: data.sourceActorUuid, id: data.sourceActorId });
      if (!actor) {
        ui.notifications.warn(game.i18n.localize("ASTER.damage.warn.targetNotFound"));
        return;
      }
      if (!actor.isOwner) {
        ui.notifications.warn(game.i18n.localize("ASTER.hit.ownerOnly"));
        return;
      }
      await actor.rollHit();
    });
  });
});

/* -------------------------------------------- */
/*  임의 지급 수령을 모든 화면에 반영             */
/* -------------------------------------------- */

// PL은 남의 메시지를 못 고치므로 GM 하나가 대신 다시 그린다.
Hooks.on("updateActor", (_actor, changed) => {
  const picks = changed?.flags?.aster?.grant;
  if (!picks || game.users.activeGM !== game.user) return;
  for (const messageId of Object.keys(picks)) {
    const message = game.messages.get(messageId);
    if (message) refreshGrantCard(message);
  }
});

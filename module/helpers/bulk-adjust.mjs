/** GM 패널 "일괄 조정" 흐름. UI 오케스트레이션이라 타입 검사 대상이 아니다. */
import { BADSTATUS_EFFECTS } from "./badstatus-effects.mjs";
import { clampDelta } from "./resource-clamp.mjs";

/** 시트 표시 순서 — BADSTATUS_EFFECTS의 정의 순서와 다르다. */
const STATUS_ORDER = ["injury", "bigInj", "sleepy", "exhaustion", "hungry"];

const RESOURCES = [
  { key: "health", label: "ASTER.label.health" },
  { key: "satiety", label: "ASTER.label.satiety" },
];

/**
 * 전투 룰(방어 차감·황표 감소·회복 차단)은 거치지 않는다 — GM이 지정한 수치를 그대로 반영한다.
 */
export async function runBulkAdjust() {
  const characters = game.actors.filter((a) => a.type === "character");
  if (characters.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.bulk.noCharacters"));
    return;
  }

  const targetRows = characters
    .map(
      (a) => `
      <label class="bulk-target">
        <input type="checkbox" name="target" value="${a.id}" checked />
        ${a.name}
      </label>`,
    )
    .join("");

  const resourceRows = RESOURCES.map(
    (r) => `
      <div class="form-group">
        <label>${game.i18n.localize(r.label)}</label>
        <input type="number" name="${r.key}" value="0" />
      </div>`,
  ).join("");

  const statusRows = STATUS_ORDER.map((key) => {
    const opts = ["apply", "cure", "keep"]
      .map(
        (mode) => `
        <label class="bulk-status-opt">
          <input type="radio" name="bs-${key}" value="${mode}" ${mode === "keep" ? "checked" : ""} />
          ${game.i18n.localize(`ASTER.bulk.${mode}`)}
        </label>`,
      )
      .join("");
    return `<div class="bulk-status-row">
      <span class="k">${game.i18n.localize(BADSTATUS_EFFECTS[key].name)}</span>${opts}
    </div>`;
  }).join("");

  const input = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("ASTER.bulk.title") },
    content: `
      <div class="bulk-section">
        <div class="bulk-legend">${game.i18n.localize("ASTER.bulk.targets")}</div>
        <div class="bulk-target-grid">${targetRows}</div>
      </div>
      <div class="bulk-section">
        <div class="bulk-legend">${game.i18n.localize("ASTER.bulk.resources")}</div>
        ${resourceRows}
      </div>
      <div class="bulk-section">
        <div class="bulk-legend">${game.i18n.localize("ASTER.bulk.badstatus")}</div>
        ${statusRows}
      </div>
    `,
    ok: {
      label: game.i18n.localize("ASTER.bulk.confirm"),
      callback: (_e, b) => ({
        targetIds: Array.from(b.form.querySelectorAll('input[name="target"]:checked')).map(
          (el) => el.value,
        ),
        deltas: Object.fromEntries(
          RESOURCES.map((r) => [r.key, Number(b.form.elements[r.key].value) || 0]),
        ),
        status: Object.fromEntries(
          STATUS_ORDER.map((key) => [key, b.form.elements[`bs-${key}`].value]),
        ),
      }),
    },
  }).catch(() => null);

  if (!input) return;
  if (input.targetIds.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.bulk.noSelection"));
    return;
  }

  const statusChanges = Object.entries(input.status).filter(([, mode]) => mode !== "keep");
  const hasResourceChange = RESOURCES.some((r) => input.deltas[r.key] !== 0);
  if (!hasResourceChange && statusChanges.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.bulk.noInput"));
    return;
  }

  const results = [];
  for (const id of input.targetIds) {
    const actor = game.actors.get(id);
    if (!actor) continue;

    const update = {};
    const resourceLines = [];
    for (const r of RESOURCES) {
      const delta = input.deltas[r.key];
      if (delta === 0) continue;
      const field = actor.system[r.key];
      const res = clampDelta(field?.value ?? 0, delta, field?.max ?? 0);
      if (res.delta === 0) continue;
      update[`system.${r.key}.value`] = res.after;
      resourceLines.push({ label: r.label, ...res });
    }

    const applied = [];
    const cured = [];
    for (const [key, mode] of statusChanges) {
      const next = mode === "apply";
      if ((actor.system.badstatus?.[key] === true) === next) continue;
      update[`system.badstatus.${key}`] = next;
      (next ? applied : cured).push(game.i18n.localize(BADSTATUS_EFFECTS[key].name));
    }

    if (Object.keys(update).length > 0) await actor.update(update);

    results.push({
      name: actor.name,
      resourceLines,
      applied,
      cured,
      healthZero: update["system.health.value"] === 0,
    });
  }

  const listHtml = results
    .map((r) => {
      const lines = r.resourceLines.map((l) =>
        game.i18n.format("ASTER.bulk.resourceLine", {
          label: game.i18n.localize(l.label),
          before: l.before,
          after: l.after,
          delta: l.delta > 0 ? `+${l.delta}` : String(l.delta),
        }),
      );
      if (r.applied.length) {
        lines.push(game.i18n.format("ASTER.bulk.appliedLine", { list: r.applied.join(", ") }));
      }
      if (r.cured.length) {
        lines.push(game.i18n.format("ASTER.bulk.curedLine", { list: r.cured.join(", ") }));
      }
      if (r.healthZero) {
        lines.push(`<span class="warn-zero">${game.i18n.localize("ASTER.bulk.healthZero")}</span>`);
      }
      if (lines.length === 0) lines.push(game.i18n.localize("ASTER.bulk.noChange"));
      return `<li><strong>${r.name}</strong><ul class="bulk-pc-detail">${lines
        .map((l) => `<li>${l}</li>`)
        .join("")}</ul></li>`;
    })
    .join("");

  await ChatMessage.create({
    content: `<div class="aster-chat-card bulk-adjust-card">
      <header class="card-header"><div class="title"><div class="name">
        ${game.i18n.localize("ASTER.bulk.cardTitle")}
      </div></div></header>
      <ul class="bulk-target-list">${listHtml}</ul>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
  });
}

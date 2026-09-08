import {
  buildGrantRows,
  applySpecialtyBonus,
  validateGrantEntries,
  GRANT_COLORS,
  PICK_COLORS,
} from "./aster-grant-ops.mjs";
import { resolveActor } from "./actor-resolve.mjs";

function chipHTML(chip) {
  const label = game.i18n.localize(`ASTER.aster.${chip.color}`);
  return `<span class="gain-chip el-${chip.color}"><i class="dot"></i>${label} ${chip.n}</span>`;
}

function anyPartHTML(row) {
  const actor = row.actorId ? game.actors.get(row.actorId) : null;
  const label = game.i18n.format("ASTER.grant.anyChip", { n: row.any });
  return `<span class="gain-chip el-any">${label}</span>
    <button type="button" data-action="aster-pick" data-actor-id="${row.actorId ?? ""}"
      data-actor-uuid="${actor?.uuid ?? ""}" data-count="${row.any}">
      ${game.i18n.localize("ASTER.grant.pick")}
    </button>`;
}

function pickedPartHTML(row, picked) {
  const chips = PICK_COLORS.filter((c) => (picked[c] ?? 0) > 0)
    .map((c) => chipHTML({ color: c, n: picked[c] }))
    .join("");
  const label = game.i18n.format("ASTER.grant.anyChip", { n: row.any });
  return `<span class="gain-chip el-any">${label}</span>
    <span class="grant-arrow">→</span>${chips}`;
}

function grantRowHTML(row, picked = null) {
  const names = foundry.utils.escapeHTML(row.names.join(" · "));
  const chips = row.chips.map(chipHTML).join("");
  const bonus = row.bonus
    ? `<span class="gain-bonus">${game.i18n.localize("ASTER.grant.bonusNote")}</span>`
    : "";
  let any = "";
  if (row.any > 0) any = picked ? pickedPartHTML(row, picked) : anyPartHTML(row);
  return `<div class="grant-row">
    <span class="grant-gains">${chips}${bonus}${any}</span>
    <span class="grant-names">${names}</span>
  </div>`;
}

function buildGrantCardHTML(rows, { subtitle = "", crit = false, pickedByActor = {} } = {}) {
  const sub = subtitle ? `<div class="formula">${foundry.utils.escapeHTML(subtitle)}</div>` : "";
  return `<div class="aster-chat-card aster-grant-card${crit ? " from-crit" : ""}">
    <header class="card-header"><div class="title">
      <div class="name">${game.i18n.localize("ASTER.grant.cardTitle")}</div>
      ${sub}
    </div></header>
    <div class="grant-body">${rows
      .map((row) => grantRowHTML(row, pickedByActor[row.actorId] ?? null))
      .join("")}</div>
  </div>`;
}

export async function postAsterGrantCard(entries, { subtitle = "", speaker, crit = false } = {}) {
  const rows = buildGrantRows(entries);
  const content = buildGrantCardHTML(rows, { subtitle, crit });
  const flags = rows.some((row) => row.any > 0)
    ? { aster: { grant: { entries, subtitle, crit } } }
    : undefined;
  await ChatMessage.create({ content, speaker, flags });
}

export async function refreshGrantCard(message) {
  const data = message.getFlag("aster", "grant");
  if (!data?.entries) return;

  const rows = buildGrantRows(data.entries);
  const pickedByActor = {};
  for (const row of rows) {
    if (!row.actorId || row.any <= 0) continue;
    const picked = game.actors.get(row.actorId)?.getFlag("aster", `grant.${message.id}`);
    if (picked) pickedByActor[row.actorId] = picked;
  }

  await message.update({
    content: buildGrantCardHTML(rows, {
      subtitle: data.subtitle,
      crit: data.crit,
      pickedByActor,
    }),
  });
}

function colorHeadHTML(colors, { any = false } = {}) {
  const cells = colors
    .map(
      (c) =>
        `<span class="pick-head el-${c}"><i class="dot"></i>${game.i18n.localize(
          `ASTER.aster.${c}`,
        )}</span>`,
    )
    .join("");
  const anyCell = any
    ? `<span class="pick-head">${game.i18n.localize("ASTER.grant.anyLabel")}</span>`
    : "";
  return cells + anyCell;
}

function colorInputsHTML(colors, { prefix = "", max = 5, any = false } = {}) {
  const cells = colors
    .map((c) => `<input type="number" name="${prefix}${c}" value="0" min="0" max="${max}" />`)
    .join("");
  const anyCell = any
    ? `<input type="number" class="pick-any" name="${prefix}any" value="0" min="0" max="5" />`
    : "";
  return cells + anyCell;
}

export function colorPickGridHTML(colors, max) {
  return `<div class="pick-grid" style="--pick-cols: ${colors.length}">
    ${colorHeadHTML(colors)}${colorInputsHTML(colors, { max })}
  </div>`;
}

function renderGrantInputs(form, state) {
  const box = form.querySelector(".grant-inputs");
  if (!box) return;
  for (const el of box.querySelectorAll("input")) state[el.name] = el.value;

  const each = form.querySelector('input[name="mode"][value="each"]')?.checked;
  const head = `<span></span>${colorHeadHTML(GRANT_COLORS, { any: true })}`;

  let body;
  if (each) {
    const ids = Array.from(form.querySelectorAll('input[name="target"]:checked')).map(
      (el) => el.value,
    );
    body = ids
      .map((id) => {
        const name = foundry.utils.escapeHTML(game.actors.get(id)?.name ?? id);
        return `<span class="grant-pc-name">${name}</span>${colorInputsHTML(GRANT_COLORS, {
          prefix: `pc-${id}-`,
          any: true,
        })}`;
      })
      .join("");
  } else {
    body = `<span class="grant-pc-name">${game.i18n.localize("ASTER.grant.modeSame")}</span>${colorInputsHTML(
      GRANT_COLORS,
      { prefix: "all-", any: true },
    )}`;
  }

  box.innerHTML = `<div class="grant-grid" style="--pick-cols: ${GRANT_COLORS.length + 1}">${head}${body}</div>`;

  for (const el of box.querySelectorAll("input")) {
    const value = state[el.name] ?? state[el.name.replace(/^pc-[^-]+-/, "all-")];
    if (value !== undefined) el.value = value;
  }
}

async function promptGrant(characters) {
  const inputState = {};
  const targetRows = characters
    .map(
      (a) => `
      <label class="bulk-target">
        <input type="checkbox" name="target" value="${a.id}" checked />
        ${foundry.utils.escapeHTML(a.name)}
      </label>`,
    )
    .join("");

  return foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: {
      title: game.i18n.localize("ASTER.grant.dialogTitle"),
      icon: "fa-solid fa-star",
    },
    position: { width: 660 },
    content: `
      <div class="bulk-section">
        <div class="form-label">${game.i18n.localize("ASTER.grant.targets")}</div>
        <div class="bulk-target-grid">${targetRows}</div>
      </div>
      <div class="bulk-section">
        <div class="form-label">${game.i18n.localize("ASTER.grant.mode")}</div>
        <div class="grant-mode">
          <label><input type="radio" name="mode" value="same" checked />
            ${game.i18n.localize("ASTER.grant.modeSame")}</label>
          <label><input type="radio" name="mode" value="each" />
            ${game.i18n.localize("ASTER.grant.modeEach")}</label>
        </div>
      </div>
      <div class="bulk-section">
        <div class="grant-inputs"></div>
      </div>
      <div class="bulk-section">
        <label class="grant-emo"><input type="checkbox" name="emoMode" />
          ${game.i18n.localize("ASTER.grant.emoMode")}</label>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("ASTER.grant.reason")}</label>
        <input type="text" name="reason" value="" />
      </div>
    `,
    render: (_event, dialog) => {
      const el = dialog?.element ?? dialog;
      const form = el?.querySelector?.("form") ?? el;
      if (!form?.querySelector) return;
      renderGrantInputs(form, inputState);
      form.addEventListener("change", (ev) => {
        const name = ev.target?.name;
        if (name === "mode" || name === "target") renderGrantInputs(form, inputState);
      });
    },
    ok: {
      icon: "fa-solid fa-check",
      label: game.i18n.localize("ASTER.grant.confirm"),
      callback: (_e, button) => {
        const form = button.form;
        const targetIds = Array.from(form.querySelectorAll('input[name="target"]:checked')).map(
          (el) => el.value,
        );
        const each = form.querySelector('input[name="mode"][value="each"]')?.checked;
        const num = (name) => Math.max(0, Number(form.elements[name]?.value) || 0);
        const read = (prefix) => ({
          gains: Object.fromEntries(GRANT_COLORS.map((c) => [c, num(`${prefix}${c}`)])),
          any: num(`${prefix}any`),
        });
        return {
          targetIds,
          perTarget: Object.fromEntries(
            targetIds.map((id) => [id, each ? read(`pc-${id}-`) : read("all-")]),
          ),
          emoMode: form.elements.emoMode.checked,
          reason: form.elements.reason.value.trim(),
        };
      },
    },
  }).catch(() => null);
}

export async function runAsterGrant() {
  const characters = game.actors.filter((a) => a.type === "character");
  if (characters.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.bulk.noCharacters"));
    return;
  }

  const input = await promptGrant(characters);
  if (!input) return;
  if (input.targetIds.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.grant.warn.noTargets"));
    return;
  }

  const entries = input.targetIds.map((id) => {
    const actor = game.actors.get(id);
    const { gains, any } = input.perTarget[id];
    return {
      actorId: id,
      name: actor?.name ?? id,
      favColor: input.emoMode ? (actor?.system?.color ?? null) : null,
      gains,
      any,
      bonus: null,
    };
  });

  const check = validateGrantEntries(entries);
  if (!check.ok) {
    ui.notifications.warn(
      game.i18n.format("ASTER.grant.warn.invalidTotal", {
        list: check.invalid.map((r) => `${r.name}(${r.total})`).join(", "),
      }),
    );
    return;
  }

  const granted = applySpecialtyBonus(entries);

  for (const entry of granted) {
    const actor = game.actors.get(entry.actorId);
    if (!actor) continue;
    const update = {};
    for (const c of GRANT_COLORS) {
      if (entry.gains[c] > 0) {
        update[`system.aster.${c}.value`] = (actor.system.aster?.[c]?.value ?? 0) + entry.gains[c];
      }
    }
    if (Object.keys(update).length > 0) await actor.update(update);
  }

  await postAsterGrantCard(granted, {
    subtitle: input.reason,
    speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
  });
}

async function promptPick(count) {
  return foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.grant.pickTitle"), icon: "fa-solid fa-star" },
    position: { width: 420 },
    content: `<p class="crit-gain-hint">${game.i18n.format("ASTER.grant.pickHint", { n: count })}</p>${colorPickGridHTML(PICK_COLORS, count)}`,
    ok: {
      icon: "fa-solid fa-check",
      label: game.i18n.localize("ASTER.grant.confirm"),
      callback: (_e, b) =>
        Object.fromEntries(
          PICK_COLORS.map((c) => [c, Math.max(0, Number(b.form.elements[c].value) || 0)]),
        ),
    },
  }).catch(() => null);
}

export function replacePickedRow(button, picked) {
  const anyChip = button.closest(".grant-gains")?.querySelector(".gain-chip.el-any");
  if (anyChip) {
    anyChip.outerHTML = pickedPartHTML({ any: Number(button.dataset.count) || 0 }, picked);
  }
  button.remove();
}

export async function runAsterPick(message, button) {
  const actor = resolveActor({ uuid: button.dataset.actorUuid, id: button.dataset.actorId });
  if (!actor) return;
  if (!actor.isOwner) {
    ui.notifications.warn(game.i18n.localize("ASTER.roll.critOwnerOnly"));
    return;
  }
  const flagKey = `grant.${message.id}`;
  if (actor.getFlag("aster", flagKey)) {
    ui.notifications.warn(game.i18n.localize("ASTER.grant.warn.alreadyPicked"));
    return;
  }

  const count = Number(button.dataset.count) || 0;
  const picked = await promptPick(count);
  if (!picked) return;

  // 다이얼로그가 열려 있는 동안 GM이나 다른 창이 먼저 수령했을 수 있다.
  if (actor.getFlag("aster", flagKey)) {
    ui.notifications.warn(game.i18n.localize("ASTER.grant.warn.alreadyPicked"));
    return;
  }

  const total = PICK_COLORS.reduce((sum, c) => sum + picked[c], 0);
  if (total !== count) {
    ui.notifications.warn(game.i18n.format("ASTER.grant.warn.pickTotal", { n: count }));
    return;
  }

  const update = {};
  for (const c of PICK_COLORS) {
    if (picked[c] > 0) {
      update[`system.aster.${c}.value`] = (actor.system.aster?.[c]?.value ?? 0) + picked[c];
    }
  }
  await actor.update(update);
  await actor.setFlag("aster", flagKey, picked);
  replacePickedRow(button, picked);
}

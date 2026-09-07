import { CRAFT_TREE } from "./craft-tree.mjs";
import { validateCraft, craftItem, getCraftRequiresBaseList } from "./craft-item.mjs";

const CRAFT_ITEM_TYPES = ["consumable", "equipment", "bag", "food"];
// 인덱스 0은 마테리얼이라 색은 1부터.
const CRAFT_COST_COLORS = ["red", "blue", "green", "yellow", "white"];

/**
 * @param {Actor} actor
 */
export async function openCraftDialog(actor) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const result = await DialogV2.wait({
    classes: ["hb-dialog"],
    window: {
      title: game.i18n.localize("ASTER.craft.openCraftItem"),
      icon: "fa-solid fa-hammer",
    },
    position: { width: 540 },
    content: renderCraftDialogContent(),
    render: (_event, dialog) => wireCraftDialog(dialog, actor),
    buttons: [
      {
        action: "confirm",
        icon: "fa-solid fa-check",
        label: game.i18n.localize("ASTER.craft.confirm"),
        default: true,
        callback: (_e, _b, dialog) => collectCraftDraft(dialog.element),
      },
      { action: "cancel", label: game.i18n.localize("ASTER.craft.cancel") },
    ],
  }).catch(() => null);

  // 취소·입력 오류(이름 누락·JSON 오류)면 객체가 아님.
  if (!result || typeof result !== "object") return;

  const validation = validateCraft(result, actor);
  if (!validation.ok) {
    const proceed = await confirmCraftShortage(validation);
    if (!proceed) return;
  }
  const item = await craftItem(actor, result);
  if (item) {
    ui.notifications.info(game.i18n.format("ASTER.craft.success", { name: item.name }));
  }
}

/**
 * craftRequires 행 1개의 HTML 문자열. DialogV2가 content의 `<template>`를 새니타이즈로 제거하므로
 * 템플릿 복제 대신 이 함수로 매번 생성한다(추가 버튼·드래그 자동 채움 공용).
 */
function craftRequiresRowHTML() {
  const L = (k) => game.i18n.localize(k);
  const categoryLabels = Object.fromEntries(CRAFT_TREE.categories.map((c) => [c.id, c.label]));
  const byCategory = new Map();
  for (const item of getCraftRequiresBaseList()) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  const baseOptions = Array.from(byCategory.entries())
    .map(([cat, items]) => {
      const opts = items.map((it) => `<option value="${it.base}">${L(it.label)}</option>`).join("");
      return `<optgroup label="${L(categoryLabels[cat] ?? cat)}">${opts}</optgroup>`;
    })
    .join("");
  return `<div class="craft-requires-row flexrow align-center">
    <select name="requires-base">
      <option value="">${L("ASTER.craft.requiresSelect")}</option>
      ${baseOptions}
    </select>
    <input type="number" name="requires-level" value="0" min="0" />
    <button type="button" data-craft-action="removeRequires" title="${L("ASTER.craft.requiresRemove")}">×</button>
  </div>`;
}

function renderCraftDialogContent() {
  const L = (k) => game.i18n.localize(k);
  const typeOptions = CRAFT_ITEM_TYPES.map(
    (t) => `<option value="${t}">${L(`ASTER.itemType.${t}`)}</option>`,
  ).join("");
  const matCells = Array.from({ length: 6 }, (_v, i) => {
    return `<label class="material-cell"><span class="material-lbl">${L(
      `ASTER.item.material.label${i}`,
    )}</span><input type="number" name="material.${i}" value="0" min="0" /></label>`;
  }).join("");

  return `<div class="craft-dialog">
    <input type="hidden" name="img" value="" />
    <div class="form-group">
      <label>${L("ASTER.craft.itemType")}</label>
      <select name="itemType">${typeOptions}</select>
    </div>
    <div class="craft-drop-area" data-craft-drop="true">
      <p>${L("ASTER.craft.dropHint")}</p>
    </div>
    <div class="form-group">
      <label>${L("ASTER.item.name")}</label>
      <input type="text" name="name" value="" />
    </div>
    <div class="form-group">
      <label>${L("ASTER.item.material.title")}</label>
      <div class="material-grid flexrow align-center">${matCells}</div>
    </div>
    <div class="form-group">
      <label>${L("ASTER.item.effect")}</label>
      <input type="text" name="effect" value="" />
    </div>
    <div class="form-group">
      <label>${L("ASTER.craft.requiresLabel")}</label>
      <div class="craft-requires-rows"></div>
      <button type="button" data-craft-action="addRequires" class="craft-requires-add">
        + ${L("ASTER.craft.requiresAdd")}
      </button>
    </div>
    <div class="craft-cost-preview"></div>
  </div>`;
}

function wireCraftDialog(dialog, actor) {
  // V13 DialogV2 render 콜백 인자가 (event, dialog) 또는 (event, element)로 전달될 수 있어 둘 다 수용.
  const el = dialog?.element ?? dialog;
  if (!el?.querySelector) return;

  // DialogV2는 콜백 결과와 무관하게 창을 닫으므로 확정을 캡처 단계에서 막는다 — 확인은 클릭·Enter 두 경로다.
  const requireName = (event) => {
    if (event.type === "click" && !event.target?.closest?.('[data-action="confirm"]')) return;
    if (el.querySelector('input[name="name"]')?.value.trim()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ui.notifications.warn(game.i18n.localize("ASTER.craft.nameRequired"));
  };
  el.addEventListener("click", requireName, { capture: true });
  el.addEventListener("submit", requireName, { capture: true });

  const drop = el.querySelector("[data-craft-drop]");
  if (drop) {
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", async (event) => {
      event.preventDefault();
      drop.classList.remove("drag-over");
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      if (data?.type !== "Item") return;
      const source = await fromUuid(data.uuid);
      if (!source) return;
      if (!CRAFT_ITEM_TYPES.includes(source.type)) {
        ui.notifications.warn(game.i18n.localize("ASTER.craft.invalidType"));
        return;
      }
      fillCraftDraftFromItem(el, source);
      updateCraftCostPreview(el, actor);
    });
  }

  for (const input of el.querySelectorAll('input[name^="material."]')) {
    input.addEventListener("input", () => updateCraftCostPreview(el, actor));
  }
  updateCraftCostPreview(el, actor);

  // craftRequires 동적 행 — 추가·제거를 el 위임 + 캡처 단계로 처리.
  // 캡처 단계: DialogV2가 버블 단계에서 전파를 막아도 클릭을 먼저 받는다(버튼 무반응 회피).
  // 행 생성은 craftRequiresRowHTML() 문자열 삽입으로 — DialogV2가 `<template>`를 제거하기 때문.
  el.addEventListener(
    "click",
    (event) => {
      const t = event.target;
      if (!t?.closest) return;
      const addBtn = t.closest('[data-craft-action="addRequires"]');
      if (addBtn) {
        event.preventDefault();
        el.querySelector(".craft-requires-rows")?.insertAdjacentHTML(
          "beforeend",
          craftRequiresRowHTML(),
        );
        return;
      }
      const removeBtn = t.closest('[data-craft-action="removeRequires"]');
      if (removeBtn) {
        event.preventDefault();
        removeBtn.closest(".craft-requires-row")?.remove();
      }
    },
    true,
  );
}

function fillCraftDraftFromItem(el, source) {
  const sys = source.system ?? {};
  el.querySelector('select[name="itemType"]').value = source.type;
  el.querySelector('input[name="name"]').value = source.name;
  el.querySelector('input[name="img"]').value = source.img ?? "";
  for (let i = 0; i < 6; i++) {
    const input = el.querySelector(`input[name="material.${i}"]`);
    if (input) input.value = sys.material?.[i] ?? 0;
  }
  const effectInput = el.querySelector('input[name="effect"]');
  if (effectInput) effectInput.value = sys.effect ?? "";

  const rowsContainer = el.querySelector(".craft-requires-rows");
  if (rowsContainer) {
    rowsContainer.innerHTML = "";
    for (const [base, level] of Object.entries(sys.craftRequires ?? {})) {
      rowsContainer.insertAdjacentHTML("beforeend", craftRequiresRowHTML());
      const row = rowsContainer.lastElementChild;
      const sel = row?.querySelector('select[name="requires-base"]');
      const lvl = row?.querySelector('input[name="requires-level"]');
      if (sel) sel.value = base;
      if (lvl) lvl.value = level;
    }
  }
}

function readMaterialInputs(el) {
  const material = [];
  for (let i = 0; i < 6; i++) {
    const v = parseInt(el.querySelector(`input[name="material.${i}"]`)?.value, 10);
    material.push(Number.isFinite(v) ? v : 0);
  }
  return material;
}

function updateCraftCostPreview(el, actor) {
  const preview = el.querySelector(".craft-cost-preview");
  if (!preview) return;
  const mat = readMaterialInputs(el);
  const aster = actor.system.aster ?? {};
  const have = {
    material: actor.system.material ?? 0,
    ...Object.fromEntries(CRAFT_COST_COLORS.map((c) => [c, aster[c]?.value ?? 0])),
  };
  const L = (k) => game.i18n.localize(k);
  const lines = [];
  const pushLine = (label, cost, haveVal) => {
    if (cost <= 0) return;
    const short = cost > haveVal;
    lines.push(
      `<span class="cost-line${short ? " short" : ""}">${label} -${cost}${
        short ? ` (${L("ASTER.craft.short")})` : ""
      }</span>`,
    );
  };
  pushLine(L("ASTER.item.material.label0"), mat[0], have.material);
  CRAFT_COST_COLORS.forEach((c, i) => pushLine(L(`ASTER.aster.${c}`), mat[i + 1], have[c]));
  preview.innerHTML = lines.length
    ? lines.join(" ")
    : `<span class="cost-line none">${L("ASTER.craft.noCost")}</span>`;
}

function collectCraftDraft(el) {
  const type = el.querySelector('select[name="itemType"]').value;
  const name = el.querySelector('input[name="name"]').value.trim();
  if (!name) {
    ui.notifications.warn(game.i18n.localize("ASTER.craft.nameRequired"));
    return null;
  }
  const material = readMaterialInputs(el);

  const craftRequires = {};
  for (const row of el.querySelectorAll(".craft-requires-row")) {
    const base = row.querySelector('select[name="requires-base"]')?.value;
    const level = parseInt(row.querySelector('input[name="requires-level"]')?.value, 10);
    if (!base || !Number.isFinite(level) || level <= 0) continue;
    craftRequires[base] = level;
  }

  const effect = el.querySelector('input[name="effect"]')?.value ?? "";
  const img = el.querySelector('input[name="img"]')?.value ?? "";
  const draft = { name, type, system: { material, craftRequires, effect } };
  // 빈 값을 실으면 코어 기본 아이콘을 덮어써 빈 그림이 된다.
  if (img) draft.img = img;
  return draft;
}

function confirmCraftShortage(validation) {
  const L = (k) => game.i18n.localize(k);
  const lines = [];
  if (validation.reasons.includes("CRAFT_REQUIRES_NOT_MET")) {
    const miss = validation.missing
      .map((m) => `${m.base} Lv${m.requiredLevel} (보유 ${m.have})`)
      .join(", ");
    lines.push(game.i18n.format("ASTER.craft.shortageRequires", { requires: miss }));
  }
  if (validation.reasons.includes("MATERIAL_SHORT")) lines.push(L("ASTER.craft.shortageMaterial"));
  for (const c of CRAFT_COST_COLORS) {
    if (validation.reasons.includes(`ASTER_${c.toUpperCase()}_SHORT`)) {
      lines.push(game.i18n.format("ASTER.craft.shortageAster", { color: L(`ASTER.aster.${c}`) }));
    }
  }
  return foundry.applications.api.DialogV2.confirm({
    classes: ["hb-dialog"],
    window: {
      title: game.i18n.localize("ASTER.craft.openCraftItem"),
      icon: "fa-solid fa-triangle-exclamation",
    },
    content: `<div class="craft-shortage"><p>${L("ASTER.craft.shortage")}</p><ul>${lines
      .map((l) => `<li>${l}</li>`)
      .join("")}</ul></div>`,
  }).catch(() => false);
}

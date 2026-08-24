/**
 */
import { isEquipSlotContainer } from "./inventory-capacity.mjs";

// 상태이상 칩 툴팁 키 (lang 키 — bigInj 필드는 lang에서 biginj).
const BADSTATUS_KEYS = ["injury", "biginj", "sleepy", "exhaustion", "hungry"];

const TOOLTIP_ICON = {
  consumable: "fa-flask",
  equipment: "fa-wand-magic-sparkles",
  food: "fa-utensils",
  spell: "fa-wand-sparkles",
};

/**
 * 주문 판정식 문자열 조립 — "녹+박식(12)" 형식.
 *
 * @param {Item} spell
 * @returns {string}
 */
export function formatFormula(spell) {
  const c = spell.system.color ? game.i18n.localize(`ASTER.aster.${spell.system.color}`) : "?";
  const a = spell.system.ability
    ? game.i18n.localize(`ASTER.ability.${spell.system.ability}`)
    : "?";
  return `${c}+${a}(${spell.system.target ?? "?"})`;
}

/**
 */
export function inventorySummary(item) {
  if (item.type === "consumable") {
    const sys = item.system;
    const parts = [];
    if ((sys.healHealth ?? 0) > 0) parts.push(`건강 +${sys.healHealth}`);
    if (sys.cureAllStatus === true) parts.push("상태이상 전체");
    else if ((sys.cureStatus?.length ?? 0) > 0) parts.push(`상태이상 ${sys.cureStatus.length}`);
    return parts.join(" · ");
  }
  if (item.type === "equipment") return item.system.effect ?? "";
  return "";
}

/**
 * 인벤토리 리스트의 "효과 비활성" 안내 조건.
 */
export function isMagicToolInactive(item) {
  return (
    item.type === "equipment" &&
    item.system.type === "magicTool" &&
    !isEquipSlotContainer(item.system.container)
  );
}

/**
 * @returns {Record<string, string>}
 */
export function buildStatusTooltips() {
  const tips = {};
  for (const key of BADSTATUS_KEYS) {
    const name = game.i18n.localize(`ASTER.badstatus.${key}`);
    const desc = game.i18n.localize(`ASTER.badstatus.${key}Desc`);
    tips[key] =
      `<div class="hb-tip__head"><i class="fa-solid fa-star"></i>${name}</div>` +
      `<div class="hb-tip__body">${desc}</div>`;
  }
  return tips;
}

/**
 * 본문(description)이 비면 null 반환 → tooltipHtml 헬퍼가 툴팁을 생략(빈 툴팁 박스 방지).
 * 반환 HTML은 템플릿 헬퍼가 속성 안전용으로 엔티티화하므로 여기선 평범한 HTML로 둔다.
 * (단, name은 사용자 입력이라 escapeHTML — 본문 description은 리치텍스트라 그대로.)
 *
 * @param {Item} item
 * @param {string} [locationLabel]  메타에 표시할 위치(가방/창고)
 * @returns {string|null}
 */
export function buildItemTooltip(item, locationLabel) {
  const desc = (item.system.description ?? "").trim();
  if (!desc) return null;
  const icon = TOOLTIP_ICON[item.type] ?? "fa-book";
  const name = foundry.utils.escapeHTML(item.name);
  const parts = [
    `<div class="hb-tip__head"><i class="fa-solid ${icon}"></i>${name}</div>`,
    `<div class="hb-tip__body">${desc}</div>`,
  ];
  const meta = [];
  if (locationLabel) {
    const size = item.system.size;
    const sizeText = size ? ` · ${size.w ?? 1}×${size.h ?? 1}` : "";
    meta.push(`<span><i class="fa-solid fa-box-archive"></i>${locationLabel}${sizeText}</span>`);
  }
  if (item.type === "consumable" && item.system.timing) {
    // timing 값은 이미 한글 표시 텍스트(데이터 어휘)라 localize 불필요 → escape 후 그대로 출력.
    const timing = foundry.utils.escapeHTML(item.system.timing);
    meta.push(`<span><i class="fa-solid fa-hourglass-half"></i>${timing}</span>`);
  }
  if (meta.length) parts.push(`<div class="hb-tip__meta">${meta.join("")}</div>`);
  return parts.join("");
}

/**
 * @param {Item} spell
 * @param {string} formula  formatFormula 결과
 * @returns {string|null}
 */
export function buildSpellTooltip(spell, formula) {
  const desc = (spell.system.description ?? "").trim();
  if (!desc) return null;
  const name = foundry.utils.escapeHTML(spell.name);
  const parts = [
    `<div class="hb-tip__head"><i class="fa-solid fa-wand-sparkles"></i>${name}</div>`,
    `<div class="hb-tip__body">${desc}</div>`,
  ];
  if (formula) {
    const f = foundry.utils.escapeHTML(formula);
    parts.push(
      `<div class="hb-tip__meta"><span><i class="fa-solid fa-dice-d6"></i>${f}</span></div>`,
    );
  }
  return parts.join("");
}

/**
 */
import { DAMAGE_STATUSES } from "./health-status.mjs";
import { isMagicToolInactive } from "./sheet-tooltips.mjs";

// 타입 라벨(ASTER.itemType.*)이 정의된 인벤토리 타입만 typeLabel 표기.
const ITEM_TYPE_KEYS = new Set(["consumable", "equipment", "food", "bag"]);

/**
 * localize를 주입받아 game 전역에 의존하지 않는다(Vitest 테스트 가능).
 *
 * @param {Item} item
 * @param {(key: string) => string} localize  game.i18n.localize 동등 함수
 * @returns {{itemImg:string, itemName:string, typeLabel:string, description:string,
 *            meta: Array<{icon:string, label:string, value:string}>}}
 */
export function buildItemCardData(item, localize) {
  const sys = item.system ?? {};
  const meta = [];

  if (sys.effect?.trim()) {
    meta.push({ icon: "fa-bolt", label: localize("ASTER.item.effect"), value: sys.effect });
  }
  if (sys.requirement?.trim()) {
    meta.push({
      icon: "fa-clipboard-list",
      label: localize("ASTER.equipment.requirement"),
      value: sys.requirement,
    });
  }

  if (item.type === "consumable") {
    if ((sys.healHealth ?? 0) > 0) {
      meta.push({
        icon: "fa-heart",
        label: localize("ASTER.consumable.healHealth"),
        value: `+${sys.healHealth}`,
      });
    }
    if (sys.cureAllStatus === true) {
      meta.push({
        icon: "fa-hand-sparkles",
        label: localize("ASTER.consumable.cureResult"),
        value: localize("ASTER.consumable.cureAllResult"),
      });
    } else if ((sys.cureStatus?.length ?? 0) > 0) {
      const labels = sys.cureStatus.map((k) => {
        const def = DAMAGE_STATUSES.find((s) => s.key === k);
        return localize(`ASTER.badstatus.${def?.i18n ?? k}`);
      });
      meta.push({
        icon: "fa-hand-sparkles",
        label: localize("ASTER.consumable.cureResult"),
        value: labels.join(", "),
      });
    }
    if (sys.timing?.trim()) {
      meta.push({
        icon: "fa-hourglass-half",
        label: localize("ASTER.consumable.timingLabel"),
        value: sys.timing,
      });
    }
  } else if (item.type === "food") {
    if ((sys.restore ?? 0) > 0) {
      meta.push({
        icon: "fa-drumstick-bite",
        label: localize("ASTER.food.restore"),
        value: `+${sys.restore}`,
      });
    }
    if (sys.bonusEffect?.trim()) {
      meta.push({ icon: "fa-star", label: localize("ASTER.item.effect"), value: sys.bonusEffect });
    }
  } else if (item.type === "equipment") {
    if (sys.type?.trim()) {
      meta.push({
        icon: "fa-tag",
        label: localize("ASTER.equipment.type.label"),
        value: localize(`ASTER.equipment.type.${sys.type}`),
      });
    }
    if (isMagicToolInactive(item)) {
      meta.push({
        icon: "fa-triangle-exclamation",
        label: localize("ASTER.equipment.inactiveBadge"),
        value: "",
      });
    }
  } else if (item.type === "bag") {
    const cols = sys.grid?.cols ?? 0;
    const rows = sys.grid?.rows ?? 0;
    meta.push({
      icon: "fa-box",
      label: localize("ASTER.itemcard.capacity"),
      value: `${cols}×${rows}`,
    });
  }

  return {
    itemImg: item.img,
    itemName: item.name,
    typeLabel: ITEM_TYPE_KEYS.has(item.type) ? localize(`ASTER.itemType.${item.type}`) : "",
    description: sys.description ?? "",
    meta,
  };
}

/**
 * @param {Actor} actor
 * @param {Item} item
 */
export async function postItemCard(actor, item) {
  const data = buildItemCardData(item, (key) => game.i18n.localize(key));
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/item-card.html",
    data,
  );
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}

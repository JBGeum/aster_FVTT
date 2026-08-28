/**
 * 시트 _prepareContext의 하위 컨텍스트 빌더 — (sheet, context)를 받아 context를 채운다.
 */
import { EQUIP_SLOT_CONTAINERS } from "../helpers/inventory-capacity.mjs";
import { CRAFT_TREE } from "../helpers/craft-tree.mjs";
import { prereqMet, sumCost } from "../helpers/craft-cost.mjs";
import {
  formatFormula,
  inventorySummary,
  isMagicToolInactive,
  buildItemTooltip,
  buildSpellTooltip,
} from "../helpers/sheet-tooltips.mjs";
import { consumableHasHeal } from "../helpers/consumable.mjs";

export function prepareCharacterData(sheet, context) {
  for (const [k, v] of Object.entries(context.system.ability)) {
    v.label = game.i18n.localize(CONFIG.ASTER.ability[k]) ?? k;
  }
  for (const [k, v] of Object.entries(context.system.aster)) {
    v.label = game.i18n.localize(CONFIG.ASTER.aster[k]) ?? k;
  }
  context.rollModeNormal = context.system.rollMode === "normal";
  context.rollModeVs = context.system.rollMode === "vs";

  // 게이지 fill은 right:emptyPct%로 비워지므로 (1 - value/max) 비율이다.
  const emptyPct = (v, m) => (m > 0 ? Math.max(0, Math.min(100, (1 - (v ?? 0) / m) * 100)) : 100);
  const hp = context.system.health ?? {};
  const sat = context.system.satiety ?? {};
  context.healthEmptyPct = emptyPct(hp.value, hp.max);
  context.satietyEmptyPct = emptyPct(sat.value, sat.max);
}

export function prepareInventory(sheet, context) {
  const bag = sheet.actor.items.find((i) => i.type === "bag") ?? null;
  const food = sheet.actor.items.find((i) => i.type === "food") ?? null;

  const inBag = bag
    ? sheet.actor.items.filter(
        (i) => ["consumable", "equipment"].includes(i.type) && i.system.container === bag.id,
      )
    : [];

  const inStorage = sheet.actor.items.filter(
    (i) => ["consumable", "equipment"].includes(i.type) && !i.system.container,
  );

  const storageLimit = sheet.actor.system.storage?.limit ?? 0;

  const bagGrid = bag?.system.grid ?? { cols: 6, rows: 4 };
  const cells = bag
    ? Array.from({ length: bagGrid.cols * bagGrid.rows }, (_, i) => ({
        index: i,
        x: i % bagGrid.cols,
        y: Math.floor(i / bagGrid.cols),
        light: (Math.floor(i / bagGrid.cols) + (i % bagGrid.cols)) % 2 === 0,
      }))
    : [];

  const inBagLabel = game.i18n.localize("ASTER.inventory.inBag");
  const inStorageLabel = game.i18n.localize("ASTER.inventory.inStorage");

  const equipSlots = EQUIP_SLOT_CONTAINERS.map((slotId) => {
    const it = sheet.actor.items.find(
      (i) => i.type === "equipment" && i.system.container === slotId,
    );
    return {
      slotId,
      item: it ? { id: it.id, name: it.name, img: it.img } : null,
    };
  });

  context.inv = {
    equipSlots,
    bag: bag
      ? {
          id: bag.id,
          name: bag.name,
          grid: bagGrid,
          cells,
          items: inBag.map((i) => {
            const w = i.system.size?.w ?? 1;
            const h = i.system.size?.h ?? 1;
            return {
              id: i.id,
              name: i.name,
              img: i.img,
              tooltip: buildItemTooltip(i, inBagLabel),
              w,
              h,
              x: i.system.grid?.x ?? 0,
              y: i.system.grid?.y ?? 0,
              // .bitem.lg — 2칸 이상 점유 시 아이콘 확대.
              large: w > 1 || h > 1,
            };
          }),
        }
      : null,
    food: food ? { id: food.id, name: food.name, img: food.img } : null,
    storage: {
      count: inStorage.length,
      limit: storageLimit,
      over: inStorage.length > storageLimit,
    },
    allItems: [
      ...inBag.map((i) => ({
        id: i.id,
        name: i.name,
        img: i.img,
        tooltip: buildItemTooltip(i, inBagLabel),
        location: "bag",
        locationLabel: inBagLabel,
        canUse: consumableHasHeal(i),
        summary: inventorySummary(i),
        isEquipment: i.type === "equipment",
        isMagicToolInactive: isMagicToolInactive(i),
      })),
      ...inStorage.map((i) => ({
        id: i.id,
        name: i.name,
        img: i.img,
        tooltip: buildItemTooltip(i, inStorageLabel),
        location: "storage",
        locationLabel: inStorageLabel,
        canUse: consumableHasHeal(i),
        summary: inventorySummary(i),
        isEquipment: i.type === "equipment",
        isMagicToolInactive: isMagicToolInactive(i),
      })),
    ],
  };
}

export function prepareCraft(sheet, context) {
  const acquired = sheet.actor.system.craft?.acquired ?? {};
  const craftLocked = sheet.actor.system.craft?.locked ?? false;
  const resources = {
    material: sheet.actor.system.material ?? 0,
    aster: {
      red: sheet.actor.system.aster?.red?.value ?? 0,
      blue: sheet.actor.system.aster?.blue?.value ?? 0,
      green: sheet.actor.system.aster?.green?.value ?? 0,
      yellow: sheet.actor.system.aster?.yellow?.value ?? 0,
      white: sheet.actor.system.aster?.white?.value ?? 0,
    },
  };

  // 선행 깊이 계산 (depth 0 = 선행 없음, col = depth + 1)
  const nodeMap = Object.fromEntries(CRAFT_TREE.nodes.map((n) => [n.id, n]));
  const depthCache = {};
  const nodeDepth = (id) => {
    if (depthCache[id] !== undefined) return depthCache[id];
    const n = nodeMap[id];
    if (!n || n.requires.length === 0) return (depthCache[id] = 0);
    return (depthCache[id] = Math.max(...n.requires.map(nodeDepth)) + 1);
  };

  const byCat = {};
  const chainMap = {};
  const chainOrder = {};
  for (const cat of CRAFT_TREE.categories) {
    byCat[cat.id] = {
      ...cat,
      chains: [],
      nodes: [],
      colCount: 1,
      isFamiliar: cat.id === "familiar",
    };
    chainMap[cat.id] = {};
    chainOrder[cat.id] = [];
  }

  for (const node of CRAFT_TREE.nodes) {
    const isAcquired = acquired[node.id] === true;
    const unlocked = prereqMet(node.id, acquired);
    const isLocked = !unlocked && !isAcquired;
    const col = nodeDepth(node.id) + 1;
    const displayNode = {
      ...node,
      acquired: isAcquired,
      unlocked,
      locked: isLocked,
      disabledAttr: isLocked || craftLocked ? "disabled" : "",
      costLabel: _formatCraftCost(node.cost),
      col,
    };
    if (col > byCat[node.category].colCount) byCat[node.category].colCount = col;
    byCat[node.category].nodes.push(displayNode);
    if (!chainMap[node.category][node.label]) {
      chainMap[node.category][node.label] = [];
      chainOrder[node.category].push(node.label);
    }
    chainMap[node.category][node.label].push(displayNode);
  }

  for (const cat of CRAFT_TREE.categories) {
    byCat[cat.id].chains = chainOrder[cat.id].map((lbl) => chainMap[cat.id][lbl]);
  }

  const cost = sumCost(acquired);

  const asterColors = ["red", "blue", "green", "yellow", "white"];
  const asterHaveTotal = asterColors.reduce((s, c) => s + (resources.aster[c] ?? 0), 0);
  const asterUsedTotal =
    cost.aster.red + cost.aster.blue + cost.aster.green + cost.aster.yellow + cost.anyAster;

  const summaryColumns = [
    ...asterColors.map((c) => ({
      key: c,
      labelKey: `ASTER.aster.${c}`,
      dotKey: c,
      have: resources.aster[c] ?? 0,
      used: cost.aster[c] ?? null,
      haveEmpty: false,
      // 백은 고정비용 색이 아니라 sumCost에 키가 없다 — 보유 총합에만 기여한다.
      usedEmpty: cost.aster[c] === undefined,
      editable: true,
      inputName: `system.aster.${c}.value`,
    })),
    {
      key: "material",
      label: "마테리얼",
      dotKey: "mat",
      have: resources.material ?? 0,
      used: cost.material,
      haveEmpty: false,
      usedEmpty: false,
      editable: true,
      inputName: "system.material",
    },
    {
      key: "any",
      label: "임의",
      have: null,
      used: cost.anyAster,
      haveEmpty: true,
      usedEmpty: false,
      editable: false,
    },
    {
      key: "self",
      label: "자속성",
      have: null,
      used: null,
      haveEmpty: true,
      usedEmpty: true,
      editable: false,
    },
    {
      key: "total",
      label: "총합",
      total: true,
      have: asterHaveTotal,
      used: asterUsedTotal,
      haveEmpty: false,
      usedEmpty: false,
      editable: false,
    },
  ];

  context.craft = {
    categories: CRAFT_TREE.categories.map((c) => byCat[c.id]),
    cost,
    resources,
    summaryColumns,
    locked: craftLocked,
    lockedAttr: craftLocked ? "disabled" : "",
    lockIcon: craftLocked ? "fa-lock" : "fa-lock-open",
    lockTitle: craftLocked ? "ASTER.craft.unlock" : "ASTER.craft.lock",
  };
}

function _formatCraftCost(cost) {
  const parts = [];
  if (cost.material) parts.push(`◆${cost.material}`);
  const a = cost.aster;
  if (a.red || a.blue || a.green || a.yellow)
    parts.push(`◇${a.red}/${a.blue}/${a.green}/${a.yellow}`);
  if (cost.anyAster) parts.push(`◇임의 ${cost.anyAster}`);
  return parts.join(" ");
}

export function prepareItems(sheet, context) {
  const features = [];
  for (const i of context.items) {
    i.img = i.img || CONST.DEFAULT_TOKEN;
    if (i.type === "feature") features.push(i);
  }
  context.features = features;
}

export function prepareSpellList(sheet, context) {
  const spells = sheet.actor.items.filter((i) => i.type === "spell");
  context.spells = spells.map((s) => {
    const formula = formatFormula(s); // "녹+박식(12)"
    return {
      id: s.id,
      name: s.name,
      img: s.img,
      color: s.system.color,
      ability: s.system.ability,
      target: s.system.target,
      // tooltipHtml 헬퍼가 빈 값을 걸러낸다.
      tooltip: buildSpellTooltip(s, formula),
      formula,
    };
  });
}

export function prepareRecord(sheet, context) {
  context.features = sheet.actor.system.features;

  const records = sheet.actor.items.filter((i) => i.type === "record");
  context.records = records.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.system.city,
    alert: r.system.alert,
    felka: r.system.felka,
    scenarioCount: r.system.scenarioCount,
    favor: r.system.favor,
    scenes: r.system.scenes,
    people: r.system.people,
    memo: r.system.memo,
    updatedAt: r.system.updatedAt,
  }));
  context.recordCount = records.length;
  // _recordIndex는 현재 페이지(비영속 인스턴스 상태)
  context.currentIndex = Math.min(sheet._recordIndex ?? 0, Math.max(0, records.length - 1));
  context.currentRecord = context.records[context.currentIndex] ?? null;
  context.currentPage = records.length ? context.currentIndex + 1 : 0;
  // disabled 속성은 미리 계산(템플릿 태그 속성에 블록 헬퍼 사용 불가)
  context.recordPrevDisabled = context.currentIndex <= 0 ? "disabled" : "";
  context.recordNextDisabled = context.currentIndex >= records.length - 1 ? "disabled" : "";
}

/**
 * @returns {{inCombat:boolean, disabled:boolean, ap:number, combatantId?:string, defendUsed?:boolean, chargeUsed?:boolean}}
 */
export function buildCombatContext(sheet) {
  const combat = game.combat;
  if (!combat?.started) return { inCombat: false, disabled: true, ap: 0 };

  const combatant = combat.combatants.find((c) => c.actor?.id === sheet.actor.id);
  if (!combatant) return { inCombat: false, disabled: true, ap: 0 };

  const usage = combatant.getFlag("aster", "actionsThisRound") ?? {};
  const unisonReady = combatant.getFlag("aster", "unisonReady") === true;
  const otherUnisonReady = combat.combatants.some(
    (c) =>
      c.id !== combatant.id &&
      c.actor?.type === "character" &&
      c.getFlag("aster", "unisonReady") === true,
  );
  return {
    inCombat: true,
    disabled: false,
    ap: combatant.getFlag("aster", "actionPoint") ?? 0,
    // 이미 시작된 전투에는 max flag가 없다 — 다음 라운드부터 채워진다.
    apMax:
      combatant.getFlag("aster", "actionPointMax") ??
      combatant.getFlag("aster", "actionPoint") ??
      0,
    combatantId: combatant.id,
    defendUsed: (usage.defend ?? 0) >= 1,
    chargeUsed: (usage.charge ?? 0) >= 1,
    focusActive: combatant.getFlag("aster", "focusActive") === true,
    unisonReady,
    canUnison: unisonReady && otherUnisonReady,
    // 템플릿 `{{disabled}}` 헬퍼가 truthy를 disabled로 변환하므로 부정값을 컨텍스트에서 미리 계산.
    disableUnison: !(unisonReady && otherUnisonReady),
  };
}

/**
 * 협력 회복 컨텍스트. 건강 0 = 행동불능.
 * @returns {{isFallen:boolean, canRevive:boolean, inCombatBlocked:boolean}}
 */
export function buildReviveContext(sheet) {
  const isFallen = (sheet.actor.system.health?.value ?? 0) === 0;
  const phase = game.settings.get("aster", "currentPhase");
  return {
    isFallen,
    canRevive: isFallen && phase === "exploration",
    inCombatBlocked: isFallen && phase === "climax",
  };
}

import { computeSpellRoll, getAbilityTotal, isSpecialty } from "./spell-roll.mjs";
import { detectCritFumble, computePenalties } from "./roll-result.mjs";
import { pickDiceDialog, PICK_RETRY } from "./dice-select.mjs";
import { getTargetedTokens } from "./target-select.mjs";
import { formatFormula, spellCostTag } from "./sheet-tooltips.mjs";
import { checkFocusEffect } from "./focus-effect.mjs";
import { promptAbilityCheck } from "./check-dialog.mjs";
import { formatModifier } from "./ability-check.mjs";
import { parseSpellCost } from "./spell-cost.mjs";
import { findCombatantFor, hasAmbiguousCombatants } from "./combatant-match.mjs";

/**
 * 집중을 반영해 다이스를 굴리고 2개를 고른다. 고르기를 마쳐야 집중을 소비한다.
 * 두 시전 경로가 갈라져 한쪽에서 집중이 누락됐던 적이 있어 여기로 모았다.
 *
 * @param {Actor} actor
 * @param {Item} spell
 * @param {number} extraAster  추가 소비한 아스테르 수(다이스 가산)
 * @returns {Promise<{roll: Roll, selected: number[], discarded: number[]} | null>} 취소 시 null.
 */
async function rollSpellDice(actor, spell, extraAster) {
  const focus = checkFocusEffect(actor);
  const roll = new Roll(`${2 + extraAster + focus.extraDice}d6`);
  await roll.evaluate();
  const allDice = roll.dice[0].results.map((r) => r.result);

  const opts = {
    dice: allDice,
    count: 2,
    title: game.i18n.format("ASTER.spell.pickTitle", { name: spell.name }),
  };
  let pick = await pickDiceDialog(opts);
  if (pick === PICK_RETRY) pick = await pickDiceDialog(opts);
  if (!pick || pick === PICK_RETRY) return null;

  if (focus.combatant) {
    await focus.combatant.setFlag("aster", "focusActive", false);
  }
  return { roll, selected: pick.selected, discarded: pick.discarded };
}

/**
 * @param {Actor} actor
 * @param {Item} spell
 * @returns {{ok: boolean, spend?: () => Promise<void>}} ok가 false면 경고를 이미 냈다.
 */
function checkSpellAP(actor, spell) {
  const skip = { ok: true, spend: async () => {} };
  const cost = parseSpellCost(spell.system?.effect);
  // AP는 _startRound에서만 채워진다 — 시작 전 전투에서는 전원이 0이다.
  if (cost.interrupt || cost.ap <= 0 || !game.combat?.started) return skip;

  const combatant = findCombatantFor(game.combat.combatants, actor);
  if (!combatant) return skip;
  if (hasAmbiguousCombatants(game.combat.combatants, actor)) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.ambiguousCombatant", { name: combatant.name }),
    );
  }

  const have = combatant.getFlag("aster", "actionPoint") ?? 0;
  if (have < cost.ap) {
    ui.notifications.warn(
      game.i18n.format("ASTER.spell.warn.notEnoughAP", { need: cost.ap, have }),
    );
    return { ok: false };
  }

  return {
    ok: true,
    spend: () => combatant.setFlag("aster", "actionPoint", have - cost.ap),
  };
}

/**
 * @param {{actor: Actor, spell: Item, showDialog?: boolean}} params
 */
export async function castSpell({ actor, spell, showDialog = false }) {
  const ap = checkSpellAP(actor, spell);
  if (!ap.ok) return;

  // 선택적 캔버스 타게팅 — 타겟 있으면 카드에 표시, 없으면 자기 강화 마법으로 진행.
  const targets = getTargetedTokens({ required: false, max: 1 });
  if (targets === null) return; // 타겟 초과 — 경고 출력됨
  const targetInfo = targets.length
    ? {
        name: targets[0].name,
        id: targets[0].id,
        actorId: targets[0].actor?.id ?? null,
        actorUuid: targets[0].actor?.uuid ?? null,
      }
    : null;

  let modifier = 0;
  if (showDialog) {
    const input = await promptAbilityCheck({
      label: spell.name,
      defaultTarget: 0,
      showTarget: false,
    });
    if (!input) return;
    modifier = input.modifier;
  }

  await ap.spend();

  const picked = await rollSpellDice(actor, spell, 0);
  if (!picked) {
    ui.notifications.info(game.i18n.localize("ASTER.spell.cancelled"));
    return;
  }

  await processSpellRoll(actor, spell, picked.roll, picked.selected, picked.discarded, {
    color: spell.system.color,
    n: 0,
    targetInfo,
    modifier,
  });
}

/**
 * @param {{actor: Actor, spell: Item}} params
 */
export async function castSpellWithExtra({ actor, spell }) {
  const sys = spell.system;
  const color = sys.color;
  if (!color) {
    ui.notifications.warn(game.i18n.localize("ASTER.spell.warn.noColor"));
    return;
  }

  const ap = checkSpellAP(actor, spell);
  if (!ap.ok) return;

  // 선택적 캔버스 타게팅 — 자원 소비 전에 검증 (초과 시 종료).
  const targets = getTargetedTokens({ required: false, max: 1 });
  if (targets === null) return;
  const targetInfo = targets.length
    ? {
        name: targets[0].name,
        id: targets[0].id,
        actorId: targets[0].actor?.id ?? null,
        actorUuid: targets[0].actor?.uuid ?? null,
      }
    : null;

  const haveAster = actor.system.aster?.[color]?.value ?? 0;
  const colorLabel = game.i18n.localize(`ASTER.aster.${color}`);

  // 다이얼로그: 추가 다이스 개수 (룰: 마법 속성 색 아스테르 1개당 다이스 1개. 보유량 한도).
  const input = await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.spell.extraTitle") },
    content: `
        <div class="form-group">
          <label>${game.i18n.format("ASTER.spell.extraHaveAster", { color: colorLabel, n: haveAster })}</label>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.spell.extraN")}</label>
          <input type="number" name="n" value="1" min="0" max="${haveAster}" />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.check.modifier")}</label>
          <input type="number" name="modifier" value="0" />
        </div>
      `,
    ok: {
      label: game.i18n.localize("ASTER.spell.castLabel"),
      callback: (_e, b) => ({
        n: Number(b.form.elements.n.value) || 0,
        modifier: Number(b.form.elements.modifier.value) || 0,
      }),
    },
  }).catch(() => null);

  if (!input) return; // 취소
  const { n, modifier } = input;
  if (n < 0 || n > haveAster) {
    ui.notifications.warn(
      game.i18n.format("ASTER.spell.warn.notEnoughAster", {
        color: colorLabel,
        need: n,
        have: haveAster,
      }),
    );
    return;
  }

  // 룰: 자원은 판정 전에 소비한다.
  await ap.spend();
  if (n > 0) {
    await actor.update({ [`system.aster.${color}.value`]: haveAster - n });
  }

  const picked = await rollSpellDice(actor, spell, n);
  if (!picked) {
    // 이 시점에 취소해도 차감한 자원은 환불하지 않는다.
    ui.notifications.info(game.i18n.localize("ASTER.spell.cancelled"));
    return;
  }

  await processSpellRoll(actor, spell, picked.roll, picked.selected, picked.discarded, {
    color,
    n,
    targetInfo,
    modifier,
  });
}

/**
 * @param {Actor} actor
 * @param {Item} spell
 * @param {Roll} roll                 평가 완료된 Roll (채팅 첨부용)
 * @param {number[]} selectedDice     달성치에 합산할 2개
 * @param {number[]} extraDice        선택 제외된 다이스 (표시 전용, 계산 제외)
 * @param {{color:string, n:number, targetInfo?:object|null, modifier?:number}} ctx
 */
async function processSpellRoll(actor, spell, roll, selectedDice, extraDice, ctx) {
  const sys = spell.system;
  const abilityTotal = getAbilityTotal(actor, sys.ability);
  const specialty = isSpecialty(actor, sys.color);
  const targetVal = sys.target ?? 0;

  // 대미지 적용 정보 (캔버스 타겟이 있을 때만 버튼 노출 — 자동 추출 없음, GM 입력).
  const spellCast = {
    sourceActorId: actor.id,
    targetActorId: ctx.targetInfo?.actorId ?? null,
    targetActorUuid: ctx.targetInfo?.actorUuid ?? null,
    targetName: ctx.targetInfo?.name ?? null,
    defaultDamage: 0,
    damageApplied: false,
  };

  const penalties = computePenalties(actor);

  // extraDice는 합산하지 않고 카드에서 별도 표시 — diceTotal은 고른 2개의 합만 넘긴다.
  const diceTotal = selectedDice.reduce((a, b) => a + b, 0);
  const modifier = ctx.modifier ?? 0;
  const result = computeSpellRoll({
    diceTotal,
    abilityValue: abilityTotal,
    specialty,
    extraDice: [],
    target: targetVal,
    penalties,
    modifier,
  });

  // 대성공/대실패는 선택된 2개로 판단 (룰: "2개를 고른 후 판단").
  const cf = detectCritFumble(selectedDice);
  const finalSuccess = cf.critical || (!cf.fumble && result.success);

  // effect의 인라인 문법(@ability.*, [[/r ...]])을 Foundry 표준으로 치환
  const effectEnriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    sys.effect ?? "",
    { rollData: actor.getRollData() },
  );

  const outcomeText = cf.critical
    ? (sys.message?.critical ?? "")
    : cf.fumble
      ? (sys.message?.fumble ?? "")
      : "";
  const outcomeMessage = outcomeText
    ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(outcomeText, {
        rollData: actor.getRollData(),
      })
    : "";

  const spellCost = parseSpellCost(sys.effect);
  const cardData = {
    spellId: spell.id,
    actorId: actor.id,
    actorUuid: actor.uuid,
    actorName: actor.name,
    name: spell.name,
    ruby: sys.ruby,
    img: spell.img,
    color: sys.color,
    formula: formatFormula(spell),
    costTag: spellCostTag(spellCost),
    interrupt: spellCost.interrupt,
    target: targetVal,
    achievement: result.achievement,
    success: finalSuccess,
    isCritical: cf.critical,
    isFumble: cf.fumble,
    outcomeMessage,
    isPC: actor.type === "character",
    breakdown: result.breakdown,
    modifierText: formatModifier(modifier),
    diceText: selectedDice.join(", "),
    resultDiceset: selectedDice, // .dice-pips 시각화용(고른 2개)
    discardedDiceText: extraDice.length ? extraDice.join(", ") : "",
    extraN: ctx.n,
    extraColor: ctx.color,
    extraColorLabel: ctx.n > 0 ? game.i18n.localize(`ASTER.aster.${ctx.color}`) : "",
    targetInfo: ctx.targetInfo ?? null,
    spellCast,
    effect: sys.effect,
    effectEnriched,
    alert: sys.alert,
    // 음수 범위(-3~0)를 템플릿 {{#if}}의 0 falsy 판정이 숨기지 않도록 별도 boolean.
    hasAlert: sys.alert.min !== 0 || sys.alert.max !== 0,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/spell-card.html",
    cardData,
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    content,
    flags: {
      aster: {
        spellCard: true,
        spellId: spell.id,
        actorId: actor.id,
        actorUuid: actor.uuid,
        spellCast,
      },
    },
  });

  // 졸림 자동 해제: 룰 "한 번 판정에 실패하면 해제" — 일반 마법판정 실패에만 적용.
  // AE는 actor의 _onUpdate hook이 지운다.
  if (penalties.sleepy < 0 && !finalSuccess) {
    await actor.update({ "system.badstatus.sleepy": false });
  }

  await actor._decreaseSatietyIfExploration();
}

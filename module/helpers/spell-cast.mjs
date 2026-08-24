import { computeSpellRoll, getAbilityTotal, isSpecialty } from "./spell-roll.mjs";
import { detectCritFumble, computePenalties } from "./roll-result.mjs";
import { pickDiceDialog } from "./dice-select.mjs";
import { getTargetedTokens } from "./target-select.mjs";
import { formatFormula } from "./sheet-tooltips.mjs";
import { checkFocusEffect } from "./focus-effect.mjs";

/**
 * @param {{actor: Actor, spell: Item}} params
 */
export async function castSpell({ actor, spell }) {
  // 선택적 캔버스 타게팅 — 타겟 있으면 카드에 표시, 없으면 자기 강화 마법으로 진행.
  const targets = getTargetedTokens({ required: false, max: 1 });
  if (targets === null) return; // 타겟 초과 — 경고 출력됨
  const targetInfo = targets.length
    ? { name: targets[0].name, id: targets[0].id, actorId: targets[0].actor?.id ?? null }
    : null;

  const roll = new Roll("2d6");
  await roll.evaluate();
  const dice = roll.dice[0].results.map((r) => r.result);

  await processSpellRoll(actor, spell, roll, dice, [], {
    color: spell.system.color,
    n: 0,
    targetInfo,
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

  // 선택적 캔버스 타게팅 — 자원 소비 전에 검증 (초과 시 종료).
  const targets = getTargetedTokens({ required: false, max: 1 });
  if (targets === null) return;
  const targetInfo = targets.length
    ? { name: targets[0].name, id: targets[0].id, actorId: targets[0].actor?.id ?? null }
    : null;

  const haveAster = actor.system.aster?.[color]?.value ?? 0;
  const colorLabel = game.i18n.localize(`ASTER.aster.${color}`);

  // 다이얼로그: 추가 다이스 개수 (룰: 마법 속성 색 아스테르 1개당 다이스 1개. 보유량 한도).
  const n = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("ASTER.spell.extraTitle") },
    content: `
        <div class="form-group">
          <label>${game.i18n.format("ASTER.spell.extraHaveAster", { color: colorLabel, n: haveAster })}</label>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.spell.extraN")}</label>
          <input type="number" name="n" value="1" min="0" max="${haveAster}" />
        </div>
      `,
    ok: {
      label: game.i18n.localize("ASTER.spell.castLabel"),
      callback: (_e, b) => Number(b.form.elements.n.value) || 0,
    },
  }).catch(() => null);

  if (n === null) return; // 취소
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
  if (n > 0) {
    await actor.update({ [`system.aster.${color}.value`]: haveAster - n });
  }

  const focus = checkFocusEffect(actor);
  const roll = new Roll(`${2 + n + focus.extraDice}d6`);
  await roll.evaluate();
  const allDice = roll.dice[0].results.map((r) => r.result);

  let pick = await pickDiceDialog({
    dice: allDice,
    count: 2,
    title: game.i18n.format("ASTER.spell.pickTitle", { name: spell.name }),
    hint: game.i18n.localize("ASTER.spell.pickHint"),
  });

  if (!pick) {
    pick = await pickDiceDialog({ dice: allDice, count: 2 });
    if (!pick) {
      // 이 시점에 취소해도 차감한 자원은 환불하지 않는다.
      ui.notifications.info(game.i18n.localize("ASTER.spell.cancelled"));
      return;
    }
  }

  // 선택을 마쳐야 집중을 소비한다.
  if (focus.combatant) {
    await focus.combatant.setFlag("aster", "focusActive", false);
  }

  await processSpellRoll(actor, spell, roll, pick.selected, pick.discarded, {
    color,
    n,
    targetInfo,
  });
}

/**
 * @param {Actor} actor
 * @param {Item} spell
 * @param {Roll} roll                 평가 완료된 Roll (채팅 첨부용)
 * @param {number[]} selectedDice     달성치에 합산할 2개
 * @param {number[]} extraDice        선택 제외된 다이스 (표시 전용, 계산 제외)
 * @param {{color:string, n:number}} ctx
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
    targetName: ctx.targetInfo?.name ?? null,
    defaultDamage: 0,
    damageApplied: false,
  };

  const penalties = computePenalties(actor);

  // extraDice는 합산하지 않고 카드에서 별도 표시 — diceTotal은 고른 2개의 합만 넘긴다.
  const diceTotal = selectedDice.reduce((a, b) => a + b, 0);
  const result = computeSpellRoll({
    diceTotal,
    abilityValue: abilityTotal,
    specialty,
    extraDice: [],
    target: targetVal,
    penalties,
  });

  // 대성공/대실패는 선택된 2개로 판단 (룰: "2개를 고른 후 판단").
  const cf = detectCritFumble(selectedDice);
  const finalSuccess = cf.critical || (!cf.fumble && result.success);

  // effect의 인라인 문법(@ability.*, [[/r ...]])을 Foundry 표준으로 치환
  const effectEnriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    sys.effect ?? "",
    { rollData: actor.getRollData() },
  );

  const cardData = {
    spellId: spell.id,
    actorId: actor.id,
    name: spell.name,
    ruby: sys.ruby,
    img: spell.img,
    color: sys.color,
    formula: formatFormula(spell),
    target: targetVal,
    achievement: result.achievement,
    success: finalSuccess,
    isCritical: cf.critical,
    isFumble: cf.fumble,
    isPC: actor.type === "character",
    breakdown: result.breakdown,
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
    flags: { aster: { spellCard: true, spellId: spell.id, actorId: actor.id, spellCast } },
  });

  // 졸림 자동 해제: 룰 "한 번 판정에 실패하면 해제" — 일반 마법판정 실패에만 적용.
  // AE는 actor의 _onUpdate hook이 지운다.
  if (penalties.sleepy < 0 && !finalSuccess) {
    await actor.update({ "system.badstatus.sleepy": false });
  }

  await actor._decreaseSatietyIfExploration();
}

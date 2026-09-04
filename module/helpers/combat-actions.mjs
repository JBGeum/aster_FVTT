import { detectCritFumble, computePenalties } from "./roll-result.mjs";
import { getTargetedTokens } from "./target-select.mjs";
import { applyDamageAndStatus, applyCureAllStatus, applyCureStatus } from "./health-status.mjs";
import { checkFocusEffect } from "./focus-effect.mjs";
import { pickTwoIfNeeded } from "./dice-select.mjs";
import { findCombatantFor, hasAmbiguousCombatants } from "./combatant-match.mjs";

/**
 * @param {{ actor: Actor, actionKey: string }} params
 */
export async function resolveCombatAction({ actor, actionKey }) {
  const combat = game.combat;
  if (!combat?.started) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.notInCombat"));
    return;
  }
  const combatant = findCombatantFor(combat.combatants, actor);
  if (!combatant) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.noCombatantForActor"));
    return;
  }
  if (hasAmbiguousCombatants(combat.combatants, actor)) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.ambiguousCombatant", { name: combatant.name }),
    );
  }

  // defend/charge는 1라운드 1회만 쓸 수 있다.
  // AP 검사·다이얼로그보다 앞서 차단해야 자원·UX 낭비가 없다.
  const usage = combatant.getFlag("aster", "actionsThisRound") ?? {};
  if ((actionKey === "defend" || actionKey === "charge") && (usage[actionKey] ?? 0) >= 1) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.actionUsedThisRound", {
        action: game.i18n.localize(`ASTER.combat.action.${actionKey}`),
      }),
    );
    return;
  }

  const currentAP = combatant.getFlag("aster", "actionPoint") ?? 0;
  let cost;
  let chatExtra;
  let throwTarget = null; // 돌던지기 대상 토큰 (대미지 적용 flag용)
  let chargeChoice = null; // 차지 선택("ap" | "unison")
  let dashX = 0;

  switch (actionKey) {
    case "throw": {
      // 캔버스 사전 타게팅 — 적 1체만 허용. 시전자가 PC면 적은 NPC, NPC면 적은 PC다.
      // 검증 실패 시 자원 소비 없이 종료.
      const enemyType = actor.type === "npc" ? "character" : "npc";
      const targets = getTargetedTokens({ required: true, max: 1, allowedTypes: enemyType });
      if (!targets) return;
      throwTarget = targets[0];
      cost = 1;
      chatExtra = game.i18n.format("ASTER.combat.throwEffect", { target: throwTarget.name });
      break;
    }
    case "defend":
      cost = 2;
      chatExtra = game.i18n.localize("ASTER.combat.defendEffect");
      break;
    case "focus":
      cost = 3;
      chatExtra = game.i18n.localize("ASTER.combat.focusEffect");
      break;
    case "dash": {
      const x = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("ASTER.combat.action.dashTitle") },
        content: `<div class="form-group">
          <label>${game.i18n.localize("ASTER.combat.dashValueLabel")}</label>
          <input type="number" name="x" value="1" min="1" />
        </div>`,
        ok: { callback: (_e, b) => Number(b.form.elements.x.value) || 0 },
      }).catch(() => null);
      if (x === null || x <= 0) return;
      cost = x;
      dashX = x;
      chatExtra = game.i18n.format("ASTER.combat.dashEffect", { x });
      break;
    }
    case "charge": {
      chargeChoice = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("ASTER.combat.action.chargeTitle") },
        content: `<div class="form-group">
          <label>${game.i18n.localize("ASTER.combat.chargeChooseLabel")}</label>
          <select name="sub">
            <option value="ap">${game.i18n.localize("ASTER.combat.chargeSubAP")}</option>
            <option value="unison">${game.i18n.localize("ASTER.combat.chargeSubUnison")}</option>
          </select>
        </div>`,
        ok: { callback: (_e, b) => b.form.elements.sub.value },
      }).catch(() => null);
      if (!chargeChoice) return;
      cost = 3;
      chatExtra =
        chargeChoice === "ap"
          ? game.i18n.localize("ASTER.combat.chargeEffectAP")
          : game.i18n.localize("ASTER.combat.chargeEffectUnison");
      break;
    }
    case "unisonPrepare":
      cost = 1;
      chatExtra = game.i18n.localize("ASTER.combat.unisonPrepareEffect");
      break;
    default:
      return;
  }

  // AP 부족 검사 (다이얼로그 입력 후 — 대쉬는 X가 보유 AP를 넘을 수 있음)
  if (currentAP < cost) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.notEnoughAP", { need: cost, have: currentAP }),
    );
    return;
  }

  await combatant.setFlag("aster", "actionPoint", currentAP - cost);

  if (actionKey === "defend") {
    await combatant.setFlag("aster", "actionsThisRound", {
      ...usage,
      defend: (usage.defend ?? 0) + 1,
    });
    await combatant.setFlag("aster", "defendActive", true);
  } else if (actionKey === "charge") {
    await combatant.setFlag("aster", "actionsThisRound", {
      ...usage,
      charge: (usage.charge ?? 0) + 1,
    });
    await combatant.setFlag("aster", "chargeNextRound", chargeChoice);
  } else if (actionKey === "focus") {
    await combatant.setFlag("aster", "focusActive", true);
  } else if (actionKey === "dash") {
    // 한 라운드에 두 번 쓰면 합산된다 — 덮어쓰면 앞의 대쉬가 사라진다.
    const pendingDash = combatant.getFlag("aster", "dashNextRound") ?? 0;
    await combatant.setFlag("aster", "dashNextRound", pendingDash + dashX);
  } else if (actionKey === "unisonPrepare") {
    await combatant.setFlag("aster", "unisonReady", true);
  }

  const actionName = game.i18n.localize(`ASTER.combat.action.${actionKey}`);

  const actionFlag = { type: actionKey };
  if (actionKey === "throw" && throwTarget) {
    // orphan 토큰이면 targetActorId가 null — 버튼 미노출(대미지 적용 불가).
    actionFlag.sourceActorId = actor.id;
    actionFlag.sourceActorUuid = actor.uuid;
    actionFlag.targetActorId = throwTarget.actor?.id ?? null;
    actionFlag.targetActorUuid = throwTarget.actor?.uuid ?? null;
    actionFlag.targetName = throwTarget.name;
    actionFlag.defaultDamage = 1;
    actionFlag.damageApplied = false;
  }

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/combat-action.html",
    {
      actionName,
      actorName: actor.name,
      apSpent: game.i18n.format("ASTER.combat.apSpent", { n: cost }),
      chatExtra,
      hasDamageButton: !!actionFlag.targetActorId,
      hasHitButton: actionKey === "throw",
    },
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { aster: { combatAction: actionFlag } },
  });
}

/**
 * @param {{ actor: Actor, itemId: string }} params
 */
export async function resolveNpcActionUse({ actor, itemId }) {
  const action = actor.items.get(itemId);
  if (!action || action.type !== "npcAction") return;

  const sys = action.system;
  const combat = game.combat;
  if (!combat?.started) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.notInCombat"));
    return;
  }
  const combatant = findCombatantFor(combat.combatants, actor);
  if (!combatant) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.noCombatantForActor"));
    return;
  }
  if (hasAmbiguousCombatants(combat.combatants, actor)) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.ambiguousCombatant", { name: combatant.name }),
    );
  }

  // AP·다이얼로그보다 앞서 차단해야 자원·UX 낭비가 없다.
  const usage = combatant.getFlag("aster", "actionsThisRound") ?? {};
  const usageKey = `npcAction-${itemId}`;
  if (sys.oncePerRound && usage[usageKey]) {
    ui.notifications.warn(
      game.i18n.format("ASTER.npcAction.alreadyUsedThisRound", { name: action.name }),
    );
    return;
  }

  let cost = sys.cost;
  let targets = [actor];
  const needsDialog = sys.costVariable || sys.targetType !== "self";

  if (needsDialog) {
    if (sys.costVariable) {
      const x = await foundry.applications.api.DialogV2.prompt({
        window: {
          title: game.i18n.format("ASTER.npcAction.xInputTitle", { name: action.name }),
        },
        content: `<div class="form-group">
          <label>${game.i18n.localize("ASTER.npcAction.xInputLabel")}</label>
          <input type="number" name="x" value="1" min="1" />
        </div>`,
        ok: { callback: (_e, b) => Number(b.form.elements.x.value) || 0 },
      }).catch(() => null);
      if (x === null || x <= 0) return;
      cost = x;
    }

    // NPC가 시전하므로 적은 PC(character)다.
    if (sys.targetType === "one") {
      const t = getTargetedTokens({ required: true, max: 1, allowedTypes: "character" });
      if (!t) return;
      targets = t.map((tok) => tok.actor).filter(Boolean);
    } else if (sys.targetType === "many") {
      const t = getTargetedTokens({ required: true, max: Infinity, allowedTypes: "character" });
      if (!t) return;
      targets = t.map((tok) => tok.actor).filter(Boolean);
    } else if (sys.targetType === "all") {
      targets = game.actors.filter((a) => a.type === "character");
    }
  }

  // 다이얼로그 뒤에 검사한다 — costVariable의 X가 보유 AP를 넘을 수 있다.
  const currentAP = combatant.getFlag("aster", "actionPoint") ?? 0;
  if (currentAP < cost) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.notEnoughAP", { need: cost, have: currentAP }),
    );
    return;
  }

  await combatant.setFlag("aster", "actionPoint", currentAP - cost);

  // `npcAction-{itemId}` 키 — PC defend·charge 키와 충돌하지 않는다.
  if (sys.oncePerRound) {
    await combatant.setFlag("aster", "actionsThisRound", { ...usage, [usageKey]: true });
  }

  // hit vs dodge 자동 비교는 하지 않는다 — GM이 카드의 hit 결과를 PC dodge와 수동 비교한다.
  let hitResult = null;
  if (sys.damageFormula && sys.targetType !== "self") {
    const hitFormula = actor.system.hitFormula?.trim();
    if (hitFormula) {
      const focus = checkFocusEffect(actor);
      const fullHitFormula =
        focus.extraDice > 0 ? `${hitFormula} + ${focus.extraDice}d6` : hitFormula;
      try {
        const hitRoll = new Roll(fullHitFormula);
        await hitRoll.evaluate();
        // 대성공·대실패는 고른 2개로 판단한다 — 전체 다이스를 넘기면 길이≠2라 항상 false다.
        const pick = await pickTwoIfNeeded({
          roll: hitRoll,
          dice: hitRoll.dice.flatMap((d) => d.values),
        });
        // 선택 취소 시 hit 결과만 비운다. AP·flag가 이미 소비돼 시전은 되돌릴 수 없다.
        if (pick) {
          if (focus.combatant) await focus.combatant.setFlag("aster", "focusActive", false);
          const hitCf = detectCritFumble(pick.selected);
          const penalties = computePenalties(actor, { isDodge: false });
          hitResult = {
            formula: hitFormula,
            total: pick.rawTotal + penalties.total,
            penalties,
            diceText: pick.selected.join(", "),
            isCritical: hitCf.critical,
            isFumble: hitCf.fumble,
          };
        }
      } catch (e) {
        console.warn(
          `[Aster] NPC ${actor.name} hitFormula 평가 실패(시전 통합): "${hitFormula}"`,
          e,
        );
        // 시전 자체는 계속 — hit 결과 미표시.
      }
    }
  }

  const effectResults = [];

  // damageFormula 없이 addStatus만 있으면 amount=0 — 상태이상만 적용된다.
  let damageTotal = 0;
  if (sys.damageFormula || sys.addStatus.length > 0) {
    if (sys.damageFormula) {
      const roll = new Roll(sys.damageFormula);
      await roll.evaluate();
      damageTotal = roll.total;
    }
    for (const t of targets) {
      const result = await applyDamageAndStatus(t, damageTotal, sys.addStatus);
      effectResults.push({ targetName: t.name, type: "damage", amount: damageTotal, ...result });
    }
  }

  if (sys.cureAllStatus) {
    const cured = await applyCureAllStatus(targets);
    for (const r of cured) {
      effectResults.push({ targetName: r.actorName, type: "cureAll", curedKeys: r.curedKeys });
    }
  } else if (sys.cureStatus.length > 0) {
    for (const statusKey of sys.cureStatus) {
      const cured = await applyCureStatus(targets, statusKey);
      for (const r of cured) {
        effectResults.push({ targetName: r.actorName, type: "cure", statusKey, cured: r.cured });
      }
    }
  }

  await renderNpcActionCard(actor, action, cost, damageTotal, effectResults, hitResult);
}

/**
 * 상태이상 키는 badstatus i18n 매핑(bigInj→biginj)으로 지역화해 전달한다.
 *
 * @param {Actor} actor
 * @param {Item} action
 * @param {number} cost  실제 소비 AP
 * @param {number} damageTotal  대미지 굴림 합(없으면 0)
 * @param {Array<object>} effectResults
 * @param {{formula:string,total:number,diceText:string,isCritical:boolean,isFumble:boolean}|null} [hitResult]
 *   공격 액션 hit 굴림 결과(없으면 null — 카드에 hit 영역 미표시).
 */
async function renderNpcActionCard(
  actor,
  action,
  cost,
  damageTotal,
  effectResults,
  hitResult = null,
) {
  const sys = action.system;
  const statusLabel = (key) =>
    game.i18n.localize(`ASTER.badstatus.${key === "bigInj" ? "biginj" : key}`);

  const damageResults = effectResults
    .filter((r) => r.type === "damage")
    .map((r) => ({
      targetName: r.targetName,
      hBefore: r.hBefore,
      hAfter: r.hAfter,
      statusApplied: (r.statusApplied ?? []).map(statusLabel),
    }));

  const cureResults = effectResults
    .filter((r) => r.type === "cure" || r.type === "cureAll")
    .map((r) => ({
      targetName: r.targetName,
      curedKeys: r.curedKeys ? r.curedKeys.map(statusLabel) : null,
      statusLabel: r.statusKey ? statusLabel(r.statusKey) : null,
      cured: r.cured,
    }));

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/npc-action-card.html",
    {
      actorName: actor.name,
      actionName: action.name,
      apSpent: game.i18n.format("ASTER.combat.apSpent", { n: cost }),
      effect: sys.effect,
      damageFormula: sys.damageFormula,
      damageTotal,
      damageResults,
      cureResults,
      hitResult,
    },
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      aster: { npcAction: { actorId: actor.id, actorUuid: actor.uuid, actionId: action.id } },
    },
  });
}

/**
 * 전투 행동 / NPC 행동 사용 — 굴림·데미지·결과 카드.
 */
import { detectCritFumble } from "./roll-result.mjs";
import { getTargetedTokens } from "./target-select.mjs";
import { applyDamageAndStatus, applyCureAllStatus, applyCureStatus } from "./health-status.mjs";

/**
 * 전투 행동 실행 (PC/NPC 공통 G3). 액션 키에 따라 AP 검사·차감·후속 flag·AE 생성·채팅 카드.
 *
 * @param {{ actor: Actor, actionKey: string }} params
 */
export async function resolveCombatAction({ actor, actionKey }) {
  const combat = game.combat;
  if (!combat?.started) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.notInCombat"));
    return;
  }
  const combatant = combat.combatants.find((c) => c.actor?.id === actor.id);
  if (!combatant) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.noCombatantForActor"));
    return;
  }

  // 라운드 사용 카운터 — defend/charge는 룰북 1라운드 1회 제한.
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
  let chargeChoice = null; // 차지 선택("ap" | "unison") — G3-γ 회수 대상
  let dashX = 0; // 대쉬 입력값 — AE duration.rounds: 1로 다음 라운드 끝까지 system.speed +X

  switch (actionKey) {
    case "throw": {
      // 캔버스 사전 타게팅 — 적 1체만 허용. 시전자가 PC면 적은 NPC, NPC면 적은 PC(N3).
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

  // 액션별 후속 flag·효과.
  // - defend: 라운드 카운터 +1, defendActive 켜 다음 대미지 적용 시 자동 차감.
  // - charge: 라운드 카운터 +1, 선택 보존(G3-γ가 다음 라운드 시작 시 회수).
  // - focus: focusActive 켜 다음 한 번의 판정에 다이스 +1 (적용 후 자동 해제).
  // - dash: 1라운드 만료 AE로 system.speed +X — Foundry duration이 자동 만료 처리.
  // - unisonPrepare: 합체기 준비(G4에서 활용).
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
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("ASTER.combat.action.dash"),
        img: "icons/svg/lightning.svg",
        changes: [
          {
            key: "system.speed",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: dashX,
            priority: 20,
          },
        ],
        // combat 매개는 Foundry 라운드 기반 만료 흐름에 필요(없으면 자동 만료 안 됨).
        duration: { rounds: 1, startRound: combat.round, combat: combat.id },
        flags: { aster: { sourceAction: "dash" } },
      },
    ]);
  } else if (actionKey === "unisonPrepare") {
    await combatant.setFlag("aster", "unisonReady", true);
  }

  const actionName = game.i18n.localize(`ASTER.combat.action.${actionKey}`);

  // 액션별 flag — 돌던지기는 대미지 적용 정보 포함 (1대미지 자동 추출).
  const actionFlag = { type: actionKey };
  if (actionKey === "throw" && throwTarget) {
    // orphan 토큰이면 targetActorId가 null — 버튼 미노출(대미지 적용 불가).
    actionFlag.sourceActorId = actor.id;
    actionFlag.targetActorId = throwTarget.actor?.id ?? null;
    actionFlag.targetName = throwTarget.name;
    actionFlag.defaultDamage = 1;
    actionFlag.damageApplied = false;
  }

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/combat-action.html",
    {
      actionName,
      apSpent: game.i18n.format("ASTER.combat.apSpent", { n: cost }),
      chatExtra,
      hasDamageButton: !!actionFlag.targetActorId,
    },
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { aster: { combatAction: actionFlag } },
  });
}

/**
 * NPC 스킬(npcAction) 시전 (N3).
 * 흐름: oncePerRound 검사 → 타게팅·X 입력(하이브리드 다이얼로그) → AP 검사 → AP 차감 →
 *       oncePerRound flag 설정 → 효과 적용(damageFormula·addStatus·cureStatus·cureAllStatus) → 시전 카드.
 * AP 진리 원천은 Combatant flag(옵션 A — PC `#onCombatAction`과 통일). `system.ap`은 시트 표시·시드 참고용.
 *
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
  const combatant = combat.combatants.find((c) => c.actor?.id === actor.id);
  if (!combatant) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.noCombatantForActor"));
    return;
  }

  // oncePerRound 검사 — 같은 액션을 이 라운드에 이미 썼는지. AP·다이얼로그보다 앞서 차단(자원·UX 보호).
  const usage = combatant.getFlag("aster", "actionsThisRound") ?? {};
  const usageKey = `npcAction-${itemId}`;
  if (sys.oncePerRound && usage[usageKey]) {
    ui.notifications.warn(
      game.i18n.format("ASTER.npcAction.alreadyUsedThisRound", { name: action.name }),
    );
    return;
  }

  // 1. 하이브리드 다이얼로그 — costVariable 또는 self 이외 대상일 때만.
  let cost = sys.cost;
  let targets = [actor]; // self 기본
  const needsDialog = sys.costVariable || sys.targetType !== "self";

  if (needsDialog) {
    // costVariable=true면 X(AP) 입력.
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

    // 대상 — NPC가 시전하므로 적은 PC(character). all은 PC 전체.
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

  // 2. AP 검사 (다이얼로그 입력 후 — costVariable의 X가 보유 AP를 넘을 수 있음).
  const currentAP = combatant.getFlag("aster", "actionPoint") ?? 0;
  if (currentAP < cost) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.notEnoughAP", { need: cost, have: currentAP }),
    );
    return;
  }

  // 3. AP 차감
  await combatant.setFlag("aster", "actionPoint", currentAP - cost);

  // 4. oncePerRound flag — `npcAction-{itemId}` 키. PC defend·charge 키와 충돌 없음.
  if (sys.oncePerRound) {
    await combatant.setFlag("aster", "actionsThisRound", { ...usage, [usageKey]: true });
  }

  // N6 — 공격 액션(damageFormula 있음 + targetType !== "self") 시 hit 굴림 통합.
  // hit vs dodge 자동 대결 비교는 영역 외 — GM이 시전 카드의 hit 결과를 PC dodge와 수동 비교.
  let hitResult = null;
  if (sys.damageFormula && sys.targetType !== "self") {
    const hitFormula = actor.system.hitFormula?.trim();
    if (hitFormula) {
      // 집중 효과 — combatant의 focusActive flag(checkFocusEffect와 동일 의미). 사용 시 만료.
      const focusActive = combatant.getFlag("aster", "focusActive") === true;
      const fullHitFormula = focusActive ? `${hitFormula} + 1d6` : hitFormula;
      try {
        const hitRoll = new Roll(fullHitFormula);
        await hitRoll.evaluate();
        const hitDice = hitRoll.dice.flatMap((d) => d.values);
        const hitCf = detectCritFumble(hitDice);
        hitResult = {
          formula: hitFormula,
          total: hitRoll.total,
          diceText: hitDice.join(", "),
          isCritical: hitCf.critical,
          isFumble: hitCf.fumble,
        };
        if (focusActive) await combatant.setFlag("aster", "focusActive", false);
      } catch (e) {
        console.warn(
          `[Aster] NPC ${actor.name} hitFormula 평가 실패(시전 통합): "${hitFormula}"`,
          e,
        );
        // 시전 자체는 계속 — hit 결과 미표시.
      }
    }
  }

  // 5. 효과 적용
  const effectResults = [];

  // 5-a. damageFormula 또는 addStatus — damageFormula 없고 addStatus만 있으면 amount=0(상태이상만).
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

  // 5-b. cureAllStatus 우선, 없으면 cureStatus 배열 루프.
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

  // 6. 시전 카드 (hitResult 포함 — 공격 액션이면 hit 굴림 결과 표시)
  await renderNpcActionCard(actor, action, cost, damageTotal, effectResults, hitResult);
}

/**
 * NPC 시전 채팅 카드 렌더. npcAction의 부분 구조화 효과(대미지·상태이상·회복)를 대상별로 표시.
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
    flags: { aster: { npcAction: { actorId: actor.id, actionId: action.id } } },
  });
}

import { lookupUnisonEffect, getUnisonDescription } from "./unison-table.mjs";
import {
  DAMAGE_STATUSES,
  badstatusI18nKey,
  applyCureStatus,
  applyCureAllStatus,
  applyDamageAndStatus,
  applyHealHealth,
} from "./health-status.mjs";
import { getTargetedTokens } from "./target-select.mjs";
import { pickDiceDialog, PICK_RETRY } from "./dice-select.mjs";
import { findCombatantFor, hasAmbiguousCombatants } from "./combatant-match.mjs";

export async function performUnisonAttack({ actor }) {
  const combat = game.combat;
  if (!combat?.started) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.notInCombat"));
    return;
  }
  const selfCombatant = findCombatantFor(combat.combatants, actor);
  if (!selfCombatant) return;
  if (hasAmbiguousCombatants(combat.combatants, actor)) {
    ui.notifications.warn(
      game.i18n.format("ASTER.combat.ambiguousCombatant", { name: selfCombatant.name }),
    );
  }

  // 시트 disabled 분기를 우회한 직접 호출 방어.
  if (selfCombatant.getFlag("aster", "unisonReady") !== true) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonNotReady"));
    return;
  }

  const candidates = combat.combatants.filter(
    (c) =>
      c.id !== selfCombatant.id &&
      c.actor?.type === "character" &&
      c.getFlag("aster", "unisonReady") === true,
  );
  if (candidates.length === 0) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonNoPair"));
    return;
  }

  const pairOptions = candidates
    .map((c) => `<option value="${c.id}">${c.actor.name}</option>`)
    .join("");
  const pairId = await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.combat.unisonPairTitle") },
    content: `<div class="form-group">
      <label>${game.i18n.localize("ASTER.combat.unisonPairLabel")}</label>
      <select name="pair">${pairOptions}</select>
    </div>`,
    ok: { callback: (_e, b) => b.form.elements.pair.value },
  }).catch(() => null);
  if (!pairId) return;
  const pairCombatant = combat.combatants.get(pairId);
  const pairActor = pairCombatant?.actor;
  if (!pairActor) return;

  const selfColor = actor.system.color;
  const pairColor = pairActor.system.color;
  if (!selfColor || !pairColor) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonNoColor"));
    return;
  }
  if (selfColor === pairColor) {
    ui.notifications.warn(game.i18n.localize("ASTER.combat.unisonSameColor"));
    return;
  }

  const colorLabel = (k) => game.i18n.localize(`ASTER.aster.${k}`);
  const previewHtml = (main) => {
    const sub = main === selfColor ? pairColor : selfColor;
    const head = game.i18n.format("ASTER.combat.unisonColorPreview", {
      main: colorLabel(main),
      sub: colorLabel(sub),
    });
    return `<p>${head}</p>
      <p>${game.i18n.localize(`ASTER.combat.unisonMainDesc.${main}`)}</p>
      <p>${game.i18n.localize(`ASTER.combat.unisonSubDesc.${sub}`)}</p>`;
  };
  const mainColor = await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.combat.unisonMainColorTitle") },
    content: `<div class="form-group">
      <label>${game.i18n.localize("ASTER.combat.unisonMainLabel")}</label>
      <select name="main">
        <option value="${selfColor}">${actor.name} — ${colorLabel(selfColor)}</option>
        <option value="${pairColor}">${pairActor.name} — ${colorLabel(pairColor)}</option>
      </select>
    </div>
    <div class="unison-color-preview">${previewHtml(selfColor)}</div>`,
    render: (_event, dialog) => {
      // V13 DialogV2 render 인자가 dialog 또는 element로 온다.
      const el = dialog?.element ?? dialog;
      const select = el?.querySelector?.('select[name="main"]');
      const box = el?.querySelector?.(".unison-color-preview");
      if (!select || !box) return;
      select.addEventListener("change", () => {
        box.innerHTML = previewHtml(select.value);
      });
    },
    ok: { callback: (_e, b) => b.form.elements.main.value },
  }).catch(() => null);
  if (!mainColor) return;
  const subColor = mainColor === selfColor ? pairColor : selfColor;

  await proceedUnisonDice({
    selfCombatant,
    pairCombatant,
    selfActor: actor,
    pairActor,
    mainColor,
    subColor,
  });
}

async function proceedUnisonDice({
  selfCombatant,
  pairCombatant,
  selfActor,
  pairActor,
  mainColor,
  subColor,
}) {
  const selfRoll = new Roll("1d6");
  await selfRoll.evaluate();
  const pairRoll = new Roll("1d6");
  await pairRoll.evaluate();

  const selfCharge = selfCombatant.getFlag("aster", "chargeNextRound") === "unison";
  const pairCharge = pairCombatant.getFlag("aster", "chargeNextRound") === "unison";

  let selfFinal = selfRoll.total;
  let pairFinal = pairRoll.total;
  const extraInfo = []; // 채팅 카드용 — 차지 추가 다이스 표시

  if (selfCharge) {
    const extraRoll = new Roll("1d6");
    await extraRoll.evaluate();
    const opts = {
      dice: [selfRoll.total, extraRoll.total],
      count: 1,
      title: game.i18n.format("ASTER.combat.unisonChargePickTitle", { actor: selfActor.name }),
      hint: game.i18n.format("ASTER.combat.unisonChargePickHint", { count: 1 }),
    };
    let picked = await pickDiceDialog(opts);
    if (picked === PICK_RETRY) picked = await pickDiceDialog(opts);
    if (!picked || picked === PICK_RETRY) return;
    selfFinal = picked.selected[0];
    extraInfo.push({
      actor: selfActor.name,
      original: selfRoll.total,
      extra: extraRoll.total,
      picked: selfFinal,
    });
  }
  if (pairCharge) {
    const extraRoll = new Roll("1d6");
    await extraRoll.evaluate();
    const opts = {
      dice: [pairRoll.total, extraRoll.total],
      count: 1,
      title: game.i18n.format("ASTER.combat.unisonChargePickTitle", { actor: pairActor.name }),
      hint: game.i18n.format("ASTER.combat.unisonChargePickHint", { count: 1 }),
    };
    let picked = await pickDiceDialog(opts);
    if (picked === PICK_RETRY) picked = await pickDiceDialog(opts);
    if (!picked || picked === PICK_RETRY) return;
    pairFinal = picked.selected[0];
    extraInfo.push({
      actor: pairActor.name,
      original: pairRoll.total,
      extra: extraRoll.total,
      picked: pairFinal,
    });
  }

  if (selfCharge) await selfCombatant.setFlag("aster", "chargeNextRound", null);
  if (pairCharge) await pairCombatant.setFlag("aster", "chargeNextRound", null);

  const total = selfFinal + pairFinal;

  // 주속성 효과 자동 적용 — 부속성 다이얼로그 *전*이라 부속성 취소해도 주속성은 적용 보존.
  const mainResult = await applyUnisonMainEffect({ mainColor, total });

  await applyUnisonSubEffect({
    selfActor,
    pairActor,
    mainColor,
    subColor,
    selfFinal,
    pairFinal,
    total,
    extraInfo,
    mainResult,
  });

  await selfCombatant.setFlag("aster", "unisonReady", false);
  await pairCombatant.setFlag("aster", "unisonReady", false);
}

/**
 * lookup 결과 null이면 자동 적용 안 함 (GM 수동 처리 — 카드에 안내).
 *
 * @returns {Promise<object|null>}  적용 결과 (mainResult) 또는 null (자동 처리 안 함)
 */
async function applyUnisonMainEffect({ mainColor, total }) {
  const effect = lookupUnisonEffect(mainColor, total);
  // RollTable 플레이버 텍스트 — effect null(합산 3·4 실패)이어도 조회 가능.
  const description = getUnisonDescription(mainColor, total);

  if (!effect) {
    return description ? { type: "description-only", description } : null;
  }

  switch (effect.type) {
    case "damage": {
      if (effect.targetType === "enemy-single") {
        // 적표 — 캔버스 타겟 1체 필수
        const targets = getTargetedTokens({
          required: true,
          max: 1,
          allowedTypes: "npc",
        });
        if (!targets) return null; // 검증 실패 — 자동 적용 건너뜀
        const target = targets[0].actor;
        const { hBefore, hAfter } = await applyDamageAndStatus(target, effect.amount, []);
        return {
          type: "damage",
          targetType: "enemy-single",
          targets: [{ name: target.name, before: hBefore, after: hAfter, delta: hAfter - hBefore }],
          amount: effect.amount,
          selfTurnEnd: effect.selfTurnEnd === true,
          description,
        };
      } else if (effect.targetType === "enemy-all") {
        // 녹표 — Combat 참가 NPC 전체 자동
        const combat = game.combat;
        if (!combat) return null;
        const npcs = combat.combatants.filter((c) => c.actor?.type === "npc").map((c) => c.actor);
        if (npcs.length === 0) return null;
        const targetResults = [];
        for (const npc of npcs) {
          const { hBefore, hAfter } = await applyDamageAndStatus(npc, effect.amount, []);
          targetResults.push({
            name: npc.name,
            before: hBefore,
            after: hAfter,
            delta: hAfter - hBefore,
          });
        }
        return {
          type: "damage",
          targetType: "enemy-all",
          targets: targetResults,
          amount: effect.amount,
          selfTurnEnd: effect.selfTurnEnd === true,
          description,
        };
      }
      return null;
    }
    case "heal": {
      if (effect.targetType === "ally-all") {
        // 청표 — 게임 PC 전체 자동
        const allyPCs = game.actors.filter((a) => a.type === "character");
        const results = await applyHealHealth(allyPCs, effect.amount);
        return {
          type: "heal",
          targetType: "ally-all",
          // applyHealHealth는 actorName 반환 — 카드 렌더링(t.name)과 데미지 결과 형식에 맞춰 정규화.
          // blocked(전투 중 건강 0 차단) 플래그 보존 — 카드에서 해당 PC만 차단 안내.
          targets: results.map((r) => ({
            name: r.actorName,
            before: r.before,
            after: r.after,
            delta: r.delta,
            blocked: r.blocked === true,
          })),
          amount: effect.amount,
          selfTurnEnd: effect.selfTurnEnd === true,
          description,
        };
      }
      return null;
    }

    // 황표 5~11 — Combat 참가 PC 전체에 1라운드 수신 대미지 감소
    case "damage-reduction": {
      const partyCombatants =
        game.combat?.combatants.filter((c) => c.actor?.type === "character") ?? [];
      const targetNames = [];
      for (const c of partyCombatants) {
        await c.setFlag("aster", "damageReduction", effect.amount);
        await c.setFlag("aster", "damageBlocked", false); // 중복 부착 시 무효 해제
        targetNames.push(c.actor.name);
      }
      return {
        type: "damage-reduction",
        amount: effect.amount,
        targetNames,
        selfTurnEnd: effect.selfTurnEnd === true,
        description,
      };
    }

    // 황표 12+ — Combat 참가 PC 전체에 1라운드 대미지 무효
    case "damage-block": {
      const partyCombatants =
        game.combat?.combatants.filter((c) => c.actor?.type === "character") ?? [];
      const targetNames = [];
      for (const c of partyCombatants) {
        await c.setFlag("aster", "damageBlocked", true);
        await c.setFlag("aster", "damageReduction", 0); // 무효가 감소 덮어쓰기
        targetNames.push(c.actor.name);
      }
      return {
        type: "damage-block",
        targetNames,
        selfTurnEnd: effect.selfTurnEnd === true,
        description,
      };
    }

    // 청표 12+ — 게임 PC 전체 회복 + 상태이상 전부 치료
    case "heal-and-cure-all": {
      const allyPCs = game.actors.filter((a) => a.type === "character");
      const healResults = await applyHealHealth(allyPCs, effect.amount);
      const cureResults = await applyCureAllStatus(allyPCs);
      return {
        type: "heal-and-cure-all",
        targetType: "ally-all",
        targets: healResults.map((r) => ({
          name: r.actorName,
          before: r.before,
          after: r.after,
          delta: r.delta,
          blocked: r.blocked === true,
        })),
        amount: effect.amount,
        cureResults,
        selfTurnEnd: effect.selfTurnEnd === true,
        description,
      };
    }

    default:
      return null;
  }
}

/**
 * white는 부속성 표가 없어 default로 빠지고 subResult가 null이 된다.
 */
async function applyUnisonSubEffect({
  selfActor,
  pairActor,
  mainColor,
  subColor,
  selfFinal,
  pairFinal,
  total,
  extraInfo,
  mainResult,
}) {
  let subResult = null;
  switch (subColor) {
    case "red":
      subResult = await unisonSubRed();
      break;
    case "blue":
      subResult = await unisonSubBlue();
      break;
    case "green":
      subResult = await unisonSubGreen();
      break;
    case "yellow":
      subResult = await unisonSubYellow();
      break;
    default:
      break;
  }

  await renderUnisonCard({
    selfActor,
    pairActor,
    mainColor,
    subColor,
    selfFinal,
    pairFinal,
    total,
    extraInfo,
    mainResult,
    subResult,
  });
}

/** 적 부속성: 임의 상태이상 1개 → 아군(시나리오 PC 전체) 회복. 광역 회복이므로 전투 외 PC도 포함. */
async function unisonSubRed() {
  const statusOptions = DAMAGE_STATUSES.map(
    (s) => `<option value="${s.key}">${game.i18n.localize(badstatusI18nKey(s.key))}</option>`,
  ).join("");
  const statusKey = await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.combat.unisonSubRedTitle") },
    content: `<div class="form-group">
      <label>${game.i18n.localize("ASTER.combat.unisonSubRedLabel")}</label>
      <select name="status">${statusOptions}</select>
    </div>`,
    ok: { callback: (_e, b) => b.form.elements.status.value },
  }).catch(() => null);
  if (!statusKey) return null;

  const partyPCs = game.actors.filter((a) => a.type === "character");
  const results = await applyCureStatus(partyPCs, statusKey);
  return { type: "red", statusKey, results };
}

/** 청 부속성: 전투 참가 아군 1인 다음 판정 +1d6. */
async function unisonSubBlue() {
  const combat = game.combat;
  const partyCombatants = combat.combatants.filter((c) => c.actor?.type === "character");
  const allyOptions = partyCombatants
    .map((c) => `<option value="${c.id}">${c.actor.name}</option>`)
    .join("");
  const allyCombatantId = await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.combat.unisonSubBlueTitle") },
    content: `<div class="form-group">
      <label>${game.i18n.localize("ASTER.combat.unisonSubBlueLabel")}</label>
      <select name="ally">${allyOptions}</select>
    </div>`,
    ok: { callback: (_e, b) => b.form.elements.ally.value },
  }).catch(() => null);
  if (!allyCombatantId) return null;

  const target = combat.combatants.get(allyCombatantId);
  if (!target?.actor) return null;
  await target.setFlag("aster", "focusActive", true);
  return { type: "blue", actorName: target.actor.name };
}

/** 녹 부속성: 전투 참가 아군 1인 민첩 ±20 1라운드. 대쉬와 같이 다음 라운드 시작에 걸린다. */
async function unisonSubGreen() {
  const combat = game.combat;
  const partyCombatants = combat.combatants.filter((c) => c.actor?.type === "character");
  const allyOptions = partyCombatants
    .map((c) => `<option value="${c.id}">${c.actor.name}</option>`)
    .join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.combat.unisonSubGreenTitle") },
    content: `<div class="form-group">
      <label>${game.i18n.localize("ASTER.combat.unisonSubGreenAllyLabel")}</label>
      <select name="ally">${allyOptions}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("ASTER.combat.unisonSubGreenDirectionLabel")}</label>
      <select name="dir"><option value="20">+20</option><option value="-20">-20</option></select>
    </div>`,
    ok: {
      callback: (_e, b) => ({
        allyId: b.form.elements.ally.value,
        delta: Number(b.form.elements.dir.value),
      }),
    },
  }).catch(() => null);
  if (!result) return null;

  const target = combat.combatants.get(result.allyId);
  if (!target?.actor) return null;
  const pending = target.getFlag("aster", "unisonGreenNextRound") ?? 0;
  await target.setFlag("aster", "unisonGreenNextRound", pending + result.delta);
  return { type: "green", actorName: target.actor.name, delta: result.delta };
}

/** 황 부속성: 캔버스 타게팅한 적 1체에 부상/졸림/피로 중 1개 부여. 이미 상태이면 변화 없음. */
async function unisonSubYellow() {
  const targets = getTargetedTokens({ required: true, max: 1, allowedTypes: "npc" });
  if (!targets) return null;
  const targetActor = targets[0].actor;
  if (!targetActor) return null;

  const allowedKeys = ["injury", "sleepy", "exhaustion"];
  const statusOptions = allowedKeys
    .map((k) => `<option value="${k}">${game.i18n.localize(badstatusI18nKey(k))}</option>`)
    .join("");
  const statusKey = await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: { title: game.i18n.localize("ASTER.combat.unisonSubYellowTitle") },
    content: `<div class="form-group">
      <label>${game.i18n.localize("ASTER.combat.unisonSubYellowLabel")}</label>
      <select name="status">${statusOptions}</select>
    </div>`,
    ok: { callback: (_e, b) => b.form.elements.status.value },
  }).catch(() => null);
  if (!statusKey) return null;

  const current = targetActor.system.badstatus?.[statusKey] ?? false;
  if (!current) {
    await targetActor.update({ [`system.badstatus.${statusKey}`]: true });
  }
  return { type: "yellow", actorName: targetActor.name, statusKey, applied: !current };
}

async function renderUnisonCard({
  selfActor,
  pairActor,
  mainColor,
  subColor,
  selfFinal,
  pairFinal,
  total,
  extraInfo,
  mainResult,
  subResult,
}) {
  const colorLabel = (k) => game.i18n.localize(`ASTER.aster.${k}`);
  const badstatusLabel = (key) => game.i18n.localize(badstatusI18nKey(key));
  const healLineFor = (t) =>
    t.blocked === true
      ? game.i18n.format("ASTER.combat.unisonHealBlockedLine", { name: t.name })
      : t.delta > 0
        ? game.i18n.format("ASTER.combat.unisonHealLine", {
            name: t.name,
            before: t.before,
            after: t.after,
            delta: t.delta,
          })
        : game.i18n.format("ASTER.combat.unisonHealAlreadyMax", { name: t.name });

  let subResultText = "";
  if (subResult) {
    switch (subResult.type) {
      case "red": {
        const cured = subResult.results.filter((r) => r.cured).map((r) => r.actorName);
        subResultText = game.i18n.format("ASTER.combat.unisonSubRedResult", {
          status: badstatusLabel(subResult.statusKey),
          actors: cured.length
            ? cured.join(", ")
            : game.i18n.localize("ASTER.combat.unisonSubRedNone"),
        });
        break;
      }
      case "blue":
        subResultText = game.i18n.format("ASTER.combat.unisonSubBlueResult", {
          actor: subResult.actorName,
        });
        break;
      case "green":
        subResultText = game.i18n.format("ASTER.combat.unisonSubGreenResult", {
          actor: subResult.actorName,
          delta: subResult.delta > 0 ? `+${subResult.delta}` : `${subResult.delta}`,
        });
        break;
      case "yellow":
        subResultText = game.i18n.format(
          subResult.applied
            ? "ASTER.combat.unisonSubYellowResult"
            : "ASTER.combat.unisonSubYellowAlready",
          { target: subResult.actorName, status: badstatusLabel(subResult.statusKey) },
        );
        break;
    }
  }

  // mainResult가 null이면 GM 안내(mainTableHint)와 양자택일이다.
  let mainResultText = "";
  let hasMainResult = false;
  if (mainResult) {
    hasMainResult = true;
    switch (mainResult.type) {
      case "damage": {
        const targetLines = mainResult.targets
          .map((t) =>
            game.i18n.format("ASTER.combat.unisonDamageLine", {
              name: t.name,
              before: t.before,
              after: t.after,
              delta: t.delta,
            }),
          )
          .join("<br>");
        mainResultText = game.i18n.format("ASTER.combat.unisonMainDamageText", {
          amount: mainResult.amount,
          targets: targetLines,
        });
        break;
      }
      case "heal": {
        const targetLines = mainResult.targets.map(healLineFor).join("<br>");
        mainResultText = game.i18n.format("ASTER.combat.unisonMainHealText", {
          amount: mainResult.amount,
          targets: targetLines,
        });
        break;
      }

      // 황표 5~11 — 수신 대미지 감소
      case "damage-reduction": {
        mainResultText = game.i18n.format("ASTER.combat.unisonYellowReductionText", {
          amount: mainResult.amount,
          targets: mainResult.targetNames.join(", "),
        });
        break;
      }

      // 황표 12+ — 대미지 무효
      case "damage-block": {
        mainResultText = game.i18n.format("ASTER.combat.unisonYellowBlockText", {
          targets: mainResult.targetNames.join(", "),
        });
        break;
      }

      // 청표 12+ — 회복 + 상태이상 전부 치료
      case "heal-and-cure-all": {
        const healLines = mainResult.targets.map(healLineFor).join("<br>");
        const cureLines = mainResult.cureResults
          .filter((r) => r.curedKeys.length > 0)
          .map((r) =>
            game.i18n.format("ASTER.combat.unisonCureLine", {
              name: r.actorName,
              keys: r.curedKeys.map((k) => badstatusLabel(k)).join(", "),
            }),
          )
          .join("<br>");
        const cureSection = cureLines
          ? `<br>${game.i18n.localize("ASTER.combat.unisonCureSection")}<br>${cureLines}`
          : "";
        mainResultText =
          game.i18n.format("ASTER.combat.unisonHealAndCureText", {
            amount: mainResult.amount,
            targets: healLines,
          }) + cureSection;
        break;
      }
    }
  }

  if (mainResult?.type === "description-only") {
    // 효과 없이 텍스트만 (합산 3·4 실패 등) — hasMainResult를 켜서 GM 힌트 대신 텍스트 표시.
    hasMainResult = true;
    mainResultText = mainResult.description;
  } else if (mainResult?.description) {
    // 효과 결과 *앞*에 플레이버 텍스트 (룰북 서사 → 시스템 적용 순서).
    mainResultText = `<em class="unison-flavor">${mainResult.description}</em><br>${mainResultText}`;
  }

  // RollTable description에 "행동완료" 텍스트가 이미 포함되면 시스템 라인 중복 출력 방지.
  const hasSelfTurnEnd = mainResult?.selfTurnEnd === true;
  const descIncludesSelfWarn = mainResult?.description?.includes("행동완료") === true;
  const showSelfTurnEndLine = hasSelfTurnEnd && !descIncludesSelfWarn;

  const selfExtra = extraInfo.find((e) => e.actor === selfActor.name);
  const pairExtra = extraInfo.find((e) => e.actor === pairActor.name);

  const cardData = {
    title: game.i18n.localize("ASTER.combat.unisonAttackTitle"),
    pairLabel: game.i18n.format("ASTER.combat.unisonPairLine", {
      self: selfActor.name,
      pair: pairActor.name,
    }),
    mainColor,
    subColor,
    mainLabel: game.i18n.localize("ASTER.combat.unisonMainLabel"),
    subLabel: game.i18n.localize("ASTER.combat.unisonSubLabel"),
    mainColorLabel: colorLabel(mainColor),
    subColorLabel: colorLabel(subColor),
    selfActorName: selfActor.name,
    pairActorName: pairActor.name,
    selfFinal,
    pairFinal,
    total,
    selfExtra: !!selfExtra,
    selfOriginal: selfExtra?.original,
    selfExtraDice: selfExtra?.extra,
    pairExtra: !!pairExtra,
    pairOriginal: pairExtra?.original,
    pairExtraDice: pairExtra?.extra,
    totalLabel: game.i18n.localize("ASTER.combat.unisonTotalLabel"),
    // 자동 적용 완료 시 GM 안내 숨김 — hasMainResult ↔ mainTableHint 양자택일.
    mainTableHint: hasMainResult
      ? null
      : game.i18n.format("ASTER.combat.unisonMainTableHint", {
          color: colorLabel(mainColor),
          total,
        }),
    hasMainResult,
    mainEffectLabel: game.i18n.format("ASTER.combat.unisonMainEffectLabel", {
      color: colorLabel(mainColor),
    }),
    mainResultText,
    subResult,
    subEffectLabel: game.i18n.format("ASTER.combat.unisonSubEffectLabel", {
      color: colorLabel(subColor),
    }),
    subResultText,
    dodgeBlockNote: game.i18n.localize("ASTER.combat.unisonDodgeBlocked"),
    turnEndNote: game.i18n.localize("ASTER.combat.unisonTurnEnd"),
    hasSelfTurnEnd,
    showSelfTurnEndLine,
    selfTurnEndLine: showSelfTurnEndLine
      ? game.i18n.format("ASTER.combat.unisonSelfTurnEndLine", {
          self: selfActor.name,
          pair: pairActor.name,
        })
      : null,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/aster/templates/chat/unison-attack.html",
    cardData,
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: selfActor }),
  });
}

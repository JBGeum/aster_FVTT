/**
 * Aster 전투 문서.
 * 이니셔티브 = 민첩(`system.speed`) 비교, 다이스 굴림 없음.
 * 동률 시 PC 우선만 자동 처리하고, PC끼리·NPC끼리는 GM이 수동 조정(룰: 의논·자유 결정).
 * @extends {Combat}
 */
export class AsterCombat extends Combat {
  /**
   * 전투원 정렬. 이니셔티브(=민첩) 높은 순, 동률이면 PC 우선.
   * @param {Combatant} a
   * @param {Combatant} b
   * @returns {number}
   * @override
   */
  _sortCombatants(a, b) {
    // 이니셔티브 높은 순. 미굴림(null)은 -Infinity로 최하위.
    const ia = Number(a.initiative ?? -Infinity);
    const ib = Number(b.initiative ?? -Infinity);
    if (ia !== ib) return ib - ia;

    // 동률이면 PC 우선.
    const aIsPC = a.actor?.type === "character";
    const bIsPC = b.actor?.type === "character";
    if (aIsPC && !bIsPC) return -1;
    if (!aIsPC && bIsPC) return 1;

    // PC끼리 또는 NPC끼리 동률은 시스템 미개입 (GM 의논/자유 결정).
    // Array.sort는 안정 정렬이므로 0 반환 시 기존(삽입) 순서가 보존된다.
    return 0;
  }

  /**
   * 액터 추가 시 자동으로 이니셔티브 결정 — 민첩 비교, 굴림 없음.
   *
   * `rollInitiative`를 거치지 않고 `system.speed`를 직접 초깃값으로 설정한다:
   * (1) 다이스 없는 결정론적 값이라 굴림 메시지가 무의미하고,
   * (2) V13 `rollInitiative`에는 채팅 억제 옵션이 없어(messageOptions만 존재)
   *     호출 시 채팅이 강제 출력되므로, 직접 update가 채팅을 원천 차단한다.
   *
   * @param {string|string[]} ids  대상 Combatant id 목록
   * @returns {Promise<void>}
   */
  async _autoRollInitiative(ids) {
    const targets = Array.isArray(ids) ? ids : [ids];
    const updates = [];
    for (const id of targets) {
      const c = this.combatants.get(id);
      if (!c || c.initiative != null) continue;
      updates.push({ _id: id, initiative: Number(c.actor?.system?.speed ?? 0) });
    }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
  }

  /**
   * `_onStartRound` 라이프사이클에서 호출 — turn 포인터가 0으로 확정된 "이후"에 실행되므로,
   * 여기서 combatant flag를 수정해도 현재 전투원(turn) 위치가 흔들리지 않는다.
   * @returns {Promise<void>}
   */
  async _startRound() {
    if (!game.user.isGM) return;

    const initiativeUpdates = [];
    for (const c of this.combatants) {
      const speed = Number(c.actor?.system?.speed ?? 0);
      if (c.initiative !== speed) initiativeUpdates.push({ _id: c.id, initiative: speed });
    }
    if (initiativeUpdates.length) {
      await this.updateEmbeddedDocuments("Combatant", initiativeUpdates);
    }

    // PC는 1d6, NPC는 표의 액션 식으로 AP를 굴린다.
    const apResults = []; // { name, ap, base, chargeBonus, isNpc } — 채팅 카드용
    for (const c of this.combatants) {
      if (!c.actor) continue;

      let ap;
      let baseRoll;
      let chargeBonus = null;
      let isNpc = false;

      if (c.actor.type === "character") {
        baseRoll = new Roll("1d6");
        await baseRoll.evaluate();
        ap = baseRoll.total;

        // 차지 AP 보너스 — 이전 라운드에 charge="ap"를 사용했다면 1d6 추가 후 flag 해제.
        // "unison"은 합체기 사용 시 회수되므로 여기서 손대지 않는다.
        if (c.getFlag("aster", "chargeNextRound") === "ap") {
          const bonusRoll = new Roll("1d6");
          await bonusRoll.evaluate();
          ap += bonusRoll.total;
          chargeBonus = bonusRoll.total;
          await c.setFlag("aster", "chargeNextRound", null);
        }
      } else if (c.actor.type === "npc") {
        // NPC: apFormula 평가. 빈 식이면 skip. 평가 실패(잘못된 식)도 skip + console.warn(GM 수동 정정 영역).
        const formula = c.actor.system.apFormula?.trim();
        if (!formula) continue;
        try {
          baseRoll = new Roll(formula);
          await baseRoll.evaluate();
          ap = baseRoll.total;
        } catch (e) {
          console.warn(`[Aster] NPC ${c.actor.name} apFormula 평가 실패: "${formula}"`, e);
          continue;
        }
        isNpc = true;
      } else {
        continue;
      }

      await c.setFlag("aster", "actionPoint", ap);
      await c.setFlag("aster", "actionPointMax", ap);
      // setFlag(키, {})는 flag 객체를 병합해 기존 키가 남는다 — unset으로 지운다.
      await c.unsetFlag("aster", "actionsThisRound");

      // 황표는 1라운드 적용 후 라운드 시작 시 만료된다.
      if (c.getFlag("aster", "damageReduction") > 0) {
        await c.setFlag("aster", "damageReduction", 0);
      }
      if (c.getFlag("aster", "damageBlocked") === true) {
        await c.setFlag("aster", "damageBlocked", false);
      }

      apResults.push({ name: c.actor.name, ap, base: baseRoll.total, chargeBonus, isNpc });
    }

    // Foundry 기본 라운드 만료가 동작하지 않는 케이스의 보조.
    // `duration.combat`은 ForeignDocumentField라 문자열 비교가 불안정해, 식별은 우리 flag로 한다.
    for (const c of this.combatants) {
      if (!c.actor) continue;
      const expired = c.actor.effects.filter((eff) => {
        if (!eff.flags?.aster?.sourceAction) return false;
        const d = eff.duration;
        if (!d?.rounds) return false;
        return this.round - (d.startRound ?? this.round) >= d.rounds;
      });
      if (expired.length) {
        await c.actor.deleteEmbeddedDocuments(
          "ActiveEffect",
          expired.map((e) => e.id),
        );
      }
    }

    if (apResults.length) {
      const chargeBonusLabel = game.i18n.localize("ASTER.combat.chargeBonus");
      const list = apResults
        .map((r) => {
          const bonus = r.chargeBonus
            ? ` <span class="charge-bonus">(${r.base}+${r.chargeBonus} ${chargeBonusLabel})</span>`
            : "";
          const npcClass = r.isNpc ? ' class="npc"' : "";
          return `<li${npcClass}>${r.name}: <strong>${r.ap}</strong>${bonus}</li>`;
        })
        .join("");
      await ChatMessage.create({
        content: `<div class="aster-chat-card combat-round-card">
          <header class="card-header"><div class="title"><div class="name">
            ${game.i18n.format("ASTER.combat.roundStart", { round: this.round })}
          </div></div></header>
          <div class="ap-label">${game.i18n.localize("ASTER.combat.actionPoints")}</div>
          <ul class="ap-list">${list}</ul>
        </div>`,
        speaker: ChatMessage.getSpeaker({
          alias: game.i18n.localize("ASTER.combat.tracker"),
        }),
      });
    }

    // updateCombatant 훅이 각 클라이언트를 갱신하지만, GM의 열린 시트는 여기서 즉시 갱신해
    // 라운드 경계 표시가 stale해지는 것을 막는다.
    for (const c of this.combatants) {
      if (c.actor?.sheet?.rendered) c.actor.sheet.render(false);
    }
  }

  /**
   * 라운드 시작 라이프사이클 (V13 `_manageTurnEvents`). 라운드 1(전투 시작)과 2+ 모두 발화하며,
   * turn=0 커밋 이후·활성 GM에서만 실행된다(`_onEndTurn`과 동일한 보장).
   * 여기서 `_startRound`를 호출해야 combatant flag 수정이 turn 포인터를 흔들지 않는다.
   *
   * @param {object} context
   * @returns {Promise<void>}
   * @override
   */
  async _onStartRound(context) {
    await super._onStartRound?.(context);
    await this._startRound();
  }

  /**
   * 행동완료(턴 종료) 시 부상·큰부상 건강 감소.
   * V13 표준 오버라이드 포인트 — 턴이 끝난 Combatant를 직접 받고, 단일 GM에서만 실행되며,
   * 라운드 경계의 마지막 Combatant도 누락 없이 발화한다.
   * 부상·큰부상 동시 체크 시 둘 다 누적 적용(룰북 미명시 → 보수적 해석, 사용자 확정).
   *
   * @param {Combatant} combatant  턴이 끝난 Combatant
   * @param {object} context
   * @returns {Promise<void>}
   * @override
   */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    const actor = combatant?.actor;
    if (!actor) return;

    const injury = await actor._applyInjuryHealthLoss();
    const bigInjury = await actor._applyBigInjuryHealthLoss();
    if (!injury.applied && !bigInjury.applied) return;

    const lines = [];
    if (injury.applied) {
      lines.push(
        game.i18n.format("ASTER.combat.injuryLine", {
          before: injury.before,
          after: injury.after,
          delta: injury.delta,
        }),
      );
    }
    if (bigInjury.applied) {
      lines.push(
        game.i18n.format("ASTER.combat.bigInjuryLine", {
          before: bigInjury.before,
          after: bigInjury.after,
          delta: bigInjury.delta,
        }),
      );
    }

    // 둘 다 적용되면 -2 → -5 순서로 update되므로 최종 건강은 큰부상 결과.
    const finalHealth = bigInjury.applied ? bigInjury.after : injury.after;
    if (finalHealth === 0) {
      lines.push(`<span class="warn-zero">${game.i18n.localize("ASTER.combat.healthZero")}</span>`);
    }

    await ChatMessage.create({
      content: `<div class="aster-chat-card combat-injury-card">
        <header class="card-header"><div class="title"><div class="name">
          ${actor.name}
        </div></div></header>
        <ul class="injury-lines">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor }),
    });
  }

  /**
   * 전투 종료 시 큰부상 → 부상 전이. `deleteCombat` hook에서 호출.
   * hook은 모든 클라이언트에서 발화하므로 GM 가드 필수.
   *
   * @returns {Promise<void>}
   */
  async _endCombat() {
    if (!game.user.isGM) return;

    const transitioned = [];
    const revived = [];
    for (const c of this.combatants) {
      if (c.actor?.type !== "character") continue;
      const did = await c.actor._transitionBigInjuryToInjury();
      if (did) transitioned.push(c.actor.name);
      // 전투 종료 시 행동불능(건강 0) PC는 건강 1로 자동 회복한다.
      if ((c.actor.system.health?.value ?? 0) === 0) {
        await c.actor.update({ "system.health.value": 1 });
        revived.push(c.actor.name);
      }
    }

    const speaker = ChatMessage.getSpeaker({
      alias: game.i18n.localize("ASTER.combat.tracker"),
    });

    if (transitioned.length) {
      const list = transitioned.map((n) => `<li>${n}</li>`).join("");
      await ChatMessage.create({
        content: `<div class="aster-chat-card combat-end-card">
          <header class="card-header"><div class="title"><div class="name">
            ${game.i18n.localize("ASTER.combat.endTransition")}
          </div></div></header>
          <ul class="transition-list">${list}</ul>
        </div>`,
        speaker,
      });
    }

    if (revived.length) {
      const list = revived
        .map((n) => `<li>${game.i18n.format("ASTER.revive.autoLine", { name: n })}</li>`)
        .join("");
      await ChatMessage.create({
        content: `<div class="aster-chat-card revive-auto-card">
          <header class="card-header"><div class="title"><div class="name">
            ${game.i18n.localize("ASTER.revive.autoTitle")}
          </div></div></header>
          <ul class="revived-lines">${list}</ul>
        </div>`,
        speaker,
      });
    }
  }
}

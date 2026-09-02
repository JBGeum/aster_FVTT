import { asterRoll } from "./roll.mjs";
import { detectCritFumble, computePenalties, critFumbleCardPath } from "../helpers/roll-result.mjs";
import { syncBadstatusEffect } from "../helpers/badstatus-effects.mjs";
import { computeAbilityCheck } from "../helpers/ability-check.mjs";
import { promptAbilityCheck } from "../helpers/check-dialog.mjs";
import { checkFocusEffect } from "../helpers/focus-effect.mjs";
import { pickTwoIfNeeded } from "../helpers/dice-select.mjs";

/** @extends {Actor} */
export class AsterActor extends Actor {
  /** @override */
  async _preUpdate(changes, options, user) {
    await super._preUpdate(changes, options, user);

    // 실제 동기화는 _onUpdate에서 — 여기서는 변경 키만 기록한다.
    const bs = changes?.system?.badstatus;
    if (!bs) return;
    options.aster ??= {};
    options.aster.badstatusChanged = Object.keys(bs);
  }

  /** @override */
  _onUpdate(changes, options, userId) {
    super._onUpdate(changes, options, userId);
    if (game.userId !== userId) return; // 자기 변경에만 반응

    const keys = options?.aster?.badstatusChanged;
    if (!keys?.length) return;

    for (const k of keys) {
      const active = this.system.badstatus?.[k] === true;
      syncBadstatusEffect(this, k, active); // fire & forget
    }
  }

  getRollData() {
    const data = super.getRollData();

    this._getCharacterRollData(data);

    return data;
  }

  _getCharacterRollData(data) {
    if (this.type !== "character") return;

    // 굴림 식에서 `@active` 처럼 참조할 수 있도록 최상위로 복사한다.
    if (data.abilities) {
      for (const [k, v] of Object.entries(data.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    if (data.attributes.level) {
      data.lvl = data.attributes.level.value ?? 0;
    }
  }

  async rollAbility(ability, label, options = {}) {
    // NPC는 능력치 시스템 없음(식 기반 hitFormula·dodgeFormula). system.ability 접근 전에 가드.
    if (this.type !== "character") {
      ui.notifications.warn(game.i18n.localize("ASTER.ability.pcOnly"));
      return;
    }

    const isVs = this.system.rollMode === "vs";
    let target = this.system.dc;
    let modifier = 0;
    if (!options.skipDialog) {
      const input = await promptAbilityCheck({
        label,
        defaultTarget: this.system.dc,
        showTarget: !isVs,
      });
      if (!input) return;
      target = input.target;
      modifier = input.modifier;
    }
    // 0이면 카드에서 보정 줄을 생략한다.
    const modifierText = modifier === 0 ? null : modifier > 0 ? `+${modifier}` : String(modifier);

    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const ablValue = this.system.ability[ability].total;

    const focus = checkFocusEffect(this);
    const roll = await asterRoll(ablValue, this.getRollData(), {
      baseDice: 2 + focus.extraDice,
    });

    const pick = await pickTwoIfNeeded({ roll, dice: roll.dice[0].values });
    if (!pick) return;

    // 선택을 마쳐야 집중을 소비한다 — 취소하면 다시 쓸 수 있어야 한다.
    if (focus.combatant) {
      await focus.combatant.setFlag("aster", "focusActive", false);
    }

    const resultDiceset = pick.selected;
    const diceText = resultDiceset.join(", ");
    const cf = detectCritFumble(resultDiceset);
    const focusApplied = !!focus.combatant;

    const penalties = computePenalties(this);
    const check = computeAbilityCheck({
      rawTotal: pick.rawTotal,
      modifier,
      penalties,
      target: isVs ? null : target,
      critical: cf.critical,
      fumble: cf.fumble,
    });
    const adjustedTotal = check.achievement;

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });

    if (isVs) {
      // 상대측 굴림이 있어야 승패가 정해지므로 카드에는 본 액터 정보만 싣는다.
      const templateData = {
        label,
        ablValue,
        result: roll.result,
        total: adjustedTotal,
        rawTotal: pick.rawTotal,
        penalties,
        modifierText,
        resultDiceset,
        diceText,
        isCritical: cf.critical,
        isFumble: cf.fumble,
        focusApplied,
        actorId: this.id,
        actorName: this.name,
        isPC: this.type === "character",
        opposed: true, // 전용 카드(roll-critfumble)에서 대결 결합 푸터 유지용
      };
      const content = await renderTemplate(
        critFumbleCardPath(cf, "systems/aster/templates/chatcard/roll-asterabl-vs.html"),
        templateData,
      );
      await ChatMessage.create({
        content,
        speaker,
        rolls: [roll],
        flags: {
          aster: {
            opposedRoll: {
              actorId: this.id,
              actorName: this.name,
              label,
              ability,
              ablValue,
              total: adjustedTotal,
              dice: resultDiceset,
              isCritical: cf.critical,
              isFumble: cf.fumble,
            },
          },
        },
      });
    } else {
      const isSuccess = check.success;
      const templateData = {
        label,
        ablValue,
        rollDC: target,
        total: adjustedTotal,
        rawTotal: pick.rawTotal,
        penalties,
        modifierText,
        isSuccess,
        trackable: true,
        isCritical: cf.critical,
        isFumble: cf.fumble,
        focusApplied,
        resultDiceset,
        diceText,
        actorId: this.id,
        actorName: this.name,
        isPC: this.type === "character",
      };
      const content = await renderTemplate(
        critFumbleCardPath(cf, "systems/aster/templates/chatcard/roll-asterabl.html"),
        templateData,
      );
      // rolls 배열이 있어야 다이스 애니메이션·소리가 트리거된다.
      await ChatMessage.create({ content, speaker, rolls: [roll] });

      // 졸림 자동 해제: 룰 "한 번 판정에 실패하면 해제" — 일반판정 실패에만 적용.
      // AE는 _onUpdate hook이 지운다.
      if (penalties.sleepy < 0 && !isSuccess) {
        await this.update({ "system.badstatus.sleepy": false });
      }
    }

    await this._decreaseSatietyIfExploration();
  }

  /**
   * `_` prefix는 "내부용/비공식 API" 컨벤션. JS private(`#`)은 외부 호출 불가라
   * 시트에서 호출하기 위해 일반 메서드로 노출한다.
   *
   * @returns {Promise<void>}
   */
  async _decreaseSatietyIfExploration() {
    if (this.type !== "character") return;
    const phase = game.settings.get("aster", "currentPhase");
    if (phase !== "exploration") return;

    const cur = this.system.satiety?.value ?? 0;
    if (cur <= 0) return; // 이미 0이면 무용 update 생략 (DataModel min:0이 막더라도)

    const decrement = this.system.badstatus?.hungry ? 2 : 1;
    const next = Math.max(0, cur - decrement);
    await this.update({ "system.satiety.value": next });
  }

  /**
   * 트리거는 호출자 책임. 건강 0 도달 후 행동불능 처리는 GM 몫이라 수치만 갱신한다.
   *
   * @returns {Promise<{before:number, after:number, delta:number, applied:boolean}>}
   *   applied=false면 조건 미충족(부상 아님·이미 0·NPC). 호출자가 채팅 표시 결정.
   */
  async _applyInjuryHealthLoss() {
    const skip = { before: 0, after: 0, delta: 0, applied: false };
    if (this.type !== "character") return skip;
    if (this.system.badstatus?.injury !== true) return skip;

    const before = this.system.health?.value ?? 0;
    if (before <= 0) return { ...skip, before, after: before };

    const after = Math.max(0, before - 2);
    await this.update({ "system.health.value": after });
    return { before, after, delta: after - before, applied: true };
  }

  /**
   * @returns {Promise<{before:number, after:number, delta:number, applied:boolean}>}
   */
  async _applyBigInjuryHealthLoss() {
    const skip = { before: 0, after: 0, delta: 0, applied: false };
    if (this.type !== "character") return skip;
    if (this.system.badstatus?.bigInj !== true) return skip;

    const before = this.system.health?.value ?? 0;
    if (before <= 0) return { ...skip, before, after: before };

    const after = Math.max(0, before - 5);
    await this.update({ "system.health.value": after });
    return { before, after, delta: after - before, applied: true };
  }

  /**
   * @returns {Promise<{before:number, after:number, delta:number, applied:boolean}>}
   */
  async _applyInjuryHealthLossIfExploration() {
    const skip = { before: 0, after: 0, delta: 0, applied: false };
    const phase = game.settings.get("aster", "currentPhase");
    if (phase !== "exploration") return skip;
    return this._applyInjuryHealthLoss();
  }

  /**
   * @returns {Promise<boolean>}  전이가 일어났으면 true.
   */
  async _transitionBigInjuryToInjury() {
    if (this.type !== "character") return false;
    if (this.system.badstatus?.bigInj !== true) return false;
    await this.update({
      "system.badstatus.bigInj": false,
      "system.badstatus.injury": true,
    });
    return true;
  }

  async rollEmotion(label, _options = {}) {
    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    // 룰: 정동판정 달성치는 어떤 효과로도 증감되지 않음. 항상 2d6.
    const roll = new Roll("2d6");
    await roll.evaluate();
    const resultDiceset = roll.dice[0].values;
    const cf = detectCritFumble(resultDiceset);

    // 룰: 대성공이면 자동 성공, 대실패면 자동 실패(달성치 무시).
    const baseOk = roll.total >= 7;
    const isSuccess = cf.critical || (!cf.fumble && baseOk);
    const templateData = {
      label,
      total: roll.total,
      result: roll.result,
      diceText: resultDiceset.join(", "),
      isCritical: cf.critical,
      isFumble: cf.fumble,
      isSuccess,
      resultDiceset,
      // 특기색은 PL이 수동 +1 할 때 참고하도록 표시만 한다(자동 가산 안 함).
      favColor: this.system.color,
      favColorLabel: this.system.color
        ? game.i18n.localize(`ASTER.aster.${this.system.color}`)
        : "",
      actorId: this.id,
      actorName: this.name,
      isPC: this.type === "character",
    };
    const content = await renderTemplate(
      critFumbleCardPath(cf, "systems/aster/templates/chatcard/roll-asterabl-emo.html"),
      templateData,
    );
    // rolls 배열이 있어야 다이스 애니메이션·소리가 트리거된다.
    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ alias: game.user.name }),
      rolls: [roll],
    });
  }

  /**
   * system.rollMode와 무관하게 대결(vs) 카드를 출력한다.
   *
   * 졸림 자동 해제·포만 자동 감소는 호출하지 않음:
   *  - 회피의 성공/실패는 대결 결과(resolveOpposed)로 결정되어 이 시점엔 미정 → 졸림 해제 보류.
   *  - 전투 중에는 포만 감소를 무시하므로 호출하지 않는다.
   *
   * @returns {Promise<void>}
   */
  async rollDodge() {
    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const label = game.i18n.localize("ASTER.dodge.label");

    // 회피도 일반 판정에 포함되므로 집중이 적용된다.
    const focus = checkFocusEffect(this);

    let roll;
    let dodgeValue;
    let npcFormula = null; // NPC 식 — 카드 표시용(PC는 null이라 기존 능력치 합산 표시 유지)
    if (this.type === "npc") {
      const formula = this.system.dodgeFormula?.trim();
      if (!formula) {
        ui.notifications.warn(game.i18n.localize("ASTER.dodge.npcNoFormula"));
        return;
      }
      // `new Roll`이 복합식을 자동 평가하므로 식 끝에 붙이면 된다.
      npcFormula = focus.extraDice > 0 ? `${formula} + ${focus.extraDice}d6` : formula;
      try {
        roll = new Roll(npcFormula);
        await roll.evaluate();
      } catch (e) {
        console.warn(`[Aster] NPC ${this.name} dodgeFormula 평가 실패: "${formula}"`, e);
        ui.notifications.warn(game.i18n.localize("ASTER.dodge.npcFormulaError"));
        return;
      }
      dodgeValue = 0; // 식 자체가 굴림 — 별도 능력치 합산값 없음
    } else {
      dodgeValue = this.system.dodge ?? 0;
      roll = await asterRoll(dodgeValue, this.getRollData(), {
        baseDice: 2 + focus.extraDice,
      });
    }

    // NPC 식은 다이스 그룹이 여럿이라 평탄화가 필요하다.
    const pick = await pickTwoIfNeeded({ roll, dice: roll.dice.flatMap((d) => d.values) });
    if (!pick) return;

    if (focus.combatant) {
      await focus.combatant.setFlag("aster", "focusActive", false);
    }

    const resultDiceset = pick.selected;
    const diceText = resultDiceset.join(", ");
    const cf = detectCritFumble(resultDiceset);

    const penalties = computePenalties(this, { isDodge: true });
    const adjustedTotal = pick.rawTotal + penalties.total;

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });
    const templateData = {
      label,
      ablValue: dodgeValue,
      formula: npcFormula, // NPC면 식, PC면 null(템플릿이 능력치 합산 표시로 분기)
      result: roll.result,
      total: adjustedTotal,
      rawTotal: pick.rawTotal,
      penalties,
      resultDiceset,
      diceText,
      isCritical: cf.critical,
      isFumble: cf.fumble,
      focusApplied: !!focus.combatant,
      actorId: this.id,
      actorName: this.name,
      isPC: this.type === "character",
      isDodge: true,
      opposed: true, // 전용 카드(roll-critfumble)에서 대결 결합 푸터 유지용
    };
    const content = await renderTemplate(
      critFumbleCardPath(cf, "systems/aster/templates/chatcard/roll-asterabl-vs.html"),
      templateData,
    );
    await ChatMessage.create({
      content,
      speaker,
      rolls: [roll],
      flags: {
        aster: {
          opposedRoll: {
            actorId: this.id,
            actorName: this.name,
            label,
            ability: "dodge",
            ablValue: dodgeValue,
            total: adjustedTotal,
            dice: resultDiceset,
            isCritical: cf.critical,
            isFumble: cf.fumble,
            isDodge: true,
          },
        },
      },
    });
  }

  /**
   * 명중 굴림 (공격 판정 — AP 소비 없는 별도 굴림). NPC 전용 — PC는 spell·consumable 등 시전 시
   * 능력치 합산식으로 자연 굴림하므로 별도 메서드가 필요 없다. NPC는 system.hitFormula 식.
   *
   * @returns {Promise<void>}
   */
  async rollHit() {
    if (this.type !== "npc") {
      ui.notifications.warn(game.i18n.localize("ASTER.hit.pcNotSupported"));
      return;
    }

    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const label = game.i18n.localize("ASTER.hit.label");
    const formula = this.system.hitFormula?.trim();
    if (!formula) {
      ui.notifications.warn(game.i18n.localize("ASTER.hit.npcNoFormula"));
      return;
    }

    const focus = checkFocusEffect(this);
    const fullFormula = focus.extraDice > 0 ? `${formula} + ${focus.extraDice}d6` : formula;

    let roll;
    try {
      roll = new Roll(fullFormula);
      await roll.evaluate();
    } catch (e) {
      console.warn(`[Aster] NPC ${this.name} hitFormula 평가 실패: "${formula}"`, e);
      ui.notifications.warn(game.i18n.localize("ASTER.hit.npcFormulaError"));
      return;
    }

    const pick = await pickTwoIfNeeded({ roll, dice: roll.dice.flatMap((d) => d.values) });
    if (!pick) return;

    if (focus.combatant) {
      await focus.combatant.setFlag("aster", "focusActive", false);
    }

    const resultDiceset = pick.selected;
    const diceText = resultDiceset.join(", ");
    const cf = detectCritFumble(resultDiceset);

    const penalties = computePenalties(this, { isDodge: false });
    const adjustedTotal = pick.rawTotal + penalties.total;

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });
    const templateData = {
      label,
      ablValue: 0, // 식 자체가 굴림 — 별도 능력치 합산값 없음
      formula: fullFormula, // NPC 전용 메서드라 항상 식 전달(카드 표시용)
      result: roll.result,
      total: adjustedTotal,
      rawTotal: pick.rawTotal,
      penalties,
      resultDiceset,
      diceText,
      isCritical: cf.critical,
      isFumble: cf.fumble,
      focusApplied: !!focus.combatant,
      actorId: this.id,
      actorName: this.name,
      isPC: false,
      isDodge: false,
      opposed: true, // 전용 카드(roll-critfumble)에서 대결 결합 푸터 유지용
    };
    const content = await renderTemplate(
      critFumbleCardPath(cf, "systems/aster/templates/chatcard/roll-asterabl-vs.html"),
      templateData,
    );
    await ChatMessage.create({
      content,
      speaker,
      rolls: [roll],
      flags: {
        aster: {
          opposedRoll: {
            actorId: this.id,
            actorName: this.name,
            label,
            ability: "hit",
            ablValue: 0,
            total: adjustedTotal,
            dice: resultDiceset,
            isCritical: cf.critical,
            isFumble: cf.fumble,
            isDodge: false,
          },
        },
      },
    });
  }
}

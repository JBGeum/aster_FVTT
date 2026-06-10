import { asterRoll } from "./roll.mjs";
import { detectCritFumble, computePenalties, critFumbleCardPath } from "../helpers/roll-result.mjs";
import { syncBadstatusEffect } from "../helpers/badstatus-effects.mjs";

/**
 * Combatant의 `focusActive` flag 확인 — 활성 시 다이스 1개 추가 + 적용 대상 Combatant 반환.
 * 호출자는 flag 해제를 위해 반환된 combatant를 사용한다(굴림 성공 여부 무관, 사용=만료).
 * 정동판정(rollEmotion)은 룰북상 어떤 효과로도 증감되지 않으므로 호출하지 않는다.
 *
 * @param {Actor} actor
 * @returns {{extraDice: 0 | 1, combatant: Combatant | null}}
 */
function checkFocusEffect(actor) {
  const combat = game.combat;
  if (!combat) return { extraDice: 0, combatant: null };
  const combatant = combat.combatants.find((c) => c.actor?.id === actor.id);
  if (!combatant) return { extraDice: 0, combatant: null };
  const active = combatant.getFlag("aster", "focusActive") === true;
  return { extraDice: active ? 1 : 0, combatant: active ? combatant : null };
}

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class AsterActor extends Actor {
  /** @override */
  prepareData() {
    // Prepare data for the actor. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded
    // documents or derived data.
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /** @override */
  async _preUpdate(changes, options, user) {
    await super._preUpdate(changes, options, user);

    // badstatus 변경 감지 후 AE 동기화 예약 (실제 동기화는 _onUpdate에서)
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

  /**
   * Override getRollData() that's supplied to rolls.
   */
  getRollData() {
    const data = super.getRollData();

    // Prepare character roll data.
    this._getCharacterRollData(data);
    this._getNpcRollData(data);

    return data;
  }

  /**
   * Prepare character roll data.
   */
  _getCharacterRollData(data) {
    if (this.type !== "character") return;

    // Copy the ability scores to the top level, so that rolls can use
    // formulas like `@str.mod + 4`.
    if (data.abilities) {
      for (const [k, v] of Object.entries(data.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    // Add level for easier access, or fall back to 0.
    if (data.attributes.level) {
      data.lvl = data.attributes.level.value ?? 0;
    }
  }

  /**
   * Prepare NPC roll data.
   */
  _getNpcRollData(_data) {
    if (this.type !== "npc") return;

    // Process additional NPC data here.
  }

  async rollAbility(ability, label, _options = {}) {
    // NPC는 능력치 시스템 없음(식 기반 hitFormula·dodgeFormula). system.ability 접근 전에 가드.
    if (this.type !== "character") {
      ui.notifications.warn(game.i18n.localize("ASTER.ability.pcOnly"));
      return;
    }

    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const ablValue = this.system.ability[ability].total;

    // 집중 효과 — 활성 시 baseDice = 3 (단순 합산), 굴림 후 flag 해제.
    const focus = checkFocusEffect(this);
    const roll = await asterRoll(ablValue, this.getRollData(), {
      baseDice: 2 + focus.extraDice,
    });
    if (focus.combatant) {
      await focus.combatant.setFlag("aster", "focusActive", false);
    }

    const resultDiceset = roll.dice[0].values;
    const diceText = resultDiceset.join(", ");
    const cf = detectCritFumble(resultDiceset);
    const focusApplied = !!focus.combatant;

    // 보정 통합: 졸림 + 포만 (페이즈 무관, 모든 판정에 적용. 정동판정만 별도).
    const penalties = computePenalties(this);
    const adjustedTotal = roll.total + penalties.total;

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });

    if (this.system.rollMode === "vs") {
      // 대결판정 — 자동 패배 분기(능동측 대실패) 외에는 상대측 굴림이 필요하므로,
      // 현 단계에서는 본 액터의 대성공/대실패 정보만 카드에 노출한다.
      // resolveOpposed는 GM이 양측 결과를 모은 뒤 별도로 호출(향후 작업).
      const templateData = {
        label,
        ablValue,
        result: roll.result,
        total: adjustedTotal,
        rawTotal: roll.total,
        penalties,
        resultDiceset,
        diceText,
        isCritical: cf.critical,
        isFumble: cf.fumble,
        focusApplied,
        actorId: this.id,
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
      // 일반 판정 — 대성공/대실패가 달성치를 덮어쓴다.
      const dcOk = adjustedTotal >= this.system.dc;
      const isSuccess = cf.critical || (!cf.fumble && dcOk);
      const templateData = {
        label,
        ablValue,
        rollDC: this.system.dc,
        total: adjustedTotal,
        rawTotal: roll.total,
        penalties,
        isSuccess,
        isCritical: cf.critical,
        isFumble: cf.fumble,
        focusApplied,
        resultDiceset,
        diceText,
        actorId: this.id,
        isPC: this.type === "character",
      };
      const content = await renderTemplate(
        critFumbleCardPath(cf, "systems/aster/templates/chatcard/roll-asterabl.html"),
        templateData,
      );
      // rolls 배열을 넣어야 Dice So Nice 등 다이스 애니메이션·소리가 트리거된다(대결 판정과 정합).
      await ChatMessage.create({ content, speaker, rolls: [roll] });

      // 졸림 자동 해제: 룰 "한 번 판정에 실패하면 해제" — 일반판정 실패에만 적용.
      // AE는 _onUpdate hook에서 자동 삭제됨 (C-1 동기화).
      if (penalties.sleepy < 0 && !isSuccess) {
        await this.update({ "system.badstatus.sleepy": false });
      }
    }

    // 포만 자동 감소: 탐색 페이즈만, 판정 시 -1 (배고픔이면 -2). PC만.
    await this._decreaseSatietyIfExploration();
  }

  /**
   * 탐색 페이즈일 때만 포만 자동 감소. ActorSheet에서도 호출 가능하도록 공개 메서드.
   * 룰 488: 탐색 페이즈에 판정/이동 시 포만 -1, 배고픔이면 -2.
   * 룰 498: 포만은 0 미만이 되지 않음 (DataModel min:0가 보장).
   * 룰 531: 전투 중(클라이막스 페이즈)에는 무시 — currentPhase로 분기됨.
   *
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
   * 부상 PC에 건강 -2 (트리거 무관, 호출자가 트리거 책임).
   * 룰 518: 부상 = 전투중 행동완료 또는 탐색 페이즈 이동 타이밍.
   * 룰 536: 건강 0 도달 시 행동불능 — 시스템은 수치만 갱신, 후속 처리는 GM(D12).
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
   * 큰부상 PC에 건강 -5 (전투 중 행동완료 트리거).
   * 룰 520: 큰 부상 = 전투중 행동완료 시 건강 -5.
   *
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
   * 탐색 페이즈 이동 시 부상 적용 (D19 흐름).
   * 페이즈 체크만 담당하고 본 로직은 _applyInjuryHealthLoss에 위임.
   *
   * @returns {Promise<{before:number, after:number, delta:number, applied:boolean}>}
   */
  async _applyInjuryHealthLossIfExploration() {
    const skip = { before: 0, after: 0, delta: 0, applied: false };
    const phase = game.settings.get("aster", "currentPhase");
    if (phase !== "exploration") return skip;
    return this._applyInjuryHealthLoss();
  }

  /**
   * 큰부상 → 부상 전이 (전투 종료 시).
   * 룰 520: 전투 종료시에 [부상]으로 변경된다.
   *
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
      isPC: this.type === "character",
    };
    const content = await renderTemplate(
      critFumbleCardPath(cf, "systems/aster/templates/chatcard/roll-asterabl-emo.html"),
      templateData,
    );
    // rolls 배열을 넣어야 다이스 애니메이션·소리가 트리거된다(일반 판정과 정합).
    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ alias: game.user.name }),
      rolls: [roll],
    });
  }

  /**
   * 회피 판정 (룰북 558~560: 대결판정의 한 종류).
   * PC: 능력치 = system.dodge(D15 파생) 합산식. NPC: system.dodgeFormula 직접 평가(예: "2D6+3").
   * 집중(+1d6)·회피 한정 피로 -3 보정(룰북 522)은 PC·NPC 공통.
   * system.rollMode와 무관하게 대결(vs) 카드를 출력한다.
   *
   * 졸림 자동 해제·포만 자동 감소는 호출하지 않음:
   *  - 회피의 성공/실패는 대결 결과(resolveOpposed)로 결정되어 이 시점엔 미정 → 졸림 해제 보류.
   *  - 룰북 531: 전투 중에는 포만 감소 무시 → 포만 감소 미호출.
   *
   * @returns {Promise<void>}
   */
  async rollDodge() {
    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const label = game.i18n.localize("ASTER.dodge.label");

    // 회피도 대결판정의 한 종류이며 룰북상 일반 판정에 포함되므로 집중 효과 적용 (PC·NPC 공통).
    const focus = checkFocusEffect(this);

    let roll;
    let dodgeValue;
    let npcFormula = null; // NPC 식 — 카드 표시용(PC는 null이라 기존 능력치 합산 표시 유지)
    if (this.type === "npc") {
      // NPC: dodgeFormula 직접 평가(예: "2D6+3"). 빈 식·평가 실패는 경고 후 종료(N4 apFormula 패턴 정합).
      const formula = this.system.dodgeFormula?.trim();
      if (!formula) {
        ui.notifications.warn(game.i18n.localize("ASTER.dodge.npcNoFormula"));
        return;
      }
      // 집중 효과 — 식 끝에 다이스 추가(focus.extraDice는 1d6 단위). `new Roll`이 복합식을 자동 평가.
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
      // PC: 능력치 합산식 (asterRoll: dodgeValue + 2d6, focus면 3d6).
      dodgeValue = this.system.dodge ?? 0;
      roll = await asterRoll(dodgeValue, this.getRollData(), {
        baseDice: 2 + focus.extraDice,
      });
    }

    if (focus.combatant) {
      await focus.combatant.setFlag("aster", "focusActive", false);
    }

    // 다이스 평탄화 — PC 단일 그룹·NPC 다중 그룹(식 + 집중 다이스) 모두 처리.
    const resultDiceset = roll.dice.flatMap((d) => d.values);
    const diceText = resultDiceset.join(", ");
    const cf = detectCritFumble(resultDiceset);

    // 회피 컨텍스트로 보정 계산 (피로 -3 포함).
    const penalties = computePenalties(this, { isDodge: true });
    const adjustedTotal = roll.total + penalties.total;

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });
    const templateData = {
      label,
      ablValue: dodgeValue,
      formula: npcFormula, // NPC면 식, PC면 null(템플릿이 능력치 합산 표시로 분기)
      result: roll.result,
      total: adjustedTotal,
      rawTotal: roll.total,
      penalties,
      resultDiceset,
      diceText,
      isCritical: cf.critical,
      isFumble: cf.fumble,
      focusApplied: !!focus.combatant,
      actorId: this.id,
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
   * 집중(+1d6)·피로 보정은 dodge와 동일 흐름. resolveOpposed 대결 인프라 연계(ability: "hit").
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

    // 집중 효과 — 식 끝에 다이스 추가(dodge NPC 패턴 정합).
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

    if (focus.combatant) {
      await focus.combatant.setFlag("aster", "focusActive", false);
    }

    const resultDiceset = roll.dice.flatMap((d) => d.values);
    const diceText = resultDiceset.join(", ");
    const cf = detectCritFumble(resultDiceset);

    // 피로 등 보정 — 명중 컨텍스트(isDodge: false). 회피와 동일하게 적용(룰 영역은 추후 확인).
    const penalties = computePenalties(this, { isDodge: false });
    const adjustedTotal = roll.total + penalties.total;

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });
    const templateData = {
      label,
      ablValue: 0, // 식 자체가 굴림 — 별도 능력치 합산값 없음(dodge NPC 패턴 정합)
      formula: fullFormula, // NPC 전용 메서드라 항상 식 전달(카드 표시용)
      result: roll.result,
      total: adjustedTotal,
      rawTotal: roll.total,
      penalties,
      resultDiceset,
      diceText,
      isCritical: cf.critical,
      isFumble: cf.fumble,
      focusApplied: !!focus.combatant,
      actorId: this.id,
      isPC: false, // NPC 전용
      isDodge: false, // 명중 영역
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

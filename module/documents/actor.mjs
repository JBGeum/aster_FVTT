import { asterRoll } from "./roll.mjs";
import { detectCritFumble, computePenalties } from "../helpers/roll-result.mjs";
import { syncBadstatusEffect } from "../helpers/badstatus-effects.mjs";
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
    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const ablValue = this.system.ability[ability].total;
    const roll = await asterRoll(ablValue, this.getRollData());
    const resultDiceset = roll.dice[0].values;
    const diceText = resultDiceset.join(", ");
    const cf = detectCritFumble(resultDiceset);

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
        actorId: this.id,
        isPC: this.type === "character",
      };
      const content = await renderTemplate(
        "systems/aster/templates/chatcard/roll-asterabl-vs.html",
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
        resultDiceset,
        diceText,
        actorId: this.id,
        isPC: this.type === "character",
      };
      const content = await renderTemplate(
        "systems/aster/templates/chatcard/roll-asterabl.html",
        templateData,
      );
      ChatMessage.create({ content, speaker });

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
      "systems/aster/templates/chatcard/roll-asterabl-emo.html",
      templateData,
    );
    ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ alias: game.user.name }),
    });
  }
}

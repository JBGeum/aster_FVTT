import { asterRoll } from "./roll.mjs";
import { detectCritFumble } from "../helpers/roll-result.mjs";
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

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });

    if (this.system.rollMode === "vs") {
      // 대결판정 — 자동 패배 분기(능동측 대실패) 외에는 상대측 굴림이 필요하므로,
      // 현 단계에서는 본 액터의 대성공/대실패 정보만 카드에 노출한다.
      // resolveOpposed는 GM이 양측 결과를 모은 뒤 별도로 호출(향후 작업).
      const templateData = {
        label,
        ablValue,
        result: roll.result,
        total: roll.total,
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
      ChatMessage.create({ content, speaker });
    } else {
      // 일반 판정 — 대성공/대실패가 달성치를 덮어쓴다.
      const dcOk = roll.total >= this.system.dc;
      const isSuccess = cf.critical || (!cf.fumble && dcOk);
      const templateData = {
        label,
        ablValue,
        rollDC: this.system.dc,
        result: roll.result,
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
    }
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

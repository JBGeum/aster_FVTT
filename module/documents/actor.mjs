import { asterRoll } from "./roll.mjs";
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

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });

    if (!this.system.dc) {
      // 대항판정
      const templateData = {
        label,
        ablValue,
        result: roll.result,
        total: roll.total,
        resultDiceset,
      };
      const content = await renderTemplate(
        "systems/aster/templates/chatcard/roll-asterabl-vs.html",
        templateData,
      );
      ChatMessage.create({ content, speaker });
    } else {
      // 일반 판정
      const isSpecial = resultDiceset[0] === 6 && resultDiceset[1] === 6;
      const isSuccess = roll.total >= this.system.dc;
      const templateData = {
        label,
        ablValue,
        rollDC: this.system.dc,
        result: roll.result,
        isSuccess,
        isSpecial,
        resultDiceset,
      };
      const content = await renderTemplate(
        "systems/aster/templates/chatcard/roll-asterabl.html",
        templateData,
      );
      ChatMessage.create({ content, speaker });
    }
  }

  async rollEmotion(aster, label, _options = {}) {
    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const isFavColor = aster === this.system.color;
    const formula = isFavColor ? "2d6+1" : "2d6";
    const roll = new Roll(formula);
    await roll.evaluate();
    const resultDiceset = roll.dice[0].values;

    const isSpecial = resultDiceset[0] === 6 && resultDiceset[1] === 6;
    const isSuccess = roll.total >= 7;
    const templateData = {
      label,
      total: roll.total,
      aster,
      result: roll.result,
      isFavColor,
      isSpecial,
      isSuccess,
      resultDiceset,
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

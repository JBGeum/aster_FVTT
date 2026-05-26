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

  /**
   * @override
   */
  prepareDerivedData() {
    const actorData = this;
    const systemData = actorData.system;
    const flags = actorData.flags.aster || {};

    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== "character") return;

    // Make modifications to data here. For example:
    const systemData = actorData.system;

    //schmm speed, dodge 계산
    for (const [key, ability] of Object.entries(systemData.ability)) {
      ability.total = ability.base + ability.mod;
    }
    systemData.speed = (systemData.ability.knowledge.total + systemData.ability.worldly.total) / 2;
    systemData.dodge = systemData.ability.active.total + systemData.ability.dexterity.total;
    systemData.health.percent = Math.round((systemData.health.value / systemData.health.max) * 100);
    systemData.satiety.percent = Math.round(
      (systemData.satiety.value / systemData.satiety.max) * 100,
    );

    /* //Loop through ability scores, and add their modifiers to our sheet output.
    for (let [key, ability] of Object.entries(systemData.abilities)) {
      // Calculate the modifier using d20 rules.
      ability.mod = Math.floor((ability.value - 10) / 2);
    }*/
  }

  /**
   * Prepare NPC type specific data.
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== "npc") return;

    // Make modifications to data here. For example:
    // const systemData = actorData.system;
    // systemData.xp = (systemData.cr * systemData.cr) * 100;
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
  _getNpcRollData(data) {
    if (this.type !== "npc") return;

    // Process additional NPC data here.
  }

  async rollAbility(ability, label, _options = {}) {
    const renderTemplate = foundry.applications.handlebars.renderTemplate;
    const ablValue = this.system.ability[ability].total;
    const roll = await asterRoll(ablValue, this.getRollData());
    const resultDiceset = roll.dice[0].values;

    const speaker = ChatMessage.getSpeaker({ alias: game.user.name });
    const style = CONST.CHAT_MESSAGE_STYLES?.OTHER ?? 3;

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
      ChatMessage.create({ content, speaker, style });
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
      ChatMessage.create({ content, speaker, style });
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
      style: CONST.CHAT_MESSAGE_STYLES?.OTHER ?? 3,
    });
  }
}

/** @extends {Item} */
export class AsterItem extends Item {
  /** @override */
  async _preUpdate(changes, options, user) {
    if (this.type === "spell") {
      const alert = changes.system?.alert;
      if (alert) {
        const min = alert.min ?? this.system.alert.min;
        const max = alert.max ?? this.system.alert.max;
        if (min > max) {
          ui.notifications.warn(game.i18n.localize("ASTER.spell.alertRangeInvalid"));
          return false;
        }
      }
    }
    return super._preUpdate(changes, options, user);
  }

  prepareData() {
    super.prepareData();
  }

  /** @private */
  getRollData() {
    if (!this.actor) return null;
    const rollData = this.actor.getRollData();
    rollData.item = foundry.utils.deepClone(this.system);

    return rollData;
  }

  /** @private */
  async roll() {
    const item = this;

    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get("core", "rollMode");
    const label = `[${item.type}] ${item.name}`;

    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? "",
      });
    } else {
      const rollData = this.getRollData();

      const roll = new Roll(rollData.item.formula, rollData);
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }
}

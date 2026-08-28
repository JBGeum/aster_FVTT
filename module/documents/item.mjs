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
}

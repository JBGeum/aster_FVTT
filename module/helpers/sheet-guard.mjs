export function guardSheetActions(actions, viewActions = []) {
  for (const [name, handler] of Object.entries(actions)) {
    if (viewActions.includes(name)) continue;
    actions[name] = function (event, target) {
      if (!this.isEditable) {
        ui.notifications.warn(game.i18n.localize("ASTER.sheet.ownerOnly"));
        return;
      }
      return handler.call(this, event, target);
    };
  }
}

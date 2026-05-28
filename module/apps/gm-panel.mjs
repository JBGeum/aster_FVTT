import { WORLD_VALUES } from "../helpers/world-values.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * 파티 공유(world) 값을 GM이 편집·관리하는 전용 패널.
 * WORLD_VALUES 정의를 읽어 UI를 자동 생성합니다.
 */
export class AsterGMPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "aster-gm-panel",
    classes: ["aster", "gm-panel"],
    window: { title: "ASTER.world.panelTitle" },
    position: { width: 320, height: "auto" },
    actions: {
      adjust: AsterGMPanel.#onAdjust,
      setValue: AsterGMPanel.#onSetValue,
      rangeRoll: AsterGMPanel.#onRangeRoll,
      witchHunt: AsterGMPanel.#onWitchHunt,
    },
  };

  static PARTS = {
    body: { template: "systems/aster/templates/apps/gm-panel.html" },
  };

  async _prepareContext() {
    return {
      values: WORLD_VALUES.map((v) => ({
        ...v,
        current: game.settings.get("aster", v.key),
      })),
    };
  }

  /** GM만 패널을 열 수 있습니다. */
  static show() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("ASTER.world.gmOnly"));
      return;
    }
    new AsterGMPanel().render(true);
  }

  static #clampMin(key, value) {
    const def = WORLD_VALUES.find((v) => v.key === key);
    return def?.min != null ? Math.max(def.min, value) : value;
  }

  /* ---- actions ---- */

  static async #onAdjust(_event, target) {
    const key = target.dataset.key;
    const delta = Number(target.dataset.delta);
    const cur = Number(game.settings.get("aster", key)) || 0;
    const next = AsterGMPanel.#clampMin(key, cur + delta);
    await game.settings.set("aster", key, next);
    this.render();
  }

  static async #onSetValue(_event, target) {
    const key = target.dataset.key;
    const input = this.element.querySelector(`input[name="${key}"]`);
    const next = AsterGMPanel.#clampMin(key, Number(input.value) || 0);
    await game.settings.set("aster", key, next);
    this.render();
  }

  static async #onRangeRoll(_event, target) {
    const key = target.dataset.key;
    const r = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.world.rangeTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.world.min")}</label>
          <input type="number" name="min" value="1" min="0" />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("ASTER.world.max")}</label>
          <input type="number" name="max" value="5" min="0" />
        </div>
        <label class="wv-add">
          <input type="checkbox" name="add" checked />
          ${game.i18n.localize("ASTER.world.addToCurrent")}
        </label>
      `,
      ok: {
        label: game.i18n.localize("ASTER.world.roll"),
        callback: (_e, b) => ({
          min: Number(b.form.elements.min.value),
          max: Number(b.form.elements.max.value),
          add: b.form.elements.add.checked,
        }),
      },
    }).catch(() => null);
    if (!r) return;
    if (!Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min > r.max) {
      ui.notifications.warn(game.i18n.localize("ASTER.world.invalidRange"));
      return;
    }

    const n = r.max - r.min + 1;
    const formula = n === 1 ? String(r.min) : `1d${n}${r.min > 1 ? `+${r.min - 1}` : ""}`;
    const roll = new Roll(formula);
    await roll.evaluate();

    if (r.add) {
      const cur = Number(game.settings.get("aster", key)) || 0;
      const next = AsterGMPanel.#clampMin(key, cur + roll.total);
      await roll.toMessage({
        flavor: game.i18n.format("ASTER.world.rangeFlavorAdd", { delta: roll.total, total: next }),
      });
      await game.settings.set("aster", key, next);
    } else {
      await roll.toMessage({
        flavor: game.i18n.format("ASTER.world.rangeFlavor", {
          min: r.min,
          max: r.max,
          result: roll.total,
        }),
      });
    }
    this.render();
  }

  static async #onWitchHunt(_event, target) {
    const key = target.dataset.key;
    const threshold = Number(game.settings.get("aster", key)) || 0;
    const roll = new Roll("1d100");
    await roll.evaluate();
    // d100 > 경계도 → 성공, 이하 → 실패
    const success = roll.total > threshold;
    await roll.toMessage({
      flavor: game.i18n.format(
        success ? "ASTER.world.witchHuntSuccess" : "ASTER.world.witchHuntFail",
        {
          roll: roll.total,
          alert: threshold,
        },
      ),
    });
  }
}

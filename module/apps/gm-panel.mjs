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
      emoGenerate: AsterGMPanel.#onEmoGenerate,
      sceneTransition: AsterGMPanel.#onSceneTransition,
    },
  };

  static PARTS = {
    body: { template: "systems/aster/templates/apps/gm-panel.html" },
  };

  async _prepareContext() {
    return {
      values: WORLD_VALUES.map((v) => {
        const current = game.settings.get("aster", v.key);
        const isSelect = v.type === "select";
        return {
          ...v,
          current,
          isSelect,
          options: isSelect
            ? v.options.map((opt) => ({ ...opt, isSelected: opt.key === current }))
            : undefined,
        };
      }),
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // ApplicationV2의 data-action은 click 전용 — <select>의 change는 여기서 수동 등록한다.
    for (const sel of this.element.querySelectorAll("select.wv-select")) {
      sel.addEventListener("change", (ev) => AsterGMPanel.#onSetPhase(ev));
    }
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

  static async #onEmoGenerate(_event, _target) {
    const COLORS = [
      { key: "red", label: game.i18n.localize("ASTER.aster.red") },
      { key: "blue", label: game.i18n.localize("ASTER.aster.blue") },
      { key: "white", label: game.i18n.localize("ASTER.aster.white") },
      { key: "yellow", label: game.i18n.localize("ASTER.aster.yellow") },
      { key: "green", label: game.i18n.localize("ASTER.aster.green") },
    ];

    const rows = COLORS.map(
      (c) => `
        <div class="form-group">
          <label>${c.label}</label>
          <input type="number" name="${c.key}" value="0" min="0" max="5" />
        </div>`,
    ).join("");

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.emo.generateTitle") },
      content: `<p class="emo-gen-hint">${game.i18n.localize("ASTER.emo.generateHint")}</p>${rows}`,
      ok: {
        label: game.i18n.localize("ASTER.emo.generate"),
        callback: (_e, b) =>
          Object.fromEntries(COLORS.map((c) => [c.key, Number(b.form.elements[c.key].value) || 0])),
      },
    }).catch(() => null);
    if (!result) return;

    // 룰: 1인당 1~5개. 1색 1개도 유효하므로 하한 1.
    const total = Object.values(result).reduce((a, n) => a + n, 0);
    if (total < 1 || total > 5) {
      ui.notifications.warn(game.i18n.localize("ASTER.emo.invalidTotal"));
      return;
    }

    const parts = COLORS.filter((c) => result[c.key] > 0).map((c) => `${c.label} ${result[c.key]}`);
    await ChatMessage.create({
      content: `
        <div class="aster-chat-card emo-card">
          <header class="card-header">
            <div class="title">
              <div class="name">${game.i18n.localize("ASTER.emo.generated")}</div>
            </div>
          </header>
          <div class="emo-gen-list">${parts.join(" / ")}</div>
        </div>`,
      speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
    });
  }

  /**
   * 세션 페이즈 select 변경 핸들러. _onRender에서 change 이벤트에 수동 등록된다.
   * @param {Event} event  change 이벤트 (currentTarget = <select>)
   */
  static async #onSetPhase(event) {
    const sel = event.currentTarget;
    const key = sel.dataset.key;
    if (!key) return;
    const newPhase = sel.value;
    await game.settings.set("aster", key, newPhase);

    // 페이즈 변경 채팅 안내
    const label = game.i18n.localize(`ASTER.phase.${newPhase}`);
    await ChatMessage.create({
      content: `<div class="aster-chat-card phase-change-card">
        <header class="card-header"><div class="title"><div class="name">
          ${game.i18n.format("ASTER.phase.changed", { phase: label })}
        </div></div></header>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: game.i18n.localize("ASTER.world.panelTitle") }),
    });
    // updateSetting hook이 패널 재렌더링 처리 (aster.mjs)
  }

  /**
   * 장면 이동 처리.
   * 룰북 488: 탐색 페이즈에서 이동 시 포만 -1 (배고픔이면 -2).
   * 룰북 502: 이동 전 타이밍에 피크닉 선언 가능 (이 STEP 범위 밖, 향후 추가).
   *
   * 장면 이동 자체는 모든 페이즈에서 일어날 수 있는 개념적 이벤트지만,
   * 포만 감소는 탐색 페이즈에서만 적용 (페이즈 무관 버튼 + 페이즈별 효과 분기).
   */
  static async #onSceneTransition(_event, _target) {
    // 1. character 액터 목록 (NPC 제외)
    const characters = game.actors.filter((a) => a.type === "character");
    if (characters.length === 0) {
      ui.notifications.warn(game.i18n.localize("ASTER.scene.noCharacters"));
      return;
    }

    // 2. 다이얼로그: 대상 PC 선택 (기본 전체 체크)
    const rows = characters
      .map(
        (a) => `
        <div class="form-group scene-target-row">
          <label>
            <input type="checkbox" name="target" value="${a.id}" checked />
            ${a.name}
          </label>
        </div>`,
      )
      .join("");

    const selectedIds = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ASTER.scene.transitionTitle") },
      content: `
        <p class="scene-hint">${game.i18n.localize("ASTER.scene.transitionHint")}</p>
        ${rows}
      `,
      ok: {
        label: game.i18n.localize("ASTER.scene.confirm"),
        callback: (_e, b) =>
          Array.from(b.form.querySelectorAll('input[name="target"]:checked')).map((el) => el.value),
      },
    }).catch(() => null);

    if (selectedIds === null) return; // 취소
    if (selectedIds.length === 0) {
      ui.notifications.warn(game.i18n.localize("ASTER.scene.noSelection"));
      return;
    }

    // 3. 페이즈 확인 + 포만 감소 적용
    const phase = game.settings.get("aster", "currentPhase");
    const isExploration = phase === "exploration";

    const changes = []; // PC별 포만·부상 처리 결과 — 채팅 출력용
    for (const id of selectedIds) {
      const actor = game.actors.get(id);
      if (!actor) continue;

      // 포만 감소
      const satBefore = actor.system.satiety?.value ?? 0;
      await actor._decreaseSatietyIfExploration();
      const satAfter = actor.system.satiety?.value ?? 0;

      // 부상 PC 건강 -2 (탐색 페이즈)
      const injury = await actor._applyInjuryHealthLossIfExploration();

      changes.push({
        actorName: actor.name,
        satietyBefore: satBefore,
        satietyAfter: satAfter,
        satietyDelta: satAfter - satBefore,
        injuryApplied: injury.applied,
        healthBefore: injury.before,
        healthAfter: injury.after,
        healthDelta: injury.delta,
        healthZero: injury.applied && injury.after === 0,
      });
    }

    // 4. 채팅 안내 카드 — PC별 그룹, 변경 항목을 들여쓰기로 표시
    const listHtml = changes
      .map((c) => {
        const lines = [];
        lines.push(
          c.satietyDelta === 0
            ? game.i18n.localize("ASTER.scene.noChange")
            : game.i18n.format("ASTER.scene.satietyLine", {
                before: c.satietyBefore,
                after: c.satietyAfter,
                delta: c.satietyDelta,
              }),
        );
        if (c.injuryApplied) {
          lines.push(
            game.i18n.format("ASTER.scene.injuryLine", {
              before: c.healthBefore,
              after: c.healthAfter,
              delta: c.healthDelta,
            }),
          );
          if (c.healthZero) {
            lines.push(
              `<span class="warn-zero">${game.i18n.localize("ASTER.scene.healthZero")}</span>`,
            );
          }
        }
        return `<li><strong>${c.actorName}</strong><ul class="scene-pc-detail">${lines
          .map((l) => `<li>${l}</li>`)
          .join("")}</ul></li>`;
      })
      .join("");

    const noteHtml = isExploration
      ? ""
      : `<div class="scene-note">${game.i18n.localize("ASTER.scene.notExploration")}</div>`;

    await ChatMessage.create({
      content: `<div class="aster-chat-card scene-transition-card">
        <header class="card-header"><div class="title"><div class="name">
          ${game.i18n.localize("ASTER.scene.transitioned")}
        </div></div></header>
        ${noteHtml}
        <ul class="scene-target-list">${listHtml}</ul>
      </div>`,
      speaker: ChatMessage.getSpeaker({
        alias: game.i18n.localize("ASTER.world.panelTitle"),
      }),
    });
  }
}

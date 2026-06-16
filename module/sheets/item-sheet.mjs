import { DAMAGE_STATUSES } from "../helpers/health-status.mjs";
import { useConsumable } from "../helpers/consumable.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

// H8 약초첩 다이얼로그 시안(memo/design/마녀 시트 - 다이얼로그.html) 정합.
// 시안은 모든 다이얼로그를 .dialog-wrap{flex:0 0 360px} 고정폭으로 렌더한다.
// .dialog__body 패딩 14px을 빼면 내부 콘텐츠 ≈ 330px이고, 재료 6열 그리드가 그 폭에
// 정확히 수용된다(시안이 그 폭에서 렌더되는 것이 근거). 윈도우 테두리(~2px)를 감안해
// position.width=360이면 콘텐츠 영역이 시안과 일치한다. 460+는 frow(88px 1fr)·1fr이
// 가로로 늘어나 "넓적"하게 보였던 원인이라 360 고정으로 환원.
// 높이는 height:"auto"로 콘텐츠에 맞춤(잘림·여백 동시 해소).
const ASTER_ITEM_WIDTHS = {
  // new 시안 — 모든 다이얼로그 .dialog-wrap 폭 430(그림 100px hero + compact 필드 + 상태 5개 한 줄).
  spell: 430,
  consumable: 430,
  equipment: 430,
  food: 430,
  bag: 430,
  npcAction: 430,
  record: 480,
  item: 440,
  feature: 420,
};

export class AsterItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["aster", "sheet", "item"],
    position: { width: 460, height: "auto" },
    window: { resizable: true },
    actions: {
      useConsumable: AsterItemSheet.#onItemConsumableUse,
    },
  };

  /**
   * H4-b — type별 윈도우 크기 적용.
   * 너비는 type별 권장값(미정의 type은 DEFAULT 460 fallback), 높이는 콘텐츠 자동.
   * 사용자 리사이즈 후 위치 기억은 ApplicationV2 기본 동작이 보존(강제 고정 안 함).
   */
  _initializeApplicationOptions(options) {
    const opts = super._initializeApplicationOptions(options);
    const width = ASTER_ITEM_WIDTHS[options.document?.type];
    if (width) {
      opts.position = { ...opts.position, width, height: "auto" };
    }
    return opts;
  }

  static #formConfig = {
    handler: AsterItemSheet.#onSubmit,
    submitOnChange: true,
    closeOnSubmit: false,
  };

  static PARTS = {
    bag: {
      template: "systems/aster/templates/item/item-bag-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    consumable: {
      template: "systems/aster/templates/item/item-consumable-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    equipment: {
      template: "systems/aster/templates/item/item-equipment-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    food: {
      template: "systems/aster/templates/item/item-food-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    spell: {
      template: "systems/aster/templates/item/item-spell-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    feature: {
      template: "systems/aster/templates/item/item-feature-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    record: {
      template: "systems/aster/templates/item/item-record-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
    npcAction: {
      template: "systems/aster/templates/item/item-npcaction-sheet.html",
      forms: { form: AsterItemSheet.#formConfig },
    },
  };

  get title() {
    return this.item.name;
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = [this.document.type];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const itemData = this.item.toObject(false);
    context.item = this.item;
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.editable = this.isEditable;
    context.owner = this.item.isOwner;
    context.rollData = this.item.actor?.getRollData() ?? {};
    context.config = CONFIG.ASTER;

    // material[6] 인덱스별 라벨 — 코드에 인덱스 의미가 없어 UI에서 명시(마테리얼 + 적·청·녹·황·백).
    // dotKey: H8 약초첩 .mat-in 점 색 (index 0=마테리얼 … 5=백).
    const MAT_DOT = ["mat", "red", "blue", "green", "yellow", "white"];
    context.materialFields = (this.item.system.material ?? []).map((value, i) => ({
      value,
      label: game.i18n.localize(`ASTER.item.material.label${i}`),
      dotKey: MAT_DOT[i] ?? "mat",
    }));

    if (this.item.type === "consumable") {
      const sys = this.item.system;
      const current = sys.cureStatus ?? [];
      context.cureStatusOptions = DAMAGE_STATUSES.map((s) => ({
        key: s.key,
        label: game.i18n.localize(`ASTER.badstatus.${s.i18n}`),
        checked: current.includes(s.key),
      }));
      // 회복 효과가 하나라도 있을 때만 "사용" 버튼 노출.
      context.showUseButton =
        (sys.healHealth ?? 0) > 0 || current.length > 0 || sys.cureAllStatus === true;
    }

    if (this.item.type === "npcAction") {
      const sys = this.item.system;
      const buildOptions = (selected) =>
        DAMAGE_STATUSES.map((s) => ({
          key: s.key,
          label: game.i18n.localize(`ASTER.badstatus.${s.i18n}`),
          checked: (selected ?? []).includes(s.key),
        }));
      context.addStatusOptions = buildOptions(sys.addStatus);
      context.cureStatusOptions = buildOptions(sys.cureStatus);
    }

    return context;
  }

  _onRender(_context, _options) {
    super._onRender(_context, _options);

    // cureStatus 다중 체크박스: 같은 name으로 폼 제출 시 FormData가 단일/배열을 일관 처리하지 않아,
    // 체크 상태를 직접 읽어 배열로 update한다 (.craft-res-input 커스텀 리스너 패턴과 동일).
    if (this.item.type === "consumable") {
      const boxes = this.element.querySelectorAll(".cure-status-check");
      for (const box of boxes) {
        box.addEventListener("change", () => {
          const selected = Array.from(boxes)
            .filter((b) => b.checked)
            .map((b) => b.dataset.status);
          this.item.update({ "system.cureStatus": selected });
        });
      }
    }

    // npcAction의 addStatus·cureStatus 다중 체크박스도 같은 패턴(폼 name 대신 직접 update).
    if (this.item.type === "npcAction") {
      const wire = (selector, field) => {
        const boxes = this.element.querySelectorAll(selector);
        for (const box of boxes) {
          box.addEventListener("change", () => {
            const selected = Array.from(boxes)
              .filter((b) => b.checked)
              .map((b) => b.dataset.status);
            this.item.update({ [field]: selected });
          });
        }
      };
      wire(".npcaction-add-status", "system.addStatus");
      wire(".npcaction-cure-status", "system.cureStatus");
    }

    // 이미지 편집 — data-edit 클릭 시 FilePicker. V2(DocumentSheetV2)는 V1과 달리
    // data-edit 자동 바인딩이 없어 직접 건다(re-render마다 DOM 교체라 리스너 누적 없음).
    // dataset.edit를 update 키로 일반화 — img 외 가방 창고 이미지(system.storageImg)도 커버.
    for (const img of this.element.querySelectorAll("img[data-edit]")) {
      img.addEventListener("click", () => {
        const key = img.dataset.edit;
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: foundry.utils.getProperty(this.document, key),
          callback: (path) => this.document.update({ [key]: path }),
        }).browse();
      });
    }
  }

  static async #onItemConsumableUse(_event, _target) {
    const actor = this.item.parent;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("ASTER.consumable.noActor"));
      return;
    }
    // 효과 적용 + 아이템 삭제는 actor 시트와 공용 로직. 삭제되면 시트는 자동으로 닫힌다.
    await useConsumable(actor, this.item);
  }

  static async #onSubmit(_event, _form, formData) {
    await this.item.update(formData.object);
  }
}

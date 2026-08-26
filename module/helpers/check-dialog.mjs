/**
 * 능력 판정 목표치·보정 입력 다이얼로그. UI 오케스트레이션이라 타입 검사 대상이 아니다.
 *
 * @param {object} opts
 * @param {string} opts.label           능력치 라벨(다이얼로그 제목에 사용).
 * @param {number} opts.defaultTarget   목표치 프리필 값(액터 system.dc).
 * @param {boolean} [opts.showTarget]   false면 목표치 필드를 숨긴다(대결판정).
 * @returns {Promise<{ target: number|null, modifier: number } | null>} 취소 시 null.
 */
export async function promptAbilityCheck({ label, defaultTarget, showTarget = true }) {
  const targetField = showTarget
    ? `<div class="form-group">
        <label>${game.i18n.localize("ASTER.check.target")}</label>
        <input type="number" name="target" value="${defaultTarget}" />
      </div>`
    : "";

  return await foundry.applications.api.DialogV2.prompt({
    classes: ["hb-dialog"],
    window: {
      title: game.i18n.format("ASTER.check.dialogTitle", { label }),
      icon: "fa-solid fa-dice-d6",
    },
    content: `
      ${targetField}
      <div class="form-group">
        <label>${game.i18n.localize("ASTER.check.modifier")}</label>
        <input type="number" name="modifier" value="0" />
      </div>
    `,
    ok: {
      icon: "fa-solid fa-check",
      label: game.i18n.localize("ASTER.check.roll"),
      callback: (_e, b) => {
        const rawTarget = showTarget ? b.form.elements.target.value.trim() : "";
        return {
          target: showTarget ? (rawTarget === "" ? defaultTarget : Number(rawTarget)) : null,
          modifier: Number(b.form.elements.modifier.value) || 0,
        };
      },
    },
  }).catch(() => null);
}

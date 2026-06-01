/**
 * "굴린 N개 다이스 중 K개 선택" 다이얼로그.
 * 룰북 `◆다이스의 증가`: 3개+ 굴림 시 2개 골라 달성치 산출.
 *
 * Foundry UI(DialogV2/form/notifications) 오케스트레이션 헬퍼라 @ts-check 비대상.
 * 순수 계산 헬퍼(spell-roll 등)와 달리 fvtt-types의 UI 타입 마찰이 커서 제외.
 *
 * @param {object} opts
 * @param {number[]} opts.dice         굴림 결과 배열 (≥K개)
 * @param {number} [opts.count=2]      선택 개수 (기본 2)
 * @param {string} [opts.title]        다이얼로그 제목
 * @param {string} [opts.hint]         설명 텍스트
 * @returns {Promise<{ selected: number[], discarded: number[] } | null>}
 *   취소 또는 잘못된 선택 시 null. 선택은 인덱스 기반으로 처리하되 "값"을 반환.
 */
export async function pickDiceDialog({ dice, count = 2, title, hint }) {
  if (dice.length <= count) {
    // 선택 불요 — 모두 선택된 것으로 반환
    return { selected: [...dice], discarded: [] };
  }

  const checkboxes = dice
    .map(
      (d, i) => `
      <label class="dice-pick-label">
        <input type="checkbox" name="dice" value="${i}" />
        <span class="dice-pick-face">${d}</span>
      </label>`,
    )
    .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: title ?? game.i18n.localize("ASTER.dice.pickTitle") },
    content: `
      <p class="dice-pick-hint">${hint ?? game.i18n.format("ASTER.dice.pickHint", { count })}</p>
      <div class="dice-pick-grid">${checkboxes}</div>
    `,
    ok: {
      label: game.i18n.localize("ASTER.dice.pickConfirm"),
      callback: (_e, b) => {
        const checked = Array.from(b.form.elements.dice).filter((el) => el.checked);
        return checked.map((el) => Number(el.value));
      },
    },
  }).catch(() => null);

  if (!result) return null;
  if (result.length !== count) {
    ui.notifications.warn(game.i18n.format("ASTER.dice.pickWrongCount", { count }));
    return null; // 호출자가 재시도 또는 취소 결정
  }

  const selected = result.map((i) => dice[i]);
  const discarded = dice.filter((_, i) => !result.includes(i));
  return { selected, discarded };
}

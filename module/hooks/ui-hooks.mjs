/**
 * import 시 top-level에서 Hooks.on(...)을 등록한다(부수효과).
 */
import { ASTER } from "../helpers/config.mjs";
import { WORLD_VALUES } from "../helpers/world-values.mjs";
import { AsterGMPanel } from "../apps/gm-panel.mjs";

/* -------------------------------------------- */
/*  GM Panel — Scene Control 버튼               */
/* -------------------------------------------- */

// V13: controls는 name으로 키된 객체, 각 control의 tools도 name 키 객체.
Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  tokens.tools["aster-gm-panel"] = {
    name: "aster-gm-panel",
    title: "ASTER.world.panelTitle",
    icon: "fa-solid fa-sliders",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => AsterGMPanel.show(),
  };
});

/* -------------------------------------------- */
/*  토큰 HUD — 아스테르 5색 자가 증감 (안 B)      */
/* -------------------------------------------- */

// 마테리얼 제외 5색. 백색은 어두운 배경에 묻히므로 테두리 필요.
const ASTER_HUD_FIELDS = [
  { key: "red", color: "#d2776b" },
  { key: "blue", color: "#6f9ad8" },
  { key: "green", color: "#7ab06a" },
  { key: "yellow", color: "#e0c04a" },
  { key: "white", color: "#e8e4d8" },
];

// 토큰 하단에 점+값 패널 마크업 생성. 색은 인라인 지정(시트 스코프 밖이라 --el-* 미사용).
function buildAsterHudPanel(actor) {
  const cells = ASTER_HUD_FIELDS.map((f) => {
    const val = foundry.utils.getProperty(actor, `system.aster.${f.key}.value`) ?? 0;
    const label = game.i18n.localize(ASTER.aster[f.key] ?? `ASTER.aster.${f.key}`);
    const ring = f.key === "white" ? "border:1px solid #999;" : "";
    return `
      <div class="aster-hud-cell" data-aster-hud data-key="${f.key}"
           data-tooltip="${label} (좌클릭 +1 / 우클릭 −1)">
        <span class="aster-hud-dot" style="background:${f.color};${ring}"></span>
        <span class="aster-hud-val">${val}</span>
      </div>`;
  }).join("");
  return `<div class="aster-hud-panel">${cells}</div>`;
}

// actor.update()는 서버를 경유하므로 HUD 값은 수동으로 갱신한다.
async function onAsterHudAdjust(event, actor, delta) {
  event.preventDefault();
  event.stopPropagation(); // HUD 닫힘·토큰 선택·컨텍스트메뉴 방지
  if (!actor.isOwner) return; // 방어적 이중 체크

  const cell = event.currentTarget;
  const path = `system.aster.${cell.dataset.key}.value`;
  const cur = foundry.utils.getProperty(actor, path) ?? 0;
  const next = cur + delta;
  await actor.update({ [path]: next });

  const valEl = cell.querySelector(".aster-hud-val");
  if (valEl) valEl.textContent = String(next); // HUD 수동 갱신
}

Hooks.on("renderTokenHUD", (hud, html) => {
  const actor = hud.object?.actor;
  if (!actor || actor.type !== "character") return; // PC만 — NPC 미표시
  if (!actor.isOwner) return; // 본인(또는 GM)만 — 타인 차단

  // V13 TokenHUD는 AppV2 — html은 HUD 루트(#token-hud) HTMLElement.
  // 루트에 append하면 panel의 top:100% 절대배치가 토큰 하단 기준이 됨.
  html.insertAdjacentHTML("beforeend", buildAsterHudPanel(actor));

  // 위치: 토큰 아래 + 하단 기본 HUD(톱니·elevation) 영역을 넘어가게.
  // top:100%는 HUD 컨테이너 높이 기준이라 하단 컨트롤을 못 넘음 → 토큰 픽셀 높이 기준으로 직접 배치.
  const panel = html.querySelector(".aster-hud-panel");
  if (panel) {
    const tokenH = hud.object?.h ?? 100; // 토큰 픽셀 높이 (그리드 1칸 ≈ 100, 2×2 ≈ 200 → 자동 대응)
    const bottomClearance = 50; // 하단 기본 HUD 여유
    panel.style.top = `${tokenH + bottomClearance}px`; // 컨테이너 상단(0) 기준 절대 위치
  }

  html.querySelectorAll("[data-aster-hud]").forEach((el) => {
    el.addEventListener("click", (ev) => onAsterHudAdjust(ev, actor, +1));
    el.addEventListener("contextmenu", (ev) => onAsterHudAdjust(ev, actor, -1));
  });
});

/* -------------------------------------------- */
/*  Setting Sync (ready 훅에서 이관)              */
/* -------------------------------------------- */

const worldKeys = new Set([...WORLD_VALUES.map((v) => `aster.${v.key}`), "aster.trackers"]);
Hooks.on("updateSetting", (setting) => {
  if (!worldKeys.has(setting.key)) return;
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof AsterGMPanel) app.render();
  }
});

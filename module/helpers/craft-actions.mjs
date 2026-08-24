/**
 * 공방 스킬 취득/해제·초기화 — 비용 차감 포함.
 */
import { CRAFT_TREE } from "./craft-tree.mjs";
import { canAcquire, canRelease, sumCost } from "./craft-cost.mjs";

/**
 * @param {string[]} reasons
 * @param {string[]} [dependents]
 */
function craftWarn(reasons, dependents) {
  const map = {
    PREREQ: "ASTER.craft.warn.PREREQ",
    MATERIAL_SHORT: "ASTER.craft.warn.MATERIAL_SHORT",
    ASTER_TOTAL_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_RED_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_BLUE_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_GREEN_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    ASTER_YELLOW_SHORT: "ASTER.craft.warn.ASTER_SHORT",
    HAS_DEPENDENTS: "ASTER.craft.warn.HAS_DEPENDENTS",
    ALREADY: "ASTER.craft.warn.ALREADY",
    FAMILIAR_ONE: "ASTER.craft.warn.FAMILIAR_ONE",
  };
  const key = map[reasons[0]] ?? "ASTER.craft.warn.GENERIC";
  let msg = game.i18n.localize(key);
  if (reasons[0] === "HAS_DEPENDENTS" && dependents?.length) {
    msg += " (" + dependents.join(", ") + ")";
  }
  ui.notifications.warn(msg);
}

/**
 * 공방 스킬 취득 또는 해제. 체크박스 toggle 액션 핸들러 본체.
 * @param {{ actor: AsterActor, skillId: string, target: HTMLInputElement }} opts
 */
export async function acquireSkill({ actor, skillId, target }) {
  const acquired = foundry.utils.deepClone(actor.system.craft?.acquired ?? {});
  const isAcquired = acquired[skillId] === true;

  if (!isAcquired) {
    const node = CRAFT_TREE.nodes.find((n) => n.id === skillId);
    if (!node) return;

    if (node.category === "familiar") {
      const hasOther = CRAFT_TREE.nodes.some(
        (n) => n.category === "familiar" && n.id !== skillId && acquired[n.id],
      );
      if (hasOther) {
        target.checked = false;
        craftWarn(["FAMILIAR_ONE"]);
        return;
      }
    }

    const r = canAcquire(skillId, acquired);
    if (!r.ok) {
      target.checked = false;
      craftWarn(r.reasons);
      return;
    }

    // 취득 + 비용 차감: 고정색 + 마테리얼만 자동 차감(음수 허용). 임의색(anyAster)은 수동 조정.
    const update = { [`system.craft.acquired.${skillId}`]: true };
    const shortList = [];
    for (const c of ["red", "blue", "green", "yellow"]) {
      const amount = node.cost.aster[c];
      if (amount > 0) {
        const newVal = (actor.system.aster?.[c]?.value ?? 0) - amount;
        update[`system.aster.${c}.value`] = newVal;
        if (newVal < 0) {
          shortList.push(
            game.i18n.format("ASTER.craft.warn.NEGATIVE", {
              resource: game.i18n.localize(`ASTER.aster.${c}`),
              value: newVal,
            }),
          );
        }
      }
    }
    if (node.cost.material > 0) {
      const newMat = (actor.system.material ?? 0) - node.cost.material;
      update["system.material"] = newMat;
      if (newMat < 0) {
        shortList.push(
          game.i18n.format("ASTER.craft.warn.NEGATIVE", {
            resource: game.i18n.localize("ASTER.label.material"),
            value: newMat,
          }),
        );
      }
    }
    await actor.update(update);
    // 음수가 된 자원은 차단하지 않고 알림으로 수정 유도(음수 허용 정책).
    if (shortList.length) ui.notifications.warn(shortList.join(" / "));
  } else {
    const r = canRelease(skillId, acquired);
    if (!r.ok) {
      target.checked = true;
      craftWarn(r.reasons, r.dependents);
      return;
    }
    // ObjectField는 update 시 병합이라 키 삭제(-=)나 빈 객체 덮어쓰기가 동작하지 않는다 — false로 덮어쓴다.
    const node = CRAFT_TREE.nodes.find((n) => n.id === skillId);
    const update = { [`system.craft.acquired.${skillId}`]: false };
    if (node) {
      for (const c of ["red", "blue", "green", "yellow"]) {
        const amount = node.cost.aster[c];
        if (amount > 0) {
          update[`system.aster.${c}.value`] = (actor.system.aster?.[c]?.value ?? 0) + amount;
        }
      }
      if (node.cost.material > 0) {
        update["system.material"] = (actor.system.material ?? 0) + node.cost.material;
      }
    }
    await actor.update(update);
  }
}

/**
 * 공방 스킬 전체 초기화(환불 포함). craftReset 액션 핸들러 본체.
 * @param {{ actor: AsterActor }} opts
 */
export async function resetCraft({ actor }) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ASTER.craft.reset") },
    content: game.i18n.localize("ASTER.craft.resetConfirm"),
  }).catch(() => false);
  if (!ok) return;

  const acquired = actor.system.craft?.acquired ?? {};
  if (Object.keys(acquired).length === 0) return;

  // anyAster는 차감 대상이 아니었으므로 환불에서도 제외한다.
  // ObjectField는 update 시 병합이라 키 삭제(-=)나 빈 객체 덮어쓰기가 동작하지 않는다 — false로 덮어쓴다.
  const cost = sumCost(acquired);
  const update = {};
  for (const k of Object.keys(acquired)) update[`system.craft.acquired.${k}`] = false;
  for (const c of ["red", "blue", "green", "yellow"]) {
    if (cost.aster[c] > 0) {
      update[`system.aster.${c}.value`] = (actor.system.aster?.[c]?.value ?? 0) + cost.aster[c];
    }
  }
  if (cost.material > 0) {
    update["system.material"] = (actor.system.material ?? 0) + cost.material;
  }
  await actor.update(update);
}

/**
 * Aster 전투 문서.
 * 룰북 574~583: 이니셔티브 = 민첩(`system.speed`) 비교, 다이스 굴림 없음.
 * 동률 시 PC 우선만 자동 처리하고, PC끼리·NPC끼리는 GM이 수동 조정(룰: 의논·자유 결정).
 * @extends {Combat}
 */
export class AsterCombat extends Combat {
  /**
   * 전투원 정렬. 이니셔티브(=민첩) 높은 순, 동률이면 PC 우선.
   * @param {Combatant} a
   * @param {Combatant} b
   * @returns {number}
   * @override
   */
  _sortCombatants(a, b) {
    // 이니셔티브 높은 순. 미굴림(null)은 -Infinity로 최하위.
    const ia = Number(a.initiative ?? -Infinity);
    const ib = Number(b.initiative ?? -Infinity);
    if (ia !== ib) return ib - ia;

    // 동률: PC 우선 (룰북 583)
    const aIsPC = a.actor?.type === "character";
    const bIsPC = b.actor?.type === "character";
    if (aIsPC && !bIsPC) return -1;
    if (!aIsPC && bIsPC) return 1;

    // PC끼리 또는 NPC끼리 동률은 시스템 미개입 (GM 의논/자유 결정).
    // Array.sort는 안정 정렬이므로 0 반환 시 기존(삽입) 순서가 보존된다.
    return 0;
  }

  /**
   * 액터 추가 시 자동으로 이니셔티브 결정 (룰북 574: 민첩 비교, 굴림 없음).
   *
   * `rollInitiative`를 거치지 않고 `system.speed`를 직접 초깃값으로 설정한다:
   * (1) 다이스 없는 결정론적 값이라 굴림 메시지가 무의미하고,
   * (2) V13 `rollInitiative`에는 채팅 억제 옵션이 없어(messageOptions만 존재)
   *     호출 시 채팅이 강제 출력되므로, 직접 update가 채팅을 원천 차단한다.
   *
   * @param {string|string[]} ids  대상 Combatant id 목록
   * @returns {Promise<void>}
   */
  async _autoRollInitiative(ids) {
    const targets = Array.isArray(ids) ? ids : [ids];
    const updates = [];
    for (const id of targets) {
      const c = this.combatants.get(id);
      if (!c || c.initiative != null) continue; // 이미 값이 있으면 건너뜀
      updates.push({ _id: id, initiative: Number(c.actor?.system?.speed ?? 0) });
    }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
  }
}

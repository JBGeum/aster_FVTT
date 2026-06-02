import { BaseActorModel } from "../base-actor.mjs";

const fields = foundry.data.fields;

export class NpcDataModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      cr: new fields.NumberField({ initial: 0, min: 0 }),
      // 이니셔티브 비교용 민첩 (룰북 574). PC는 능력치로 파생되나 NPC는 GM 수동 입력.
      speed: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    };
  }
}

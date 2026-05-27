import { BaseActorModel } from "../base-actor.mjs";

const fields = foundry.data.fields;

export class NpcDataModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      cr: new fields.NumberField({ initial: 0, min: 0 }),
    };
  }
}

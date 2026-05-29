const fields = foundry.data.fields;

export class BaseActorModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      dc: new fields.NumberField({ initial: 7, integer: true, min: 0 }),
      // 판정 모드: "normal"=일반 판정(목표치 비교), "vs"=대항 판정
      rollMode: new fields.StringField({ initial: "normal", choices: ["normal", "vs"] }),
      health: new fields.SchemaField({
        value: new fields.NumberField({ initial: 20, min: 0, integer: true }),
        min: new fields.NumberField({ initial: 0, integer: true }),
        max: new fields.NumberField({ initial: 20, integer: true }),
        percent: new fields.NumberField({ initial: 100 }),
      }),
      satiety: new fields.SchemaField({
        value: new fields.NumberField({ initial: 20, min: 0, integer: true }),
        min: new fields.NumberField({ initial: 0, integer: true }),
        max: new fields.NumberField({ initial: 20, integer: true }),
        percent: new fields.NumberField({ initial: 100 }),
      }),
      biography: new fields.HTMLField({ initial: "" }),
    };
  }
}

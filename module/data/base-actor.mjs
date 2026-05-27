const fields = foundry.data.fields;

export class BaseActorModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      dc: new fields.NumberField({ initial: 7, integer: true, min: 0 }),
      rollFlag: new fields.NumberField({ initial: 1, integer: true }),
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

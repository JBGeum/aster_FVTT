const fields = foundry.data.fields;

export class SpellDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ruby: new fields.StringField({ initial: "" }),
      color: new fields.StringField({ initial: "" }),
      ability: new fields.StringField({ initial: "" }),
      alert: new fields.SchemaField({
        min: new fields.NumberField({ initial: 0, integer: true }),
        max: new fields.NumberField({ initial: 0, integer: true }),
      }),
      message: new fields.SchemaField({
        critical: new fields.StringField({ initial: "" }),
        fumble: new fields.StringField({ initial: "" }),
      }),
      description: new fields.HTMLField({ initial: "" }),
    };
  }
}

const fields = foundry.data.fields;

export class FeatureDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      type: new fields.StringField({ initial: "" }),
      die: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      detail: new fields.StringField({ initial: "" }),
    };
  }
}

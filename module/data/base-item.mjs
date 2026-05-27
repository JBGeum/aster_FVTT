const fields = foundry.data.fields;

export class BaseItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      material: new fields.ArrayField(
        new fields.NumberField({ initial: 0, min: 0, integer: true }),
        {
          initial: () => [0, 0, 0, 0, 0, 0],
        },
      ),
      effect: new fields.StringField({ initial: "" }),
      requirement: new fields.StringField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
    };
  }
}

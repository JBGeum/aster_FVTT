const fields = foundry.data.fields;

/**
 * 모든 필드 텍스트 입력. alert는 그 시점 경계도 스냅샷(world alert와 무관).
 */
export class RecordDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      city: new fields.StringField({ initial: "" }),
      alert: new fields.StringField({ initial: "" }),
      felka: new fields.StringField({ initial: "" }),
      scenarioCount: new fields.StringField({ initial: "" }),
      favor: new fields.StringField({ initial: "" }),
      scenes: new fields.ArrayField(new fields.StringField({ initial: "" }), {
        initial: () => ["", "", ""],
      }),
      people: new fields.StringField({ initial: "" }),
      memo: new fields.StringField({ initial: "" }),
      updatedAt: new fields.StringField({ initial: "" }),
    };
  }
}

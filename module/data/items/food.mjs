import { BaseItemModel } from "../base-item.mjs";

export class FoodDataModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
    };
  }
}

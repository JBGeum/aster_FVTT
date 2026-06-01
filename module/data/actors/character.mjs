import { BaseActorModel } from "../base-actor.mjs";

const fields = foundry.data.fields;

const abilityField = () =>
  new fields.SchemaField({
    total: new fields.NumberField({ initial: 0, integer: true }),
    base: new fields.NumberField({ initial: 0, integer: true }),
    mod: new fields.NumberField({ initial: 0, integer: true }),
  });

export class CharacterDataModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      attributes: new fields.SchemaField({
        level: new fields.SchemaField({
          value: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
        }),
      }),
      ability: new fields.SchemaField({
        active: abilityField(),
        knowledge: abilityField(),
        dexterity: abilityField(),
        worldly: abilityField(),
      }),
      // 특기색: spell 판정 시 색 일치하면 +1. "red"|"blue"|"green"|"yellow"|"" (미지정 허용)
      color: new fields.StringField({ initial: "" }),
      speed: new fields.NumberField({ initial: 0 }),
      dodge: new fields.NumberField({ initial: 0 }),
      aster: new fields.SchemaField({
        white: new fields.SchemaField({ value: new fields.NumberField({ initial: 0 }) }),
        red: new fields.SchemaField({ value: new fields.NumberField({ initial: 0 }) }),
        blue: new fields.SchemaField({ value: new fields.NumberField({ initial: 0 }) }),
        green: new fields.SchemaField({ value: new fields.NumberField({ initial: 0 }) }),
        yellow: new fields.SchemaField({ value: new fields.NumberField({ initial: 0 }) }),
      }),
      material: new fields.NumberField({ initial: 0, integer: true }),
      storage: new fields.SchemaField({
        limit: new fields.NumberField({ initial: 20, integer: true, min: 0 }),
      }),
      features: new fields.SchemaField({
        born: new fields.SchemaField({
          title: new fields.StringField({ initial: "" }),
          description: new fields.StringField({ initial: "" }),
        }),
        past: new fields.SchemaField({
          title: new fields.StringField({ initial: "" }),
          description: new fields.StringField({ initial: "" }),
        }),
        purpose: new fields.SchemaField({
          title: new fields.StringField({ initial: "" }),
          description: new fields.StringField({ initial: "" }),
        }),
      }),
      badstatus: new fields.SchemaField({
        injury: new fields.BooleanField({ initial: false }),
        bigInj: new fields.BooleanField({ initial: false }),
        sleepy: new fields.BooleanField({ initial: false }),
        exhaustion: new fields.BooleanField({ initial: false }),
        hungry: new fields.BooleanField({ initial: false }),
      }),
      player: new fields.StringField({ initial: "" }),
      craft: new fields.SchemaField({
        acquired: new fields.ObjectField({ initial: {} }),
        locked: new fields.BooleanField({ initial: false }),
      }),
    };
  }

  prepareDerivedData() {
    for (const ability of Object.values(this.ability)) {
      ability.total = ability.base + ability.mod;
    }
    // 룰: 민첩 = 박식 + 요령.
    // this.speed 초기값(0)에는 prepareEmbeddedDocuments 단계에서 Active Effect
    // (피로 -3 등)가 이미 ADD로 가산돼 있다. prepareDerivedData가 이 뒤에 실행되므로
    // 파생 base에 그 누적분(this.speed)을 더해 effect 적용분을 보존한다.
    this.speed = this.ability.knowledge.total + this.ability.dexterity.total + this.speed;
    // 룰: 회피 = (활발 + 처세) / 2 (버림)
    this.dodge = Math.floor((this.ability.active.total + this.ability.worldly.total) / 2);
    if (this.health.max > 0) {
      this.health.percent = Math.round((this.health.value / this.health.max) * 100);
    }
    if (this.satiety.max > 0) {
      this.satiety.percent = Math.round((this.satiety.value / this.satiety.max) * 100);
    }
  }
}

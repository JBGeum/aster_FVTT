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
      material: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
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
      }),
    };
  }

  prepareDerivedData() {
    for (const ability of Object.values(this.ability)) {
      ability.total = ability.base + ability.mod;
    }
    this.speed = (this.ability.knowledge.total + this.ability.worldly.total) / 2;
    this.dodge = this.ability.active.total + this.ability.dexterity.total;
    if (this.health.max > 0) {
      this.health.percent = Math.round((this.health.value / this.health.max) * 100);
    }
    if (this.satiety.max > 0) {
      this.satiety.percent = Math.round((this.satiety.value / this.satiety.max) * 100);
    }
  }
}

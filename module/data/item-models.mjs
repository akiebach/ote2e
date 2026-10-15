import { OTE } from "../config.mjs";

const { TypeDataModel } = foundry.abstract;
const { StringField, NumberField, BooleanField } = foundry.data.fields;

const text = (initial = "") => new StringField({ required: true, blank: true, initial });
const int = (initial = 0, extra = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, initial, ...extra });

/**
 * A character trait: a central trait, side trait, developed trait or flaw.
 * `dice` is the score actually rolled; it is stored (not computed) because
 * advancement and GM rulings routinely move it off the starting charts.
 */
export class TraitData extends TypeDataModel {
  static defineSchema() {
    return {
      kind: new StringField({ required: true, initial: "side", choices: Object.keys(OTE.traitKinds) }),
      scoreType: new StringField({ required: true, initial: "standard", choices: Object.keys(OTE.scoreTypes) }),
      dice: int(3, { min: 0 }),
      superior: new BooleanField({ initial: false }),
      /** Fringe powers spend shots from the psychic pool when used. */
      fringe: new BooleanField({ initial: false }),
      sign: text(),
      description: text()
    };
  }
}

export class WeaponData extends TypeDataModel {
  static defineSchema() {
    return {
      damageFactor: int(1, { min: 0 }),
      attackType: new StringField({ required: true, initial: "normal", choices: Object.keys(OTE.attackTypes) }),
      equipped: new BooleanField({ initial: true }),
      description: text()
    };
  }
}

export class ArmorData extends TypeDataModel {
  static defineSchema() {
    return {
      /** Regular armor rating, either flat points or dice. */
      rating: int(1, { min: 0 }),
      unit: new StringField({ required: true, initial: "points", choices: Object.keys(OTE.armorUnits) }),
      /** Bullet-proof rating in dice (the "b" in "2b"); 0 = none. */
      bulletproof: int(0, { min: 0 }),
      /** True for heavy armor that imposes a penalty die on agility actions. */
      penalty: new BooleanField({ initial: false }),
      equipped: new BooleanField({ initial: true }),
      description: text()
    };
  }
}

export class GearData extends TypeDataModel {
  static defineSchema() {
    return {
      quantity: int(1, { min: 0 }),
      description: text()
    };
  }
}

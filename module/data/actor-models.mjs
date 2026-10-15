import { OTE } from "../config.mjs";

const { TypeDataModel } = foundry.abstract;
const { SchemaField, StringField, NumberField } = foundry.data.fields;

const text = (initial = "") => new StringField({ required: true, blank: true, initial });
const int = (initial = 0, extra = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, initial, ...extra });

/**
 * Fields shared by Characters (PCs) and GMCs.
 *
 * Field paths used elsewhere (sheet, actor document, roll code):
 *   system.hp.{value,max,base,stun}     system.psychic.{label,value,max}
 *   system.xp.{value,max}               system.initiative.dice
 *   system.naturalArmor.{rating,unit}
 */
class OTEActorBase extends TypeDataModel {
  static defineSchema() {
    return {
      concept: text(),
      physicalDescription: text(),
      personalDescription: text(),
      wounds: text(),
      finances: text(),
      motivation: text(),
      secret: text(),
      importantPerson: text(),
      background: text(),

      /**
       * Hit points. `value` may go negative (dead at -max).
       * `base` is the "last level after recovery" used by the halfway-recovery rule;
       * null means "the unwounded maximum".
       * `stun` tracks temporary (taser) damage that returns on recovery.
       */
      hp: new SchemaField({
        value: int(14),
        max: int(OTE.hpDefault, { min: 0 }),
        base: new NumberField({ required: false, nullable: true, integer: true, initial: null }),
        stun: int(0, { min: 0 })
      }),

      /** The pool is named by the character (ch'i pool, magic pool, ...). */
      psychic: new SchemaField({
        label: text(""),
        value: int(0, { min: 0 }),
        max: int(0, { min: 0 })
      }),

      /** Experience pool: `max` = dice owned, `value` = dice still usable this session. */
      xp: new SchemaField({
        value: int(1, { min: 0 }),
        max: int(1, { min: 0 })
      }),

      initiative: new SchemaField({
        dice: int(2, { min: 1 })
      }),

      /** Armor that isn't an item: thick skin, a GMC stat block's "Armor: 1 point", etc. */
      naturalArmor: new SchemaField({
        rating: int(0, { min: 0 }),
        unit: new StringField({ required: true, initial: "points", choices: Object.keys(OTE.armorUnits) })
      })
    };
  }

  /** Derived values that need the embedded items to exist already. */
  prepareDerivedData() {
    const { value, max } = this.hp;

    // Rules: half HP or less => penalty die; 0 or less => out of the fight;
    // twice normal HP of damage (i.e. -max) => dead or dying.
    const dead = value <= -max;
    const down = !dead && value <= 0;
    const messedUp = !dead && !down && value <= max / 2;
    this.status = {
      dead,
      down,
      messedUp,
      key: dead ? "dead" : down ? "down" : messedUp ? "messedUp" : "ok"
    };

    // Heavy armor causes a penalty die; each extra layer worn adds another.
    const worn = (this.parent?.items ?? []).filter(i => i.type === "armor" && i.system.equipped);
    const penaltyArmor = worn.filter(i => i.system.penalty).length;
    this.armorPenalty = penaltyArmor + Math.max(0, worn.length - 1);
  }
}

/** A player character. */
export class CharacterData extends OTEActorBase {
  static defineSchema() {
    return { ...super.defineSchema(), player: text() };
  }
}

/** A Game Moderator Character (NPC). Adds a stat-block style combat block. */
export class GMCData extends OTEActorBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      role: text(),
      connections: text(),
      attack: new SchemaField({
        dice: int(2, { min: 0 }),
        factor: int(1, { min: 0 })
      }),
      defense: new SchemaField({
        dice: int(2, { min: 0 })
      })
    };
  }
}

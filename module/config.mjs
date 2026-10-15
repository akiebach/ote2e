/**
 * Static configuration & rule tables for Over the Edge (2nd Edition).
 * Pure data: nothing in here touches the Foundry API, so every other module
 * can import it safely at any point in the load order.
 */

export const SYSTEM_ID = "over-the-edge";
export const SYSTEM_PATH = `systems/${SYSTEM_ID}`;

export const OTE = {};

/* ---------------------------------------------------------------- Traits */

/** Trait "kinds" — the four slots of a starting character, plus later growth. */
OTE.traitKinds = {
  central: "OTE.TraitKind.central",
  side: "OTE.TraitKind.side",
  developed: "OTE.TraitKind.developed",
  flaw: "OTE.TraitKind.flaw"
};

/** Order in which kinds are listed on the sheet. */
OTE.traitKindOrder = ["central", "side", "developed", "flaw"];

OTE.scoreTypes = {
  standard: "OTE.ScoreType.standard",
  technical: "OTE.ScoreType.technical",
  narrow: "OTE.ScoreType.narrow",
  narrowTechnical: "OTE.ScoreType.narrowTechnical"
};

/** Chapter 1 score charts: dice for a Superior / Good / Average (untrained) trait. */
OTE.scoreTable = {
  standard: { superior: 4, good: 3, average: 2 },
  technical: { superior: 2, good: 1, average: 0 },
  narrow: { superior: 6, good: 4, average: 2 },
  narrowTechnical: { superior: 4, good: 2, average: 0 }
};

/* -------------------------------------------------------------- Hit points */

OTE.hpPerDie = 7;
OTE.hpDefault = 14;

/**
 * Long-Term Healing table (hit points regained per day).
 * Rows: care level.  Columns: condition.  "bedridden" = 0 or fewer HP,
 * "critical" = severely wounded (GM's option).  Fractions are accumulated over days.
 */
OTE.healRates = {
  active: { mobile: 0, bedridden: 0, critical: 0 },
  rest: { mobile: 1, bedridden: 0.5, critical: 0 },
  medical: { mobile: 2, bedridden: 1, critical: 0.5 }
};
OTE.careLevels = {
  active: "OTE.Care.active",
  rest: "OTE.Care.rest",
  medical: "OTE.Care.medical"
};

/* ----------------------------------------------------------------- Combat */

/**
 * How a weapon interacts with armor (see "Armor/Attack Summary", Ch. 1).
 *  normal        – melee/thrown/etc.
 *  bullet        – standard firearm round (and shotgun shells)
 *  armorPiercing – half damage, but armor is nearly useless
 *  hollowPoint   – +2 damage factor, armor counts double
 *  taser         – armor either stops it or doesn't; damage is temporary
 */
OTE.attackTypes = {
  normal: "OTE.AttackType.normal",
  bullet: "OTE.AttackType.bullet",
  armorPiercing: "OTE.AttackType.armorPiercing",
  hollowPoint: "OTE.AttackType.hollowPoint",
  taser: "OTE.AttackType.taser"
};

OTE.armorUnits = {
  points: "OTE.ArmorUnit.points",
  dice: "OTE.ArmorUnit.dice"
};

/** Status effect ids (core Foundry statuses) applied by hit-point thresholds. */
OTE.statusIds = { down: "unconscious", dead: "dead" };

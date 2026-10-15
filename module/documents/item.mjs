import { OTE } from "../config.mjs";

export class OTEItem extends Item {

  /** Dice for a trait according to the Chapter 1 charts (superior vs. good). */
  static ruleDice(scoreType, superior) {
    const row = OTE.scoreTable[scoreType] ?? OTE.scoreTable.standard;
    return superior ? row.superior : row.good;
  }
}

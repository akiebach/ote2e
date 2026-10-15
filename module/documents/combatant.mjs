/**
 * Initiative: roll the dice of whatever trait the character would use
 * (system.initiative.dice, normally 2 — "agile", "good reflexes", etc. raise it).
 */
export class OTECombatant extends Combatant {
  /** @override */
  _getInitiativeFormula() {
    const dice = Math.max(1, this.actor?.system?.initiative?.dice ?? 2);
    return `${dice}d6`;
  }
}

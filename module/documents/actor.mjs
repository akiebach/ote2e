import { OTE } from "../config.mjs";
import { promptRoll, promptHitPoints } from "../dice/dialogs.mjs";
import { evaluateRoll, applySpends, postRollCard } from "../dice/roll.mjs";

const localize = k => game.i18n.localize(k);

export class OTEActor extends Actor {

  get isGMC() { return this.type === "gmc"; }

  /** All trait items, flaws included. */
  get traits() { return this.items.filter(i => i.type === "trait"); }

  /** Traits that could plausibly be rolled for an attack or defense (everything but flaws). */
  get actionTraits() { return this.traits.filter(t => t.system.kind !== "flaw"); }

  /* ----------------------------------------------------------------- Armor */

  /**
   * Total protection from equipped armor plus natural armor.
   * `points` are flat; `dice` are rolled; `bpDice` is the bullet-proof ("b") rating.
   */
  getArmor() {
    const total = { points: 0, dice: 0, bpDice: 0 };
    const add = (rating, unit) => { total[unit === "dice" ? "dice" : "points"] += rating; };
    for (const item of this.items) {
      if (item.type !== "armor" || !item.system.equipped) continue;
      add(item.system.rating, item.system.unit);
      total.bpDice += item.system.bulletproof;
    }
    add(this.system.naturalArmor.rating, this.system.naturalArmor.unit);
    return total;
  }

  /* ----------------------------------------------------------------- Rolls */

  /** Run a prepared options object through spend → evaluate → chat. */
  async executeRoll(opts) {
    await applySpends(this, opts);
    const result = await evaluateRoll(opts);
    await postRollCard(this, opts, result);
    return result;
  }

  async rollTrait(item) {
    const opts = await promptRoll(this, {
      title: `${this.name}: ${item.name}`,
      label: item.name,
      dice: item.system.dice,
      fringe: item.system.fringe
    });
    return opts ? this.executeRoll(opts) : null;
  }

  /** "The Hand of Fate": two dice when no trait applies. */
  async rollHandOfFate() {
    const opts = await promptRoll(this, {
      title: `${this.name}: ${localize("OTE.HandOfFate")}`,
      label: localize("OTE.HandOfFate"),
      dice: 2
    });
    return opts ? this.executeRoll(opts) : null;
  }

  async rollDefense() {
    const opts = await promptRoll(this, {
      title: `${this.name}: ${localize("OTE.Defense")}`,
      label: localize("OTE.Defense"),
      dice: this.isGMC ? this.system.defense.dice : 2,
      traits: this.actionTraits,
      agility: true
    });
    return opts ? this.executeRoll(opts) : null;
  }

  /** Attack with a weapon item, or (no argument) with a GMC's stat-block attack. */
  async rollAttack(weapon = null) {
    const attack = weapon
      ? { name: weapon.name, factor: weapon.system.damageFactor, attackType: weapon.system.attackType }
      : { name: localize("OTE.Attack"), factor: this.system.attack?.factor ?? 1, attackType: "normal" };
    const opts = await promptRoll(this, {
      title: `${this.name}: ${attack.name}`,
      label: `${localize("OTE.Attack")}: ${attack.name}`,
      dice: this.isGMC ? this.system.attack.dice : 2,
      traits: this.actionTraits,
      agility: true,
      attack
    });
    return opts ? this.executeRoll(opts) : null;
  }

  /* ------------------------------------------------------------ Hit points */

  /** Subtract damage. `stun` (taser) damage is also tracked so it can return in full. */
  async applyDamage(amount, { stun = false } = {}) {
    amount = Math.max(0, Math.round(amount));
    if (!amount) return;
    const hp = this.system.hp;
    const update = { "system.hp.value": hp.value - amount };
    if (stun) update["system.hp.stun"] = hp.stun + amount;
    await this.update(update);
  }

  /**
   * Recovery after a fight: stun damage returns in full, then the character regains
   * `fraction` (normally half) of the way from the wounded level back up to the
   * level reached after the last recovery. Hit points round up.
   */
  async recover(fraction = 0.5) {
    const hp = this.system.hp;
    const restored = hp.value + hp.stun;
    const ceiling = Math.max(hp.base ?? hp.max, restored);
    const raw = restored + (ceiling - restored) * fraction;
    const value = Math.min(hp.max, Math.ceil(Number(raw.toFixed(6))));
    await this.update({
      "system.hp.value": value,
      "system.hp.stun": 0,
      "system.hp.base": value >= hp.max ? null : value
    });
    return value;
  }

  /** Long-term healing from the Long-Term Healing table. Returns points regained. */
  async heal({ care = "rest", days = 1, critical = false } = {}) {
    const hp = this.system.hp;
    const before = hp.value;   // `hp` is live data: read it before awaiting the update
    const state = before >= 1 ? "mobile" : critical ? "critical" : "bedridden";
    const rate = OTE.healRates[care]?.[state] ?? 0;
    const gain = Math.floor(rate * days + 1e-9);
    const value = Math.min(hp.max, before + gain);
    await this.update({
      "system.hp.value": value,
      "system.hp.stun": 0,
      "system.hp.base": value >= hp.max ? null : value
    });
    return value - before;
  }

  /** Set maximum hit points from relevant traits: 7 per die (or roll twice the dice), highest wins. */
  async rollHitPoints() {
    const choice = await promptHitPoints(this);
    if (!choice) return;
    const traits = choice.ids.map(id => this.items.get(id)).filter(Boolean);

    let max = OTE.hpDefault;
    const rolls = [];
    if (traits.length && choice.mode === "average") {
      max = Math.max(OTE.hpDefault, ...traits.map(t => t.system.dice * OTE.hpPerDie));
    } else if (traits.length) {
      const totals = [];
      for (const t of traits) {
        const roll = new Roll(`${Math.max(1, 2 * t.system.dice)}d6`);
        await roll.evaluate();
        rolls.push(roll); totals.push(roll.total);
      }
      max = Math.max(...totals);
    }

    await this.update({
      "system.hp.max": max, "system.hp.value": max, "system.hp.base": null, "system.hp.stun": 0
    });
    if (rolls.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<p>${game.i18n.format("OTE.HP.Result", { name: this.name, max })}</p>`,
        rolls, sound: CONFIG.sounds.dice
      });
    }
  }

  /* ----------------------------------------------------------------- Pools */

  async restorePsychic() { return this.update({ "system.psychic.value": this.system.psychic.max }); }
  async newSession() { return this.update({ "system.xp.value": this.system.xp.max }); }

  /* -------------------------------------------------------- Status effects */

  /** Mirror the hit-point thresholds onto core status effects. */
  async #syncStatuses() {
    const { value, max } = this.system.hp;
    const dead = value <= -max;
    const down = !dead && value <= 0;
    const known = id => CONFIG.statusEffects.some(s => s.id === id);
    const want = new Map([[OTE.statusIds.down, down], [OTE.statusIds.dead, dead]]);
    for (const [id, active] of want) {
      if (!known(id) || this.statuses.has(id) === active) continue;
      await this.toggleStatusEffect(id, { active, overlay: id === OTE.statusIds.dead });
    }
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    // Player characters get linked, friendly tokens with an HP bar; GMCs keep core defaults.
    if (this.type === "character") {
      this.updateSource({ prototypeToken: { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY } });
    }
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId === game.user.id && foundry.utils.hasProperty(changed, "system.hp")) this.#syncStatuses();
  }
}

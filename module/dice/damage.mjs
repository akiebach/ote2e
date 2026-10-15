/**
 * Damage resolution: (attack − defense) × damage factor, then armor.
 *
 * Armor/Attack Summary (Ch. 1), implemented in computeDamage():
 *
 *   attack          regular armor                  bullet-proof armor
 *   normal          subtract roll (+ flat points)  subtract number of dice
 *   bullet          subtract half the roll (floor) divide by the roll
 *   armor-piercing  subtract number of dice        subtract number of dice; then ÷2
 *   hollow point    subtract double the roll       divide by double the roll; factor +2
 *   taser           armor stops it entirely if protection ≥ margin; damage is temporary
 *
 * Note on ambiguity in the printed examples: they sometimes skip the "regular
 * armor is half as effective versus gunfire" halving and the armor-piercing
 * "÷2 after armor" step. This code follows the rule text, not the worked examples.
 */
import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";

const { renderTemplate } = foundry.applications.handlebars;

async function rollDice(n) {
  if (n <= 0) return { total: 0, roll: null };
  const roll = new Roll(`${n}d6`);
  await roll.evaluate();
  return { total: roll.total, roll };
}

/**
 * @param {object} p
 * @param {number} p.attackTotal   @param {boolean} p.attackBotch
 * @param {number} p.defenseTotal  @param {boolean} p.defenseBotch
 * @param {number} p.factor        weapon damage factor
 * @param {string} p.attackType    key of OTE.attackTypes
 * @param {boolean} [p.special]    special-effect attack: half damage
 * @param {number} [p.divisor]     e.g. shotgun: divide by distance dice
 * @param {{points:number,dice:number,bpDice:number}} p.armor  from OTEActor#getArmor()
 */
export async function computeDamage(p) {
  const attack = p.attackBotch ? 0 : p.attackTotal;   // a botch is an automatic failure
  const defense = p.defenseBotch ? 0 : p.defenseTotal;
  const margin = attack - defense;
  const out = {
    hit: margin > 0, margin, attack, defense, factor: p.factor, attackType: p.attackType,
    raw: 0, damage: 0, stun: p.attackType === "taser", blocked: false,
    armor: { points: p.armor.points, dice: p.armor.dice, bpDice: p.armor.bpDice, regRoll: 0, bpRoll: 0, reduction: 0, divide: 1 },
    rolls: []
  };
  if (!out.hit) return out;

  const factor = p.factor + (p.attackType === "hollowPoint" ? 2 : 0);
  out.factor = factor;
  let dmg = margin * factor;
  if (p.special) dmg = Math.floor(dmg / 2);
  if (p.divisor > 1) dmg = dmg / p.divisor;
  out.raw = dmg;

  const { points, dice, bpDice } = p.armor;
  const reg = await rollDice(dice);
  const bp = await rollDice(bpDice);
  if (reg.roll) out.rolls.push(reg.roll);
  if (bp.roll) out.rolls.push(bp.roll);
  out.armor.regRoll = reg.total;
  out.armor.bpRoll = bp.total;
  const regTotal = reg.total + points;

  switch (p.attackType) {
    case "bullet": {
      out.armor.reduction = Math.floor(regTotal / 2);
      dmg -= out.armor.reduction;
      if (bpDice > 0) { out.armor.divide = Math.max(1, bp.total); dmg /= out.armor.divide; }
      break;
    }
    case "armorPiercing": {
      out.armor.reduction = dice + points + bpDice;
      dmg = (dmg - out.armor.reduction) / 2;
      break;
    }
    case "hollowPoint": {
      out.armor.reduction = 2 * regTotal;
      dmg -= out.armor.reduction;
      if (bpDice > 0) { out.armor.divide = Math.max(1, 2 * bp.total); dmg /= out.armor.divide; }
      break;
    }
    case "taser": {
      const protection = regTotal + bpDice;
      out.armor.reduction = protection;
      if (protection >= margin) { dmg = 0; out.blocked = true; }
      break;
    }
    default: { // normal
      out.armor.reduction = regTotal + bpDice;
      dmg -= out.armor.reduction;
    }
  }

  out.damage = Math.max(0, Math.round(dmg));
  return out;
}

/**
 * Post a damage card. The "Apply" button is wired up in chat.mjs.
 */
export async function postDamageCard({ attacker, targetActor, targetToken, weaponName, attackResult, defenseResult, dmg }) {
  const context = {
    attackerName: attacker?.name ?? "",
    targetName: targetToken?.name ?? targetActor.name,
    weaponName,
    attack: dmg.attack, defense: dmg.defense,
    attackBotch: attackResult.botch, defenseBotch: defenseResult.botch,
    hit: dmg.hit, margin: dmg.margin, factor: dmg.factor, raw: Math.round(dmg.raw),
    armor: dmg.armor, hasArmor: dmg.armor.points + dmg.armor.dice + dmg.armor.bpDice > 0,
    blocked: dmg.blocked, damage: dmg.damage, stun: dmg.stun
  };
  const content = await renderTemplate(`${SYSTEM_PATH}/templates/chat/damage-card.hbs`, context);
  const data = {
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content,
    rolls: [defenseResult.roll, ...defenseResult.extraRolls, ...dmg.rolls],
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEM_ID]: { damage: { targetUuid: targetActor.uuid, amount: dmg.damage, stun: dmg.stun, applied: false } } }
  };
  return ChatMessage.create(data);
}

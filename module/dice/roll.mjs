/**
 * Over the Edge dice engine.
 *
 *   evaluateRoll()  – builds & evaluates a roll from {dice, bonus, penalty, push}
 *   postRollCard()  – renders the result into chat
 *   applySpends()   – deducts experience dice / psychic shots after a roll
 *   compare()       – success / stalemate / failure by margin
 */
import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { getRules } from "../settings.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/* --------------------------------------------------------------- Formula */

/**
 * Build the Foundry roll formula.
 *
 * A bonus die = roll one extra die, drop the lowest.  A penalty die = roll one
 * extra die, drop the highest.  Bonus and penalty dice cancel one for one.
 * "Pushing" a fringe power rolls twice the dice and counts the better half;
 * penalty dice then drop the highest dice before the best half is kept.
 */
export function buildFormula({ dice, bonus = 0, penalty = 0, push = false }) {
  const n = Math.max(1, Math.floor(dice));
  const net = Math.floor(bonus) - Math.floor(penalty);
  if (!push) {
    if (net > 0) return `${n + net}d6kh${n}`;
    if (net < 0) return `${n - net}d6kl${n}`;
    return `${n}d6`;
  }
  if (net >= 0) return `${2 * n + net}d6kh${n}`;
  const extra = -net;
  return `${2 * n + extra}d6dh${extra}kh${n}`;
}

/** Fold the "multiple actions" rule into bonus/penalty/dice (Ch. 1, Optional Rules). */
export function applyExtraActions({ dice, penalty = 0, extraActions = 0 }) {
  if (extraActions >= 1) penalty += 1;          // one extra action: penalty die
  if (extraActions >= 2) dice -= extraActions - 1; // each further extra action: one fewer die
  return { dice, penalty };
}

/* -------------------------------------------------------------- Evaluate */

/**
 * Roll and interpret.
 * @param {object} opts  { dice, bonus, penalty, push, difficulty:{mode,value}, hideOpposition }
 * @returns {Promise<object>} everything the chat card and damage code need
 */
export async function evaluateRoll(opts) {
  const rules = getRules();
  const formula = buildFormula(opts);
  const roll = new Roll(formula);
  await roll.evaluate();

  const term = roll.dice[0];
  const faces = term.results.map(r => ({ value: r.result, kept: r.active !== false }));
  const kept = faces.filter(f => f.kept);

  let total = roll.total;
  const extraRolls = [];

  // Optional: "Blowing the Top Off" — all sixes => keep rolling a die and adding it.
  let toppedOff = false;
  if (rules.blowTheTop && kept.length && kept.every(f => f.value === 6)) {
    toppedOff = true;
    for (let i = 0; i < 20; i++) {
      const extra = new Roll("1d6");
      await extra.evaluate();
      extraRolls.push(extra);
      total += extra.total;
      if (extra.total !== 6) break;
    }
  }

  // Optional: botch — all kept dice are 1s.
  const botch = rules.botches && kept.length > 0 && kept.every(f => f.value === 1);

  // Optional: Unstoppable Six — count 6s among the kept dice.
  const sixes = rules.unstoppableSix ? kept.filter(f => f.value === 6).length : 0;

  // Difficulty: a fixed number, or the GM rolling opposition dice.
  let target = null;
  let oppositionRoll = null;
  const diff = opts.difficulty ?? { mode: "none" };
  if (diff.mode === "fixed") target = Number(diff.value) || 0;
  else if (diff.mode === "dice") {
    oppositionRoll = new Roll(`${Math.max(1, Number(diff.value) || 1)}d6`);
    await oppositionRoll.evaluate();
    target = oppositionRoll.total;
  }

  return {
    formula, roll, extraRolls, oppositionRoll, faces, total, botch, sixes, toppedOff,
    target, ...compare(total, target, botch),
    hideOpposition: !!opts.hideOpposition
  };
}

/** Compare a total to a target: higher wins, equal is a draw. A botch always fails. */
export function compare(total, target, botch = false) {
  if (target === null || target === undefined) return { outcome: botch ? "failure" : "none", margin: 0 };
  if (botch) return { outcome: "failure", margin: Math.abs(total - target) };
  const margin = total - target;
  return { outcome: margin > 0 ? "success" : margin < 0 ? "failure" : "stalemate", margin: Math.abs(margin) };
}

/* ------------------------------------------------------------------ Spend */

/** Deduct experience dice and psychic shots that a roll consumed. */
export async function applySpends(actor, opts) {
  if (!actor) return;
  const updates = {};
  if (opts.xpSpent > 0) updates["system.xp.value"] = Math.max(0, actor.system.xp.value - opts.xpSpent);
  if (opts.shotsSpent > 0) updates["system.psychic.value"] = Math.max(0, actor.system.psychic.value - opts.shotsSpent);
  if (Object.keys(updates).length) await actor.update(updates);
}

/* ------------------------------------------------------------------- Chat */

/**
 * Post a roll card.
 * @param {Actor} actor
 * @param {object} opts    the dialog options (label, bonus, penalty, xpReason, rollMode, attack...)
 * @param {object} result  return value of evaluateRoll()
 */
export async function postRollCard(actor, opts, result) {
  const context = {
    label: opts.label,
    formula: result.formula,
    faces: result.faces.map(f => ({ ...f, six: f.value === 6, one: f.value === 1 })),
    extraFaces: result.extraRolls.map(r => r.total),
    total: result.total,
    bonus: opts.bonus,
    penalty: opts.penalty,
    push: opts.push,
    xpSpent: opts.xpSpent,
    xpReason: opts.xpReason,
    botch: result.botch,
    sixes: result.sixes,
    toppedOff: result.toppedOff,
    hasTarget: result.target !== null,
    target: result.target,
    showTarget: !(result.oppositionRoll && result.hideOpposition),
    outcome: result.outcome,
    outcomeLabel: result.outcome === "none" ? "" : game.i18n.localize(`OTE.Outcome.${result.outcome}`),
    margin: result.margin,
    attack: opts.attack ?? null
  };
  const content = await renderTemplate(`${SYSTEM_PATH}/templates/chat/roll-card.hbs`, context);

  const flags = {};
  if (opts.attack) {
    flags.attack = {
      actorUuid: actor?.uuid ?? null,
      total: result.total,
      botch: result.botch,
      ...opts.attack          // { name, factor, attackType, special, divisor }
    };
  }

  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [result.roll, ...result.extraRolls, ...(result.oppositionRoll ? [result.oppositionRoll] : [])],
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEM_ID]: flags }
  };
  ChatMessage.applyRollMode(data, opts.rollMode ?? game.settings.get("core", "rollMode"));
  return ChatMessage.create(data);
}

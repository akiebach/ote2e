/**
 * Chat-card behaviour: the "Resolve" button on attack cards and the
 * "Apply" button on damage cards. Cards carry their data in message flags.
 */
import { SYSTEM_ID } from "./config.mjs";
import { promptRoll } from "./dice/dialogs.mjs";
import { evaluateRoll, applySpends } from "./dice/roll.mjs";
import { computeDamage, postDamageCard } from "./dice/damage.mjs";

const localize = k => game.i18n.localize(k);
const format = (k, d) => game.i18n.format(k, d);

/** Hook: renderChatMessageHTML */
export function bindChatListeners(message, html) {
  const flags = message.flags?.[SYSTEM_ID];
  if (!flags) return;

  if (flags.damage?.applied) {
    const btn = html.querySelector("[data-ote-action=applyDamage]");
    if (btn) { btn.disabled = true; btn.textContent = localize("OTE.Chat.Applied"); }
  }

  html.querySelectorAll("[data-ote-action]").forEach(btn => {
    btn.addEventListener("click", async event => {
      event.preventDefault();
      const action = btn.dataset.oteAction;
      if (action === "resolveAttack") await resolveAttack(message);
      else if (action === "applyDamage") await applyDamage(message, btn);
    });
  });
}

/** Roll defense for each targeted token, work out damage, and post a damage card. */
async function resolveAttack(message) {
  const attackData = message.flags[SYSTEM_ID]?.attack;
  if (!attackData) return;
  const targets = [...game.user.targets];
  if (!targets.length) return ui.notifications.warn(localize("OTE.Warn.NoTarget"));

  const attacker = attackData.actorUuid ? await fromUuid(attackData.actorUuid) : null;

  for (const token of targets) {
    const target = token.actor;
    if (!target) continue;

    const opts = await promptRoll(target, {
      title: `${target.name}: ${localize("OTE.Defense")}`,
      label: `${localize("OTE.Defense")}: ${token.name}`,
      dice: target.isGMC ? target.system.defense.dice : 2,
      traits: target.actionTraits,
      agility: true,
      // The defender's own dialog is a plain roll: no damage section, no difficulty.
      defense: true
    });

    if (!opts) continue;

    // Only the owner may deduct the defender's experience dice / psychic shots.
    if (target.isOwner) await applySpends(target, opts);
    else if (opts.xpSpent > 0 || opts.shotsSpent > 0)
      ui.notifications.warn(format("OTE.Warn.SpendNotOwner", { name: target.name }));
    const defense = await evaluateRoll({ ...opts, difficulty: { mode: "none" } });
    const dmg = await computeDamage({
      attackTotal: attackData.total, attackBotch: attackData.botch,
      defenseTotal: defense.total, defenseBotch: defense.botch,
      factor: attackData.factor, attackType: attackData.attackType,
      special: attackData.special, divisor: attackData.divisor,
      armor: target.getArmor()
    });
    await postDamageCard({
      attacker, targetActor: target, targetToken: token,
      weaponName: attackData.name, attackResult: { botch: attackData.botch },
      defenseResult: defense, dmg
    });
  }
}

/** Subtract the card's damage from its target. */
async function applyDamage(message, button) {
  const data = message.flags[SYSTEM_ID]?.damage;
  if (!data || data.applied) return;
  const target = await fromUuid(data.targetUuid);
  if (!target) return ui.notifications.warn(localize("OTE.Warn.NoActor"));
  if (!target.isOwner) return ui.notifications.warn(localize("OTE.Warn.NotOwner"));

  await target.applyDamage(data.amount, { stun: data.stun });
  button.disabled = true;
  button.textContent = localize("OTE.Chat.Applied");
  if (message.isOwner) await message.update({ [`flags.${SYSTEM_ID}.damage.applied`]: true });
}

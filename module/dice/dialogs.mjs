/**
 * Prompts. Every function resolves to a plain options object, or null if the
 * user cancelled, so callers never touch the DOM.
 */
import { OTE, SYSTEM_PATH } from "../config.mjs";
import { getRules } from "../settings.mjs";
import { applyExtraActions } from "./roll.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;
const { FormDataExtended } = foundry.applications.ux;

const num = v => Number(v) || 0;
const localize = k => game.i18n.localize(k);
const format = (k, d) => game.i18n.format(k, d);

/** Show a DialogV2 form and resolve with its parsed form data (or null). */
async function formDialog({ title, content, ok = "OTE.Roll", icon = "fa-solid fa-dice", render }) {
  return DialogV2.prompt({
    window: { title, icon },
    content,
    rejectClose: false,
    render,
    ok: {
      label: localize(ok),
      icon,
      callback: (event, button) => new FormDataExtended(button.form).object
    }
  });
}

function rollModeChoices() {
  return Object.fromEntries(
    Object.entries(CONFIG.Dice.rollModes).map(([k, v]) => [k, localize(typeof v === "string" ? v : v.label)])
  );
}

/* ------------------------------------------------------------- Roll prompt */

/**
 * The general roll dialog.
 * @param {Actor} actor
 * @param {object} cfg
 * @param {string} cfg.title        window title
 * @param {string} cfg.label        chat-card label
 * @param {number} [cfg.dice=2]     default dice
 * @param {Item[]} [cfg.traits]     offers a trait selector when provided
 * @param {boolean} [cfg.fringe]    trait draws on the psychic pool
 * @param {boolean} [cfg.agility]   action is agility-based: heavy armor penalties apply
 * @param {object} [cfg.attack]     {name, factor, attackType} — adds the damage section
 * @param {boolean} [cfg.defense]   a defender's roll: hides the difficulty section
 * @param {string} [cfg.selectedTraitId]
 */
export async function promptRoll(actor, cfg) {
  const rules = getRules();
  const sys = actor.system;

  // Automatic penalty dice, shown (and editable) so the player can see why.
  let penalty = 0;
  const notes = [];
  if (rules.autoPenalty && sys.status.messedUp) { penalty += 1; notes.push(localize("OTE.Status.messedUp")); }
  if (rules.autoPenalty && cfg.agility && sys.armorPenalty > 0) {
    penalty += sys.armorPenalty; notes.push(`${localize("OTE.Armor.Encumbrance")} (${sys.armorPenalty})`);
  }

  const xpAllowed = rules.multipleXP ? sys.xp.value : Math.min(1, sys.xp.value);
  const traits = (cfg.traits ?? []).map(t => ({ id: t.id, name: t.name, dice: t.system.dice, selected: t.id === cfg.selectedTraitId }));
  const selected = traits.find(t => t.selected);

  const content = await renderTemplate(`${SYSTEM_PATH}/templates/dice/roll-dialog.hbs`, {
    traits, dice: selected?.dice ?? cfg.dice ?? 2, penalty,
    penaltyNotes: notes.join(", "),
    xpAvailable: sys.xp.value, xpAllowed,
    fringe: !!cfg.fringe, shotsAvailable: sys.psychic.value,
    attack: cfg.attack ?? null, attackTypes: OTE.attackTypes,
    showDifficulty: !cfg.attack && !cfg.defense,
    rollModes: rollModeChoices(), rollMode: game.settings.get("core", "rollMode")
  });

  const data = await formDialog({
    title: cfg.title,
    content,
    render: (event, dialog) => {
      const el = dialog.element;
      const sel = el.querySelector("[name=trait]");
      const dice = el.querySelector("[name=dice]");
      sel?.addEventListener("change", () => { dice.value = sel.selectedOptions[0].dataset.dice; });
      const mode = el.querySelector("[name=difficultyMode]");
      const value = el.querySelector("[name=difficultyValue]");
      const hide = el.querySelector("[data-ote-hide-opp]");
      mode?.addEventListener("change", () => {
        value.disabled = mode.value === "none";
        value.value = mode.value === "dice" ? 2 : 7;
        hide.hidden = mode.value !== "dice";
      });
    }
  });
  if (!data) return null;

  // Experience dice act as bonus dice (they can also cancel a penalty die).
  const xpSpent = Math.min(Math.max(0, Math.floor(num(data.xpSpent))), xpAllowed);
  const { dice, penalty: pen } = applyExtraActions({
    dice: num(data.dice), penalty: num(data.penalty), extraActions: num(data.extraActions)
  });

  const push = !!cfg.fringe && !!data.push;
  const shotsSpent = cfg.fringe ? (push ? 2 : 1) : 0;
  if (shotsSpent > sys.psychic.value) {
    ui.notifications.warn(format("OTE.Warn.NotEnoughShots", { name: actor.name }));
    return null;
  }

  const chosen = data.trait ? traits.find(t => t.id === data.trait)?.name : null;
  const opts = {
    label: chosen ? `${cfg.label} — ${chosen}` : cfg.label,
    dice, bonus: num(data.bonus) + xpSpent, penalty: pen,
    push, xpSpent, shotsSpent, xpReason: data.xpReason ?? "",
    rollMode: data.rollMode,
    difficulty: { mode: data.difficultyMode ?? "none", value: num(data.difficultyValue) },
    hideOpposition: !!data.hideOpposition
  };
  if (cfg.attack) {
    opts.attack = {
      name: cfg.attack.name,
      factor: num(data.factor),
      attackType: data.attackType,
      special: !!data.special,
      divisor: Math.max(1, num(data.divisor))
    };
  }
  return opts;
}

/* ------------------------------------------------------- Other small prompts */

/** Choose which traits set hit points, and whether to take the average or roll. */
export async function promptHitPoints(actor) {
  const traits = actor.items.filter(i => i.type === "trait" && i.system.kind !== "flaw");
  const rows = traits.map(t =>
    `<label class="checkbox"><input type="checkbox" name="t_${t.id}"> ${foundry.utils.escapeHTML(t.name)} (${t.system.dice}d)</label>`
  ).join("") || `<p class="hint">${localize("OTE.HP.NoTraits")}</p>`;
  const content = `
    <p class="hint">${localize("OTE.HP.Hint")}</p>
    <div class="form-group stacked">${rows}</div>
    <div class="form-group"><label>${localize("OTE.HP.Mode")}</label>
      <div class="form-fields">
        <label class="checkbox"><input type="radio" name="mode" value="average" checked> ${localize("OTE.HP.Average")}</label>
        <label class="checkbox"><input type="radio" name="mode" value="roll"> ${localize("OTE.HP.RollIt")}</label>
      </div></div>`;
  const data = await formDialog({ title: localize("OTE.HP.RollTitle"), content, ok: "OTE.HP.Set", icon: "fa-solid fa-heart" });
  if (!data) return null;
  return { ids: traits.filter(t => data[`t_${t.id}`]).map(t => t.id), mode: data.mode };
}

/** Long-term healing: care level, days, and the GM's "critical" option. */
export async function promptHeal() {
  const options = Object.entries(OTE.careLevels).map(([k, v]) => `<option value="${k}">${localize(v)}</option>`).join("");
  const content = `
    <div class="form-group"><label>${localize("OTE.Heal.Care")}</label><div class="form-fields"><select name="care">${options}</select></div></div>
    <div class="form-group"><label>${localize("OTE.Heal.Days")}</label><div class="form-fields"><input type="number" name="days" value="1" min="1" step="1"></div></div>
    <div class="form-group"><label>${localize("OTE.Heal.Critical")}</label><div class="form-fields"><input type="checkbox" name="critical"></div><p class="hint">${localize("OTE.Heal.CriticalHint")}</p></div>`;
  const data = await formDialog({ title: localize("OTE.Heal.Title"), content, ok: "OTE.Heal.Go", icon: "fa-solid fa-bed" });
  return data ? { care: data.care, days: Math.max(1, num(data.days)), critical: !!data.critical } : null;
}

/** Quick damage entry (also used for temporary taser damage). */
export async function promptDamage() {
  const content = `
    <div class="form-group"><label>${localize("OTE.Damage.Amount")}</label><div class="form-fields"><input type="number" name="amount" value="1" min="0" step="1" autofocus></div></div>
    <div class="form-group"><label>${localize("OTE.Damage.Stun")}</label><div class="form-fields"><input type="checkbox" name="stun"></div><p class="hint">${localize("OTE.Damage.StunHint")}</p></div>`;
  const data = await formDialog({ title: localize("OTE.Damage.Title"), content, ok: "OTE.Damage.Apply", icon: "fa-solid fa-burst" });
  return data ? { amount: Math.max(0, Math.floor(num(data.amount))), stun: !!data.stun } : null;
}

/** Recovery fraction (default one half; the GM may rule otherwise). */
export async function promptRecover() {
  const content = `
    <div class="form-group"><label>${localize("OTE.Recover.Percent")}</label><div class="form-fields"><input type="number" name="pct" value="50" min="0" max="100" step="5"></div><p class="hint">${localize("OTE.Recover.Hint")}</p></div>`;
  const data = await formDialog({ title: localize("OTE.Recover.Title"), content, ok: "OTE.Recover.Go", icon: "fa-solid fa-heart-pulse" });
  return data ? Math.min(1, Math.max(0, num(data.pct) / 100)) : null;
}

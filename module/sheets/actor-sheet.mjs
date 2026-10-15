import { OTE, SYSTEM_PATH } from "../config.mjs";
import { promptDamage, promptHeal, promptRecover } from "../dice/dialogs.mjs";
import { editImage } from "./common.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const localize = k => game.i18n.localize(k);

/**
 * One sheet for both Characters and GMCs. The "Sheet" tab reproduces the printed
 * Over the Edge character sheet; the "Background" tab holds the creation prompts
 * (concept, motivation, secret, important person) and rarely used numbers.
 */
export class OTEActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Which tab is showing. Instance state, so each open sheet remembers its own. */
  tab = "sheet";

  static DEFAULT_OPTIONS = {
    classes: ["ote", "actor-sheet"],
    position: { width: 800, height: 960 },
    window: { resizable: true },
    form: { submitOnChange: true },
    // ActorSheetV2 handles Item drops (_onDropItem) once drops are enabled on the element.
    dragDrop: [{ dropSelector: null }],
    actions: {
      // NOT named "tab": ApplicationV2 reserves data-action="tab" for its own tab system
      // (it calls changeTab(tab, group) and never reaches a custom handler).
      showTab: OTEActorSheet.#onShowTab,
      editImage,
      rollTrait: OTEActorSheet.#onRollTrait,
      rollWeapon: OTEActorSheet.#onRollWeapon,
      rollGMCAttack: OTEActorSheet.#onRollGMCAttack,
      rollFate: OTEActorSheet.#onRollFate,
      rollDefense: OTEActorSheet.#onRollDefense,
      rollInitiative: OTEActorSheet.#onRollInitiative,
      createTrait: OTEActorSheet.#onCreateTrait,
      createItem: OTEActorSheet.#onCreateItem,
      editItem: OTEActorSheet.#onEditItem,
      deleteItem: OTEActorSheet.#onDeleteItem,
      toggleSuperior: OTEActorSheet.#onToggleSuperior,
      toggleEquipped: OTEActorSheet.#onToggleEquipped,
      hurt: OTEActorSheet.#onHurt,
      recover: OTEActorSheet.#onRecover,
      heal: OTEActorSheet.#onHeal,
      rollHP: OTEActorSheet.#onRollHP,
      psychicAdjust: OTEActorSheet.#onPsychicAdjust,
      restorePsychic: OTEActorSheet.#onRestorePsychic,
      newSession: OTEActorSheet.#onNewSession
    }
  };

  static PARTS = {
    sheet: { template: `${SYSTEM_PATH}/templates/actor/actor-sheet.hbs`, scrollable: [".ote-traits", ".ote-items"] }
  };

  /* -------------------------------------------------------------- Context */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const byName = (a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name);

    const traits = actor.items.filter(i => i.type === "trait").sort(byName);
    const traitGroups = OTE.traitKindOrder.map(kind => ({
      kind,
      label: localize(OTE.traitKinds[kind]),
      rows: traits.filter(t => t.system.kind === kind).map(t => ({
        id: t.id, name: t.name, dice: t.system.dice, superior: t.system.superior,
        fringe: t.system.fringe, sign: t.system.sign, isFlaw: kind === "flaw"
      }))
    }));

    const of = type => actor.items.filter(i => i.type === type).sort(byName);
    const weapons = of("weapon").map(w => ({
      id: w.id, name: w.name,
      summary: `×${w.system.damageFactor} ${localize(OTE.attackTypes[w.system.attackType])}`
    }));
    const armors = of("armor").map(a => {
      const s = a.system;
      const regular = `${s.rating}${s.unit === "dice" ? "d" : localize("OTE.ArmorUnit.pt")}`;
      return { id: a.id, name: a.name, equipped: s.equipped, summary: s.bulletproof ? `${regular} / ${s.bulletproof}b` : regular };
    });
    const gear = of("gear").map(g => ({ id: g.id, name: g.name, quantity: g.system.quantity }));

    return Object.assign(context, {
      actor, system: sys,
      editable: this.isEditable,
      isGMC: actor.isGMC,
      tabSheet: this.tab === "sheet",
      traitGroups, weapons, armors, gear,
      statusLabel: sys.status.key === "ok" ? "" : localize(`OTE.Status.${sys.status.key}`),
      armorUnits: OTE.armorUnits,
      headerImg: `${SYSTEM_PATH}/assets/ote-header.png`,
      atlasLogo: `${SYSTEM_PATH}/assets/atlas-games-logo.png`
    });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Inline edits that target embedded items rather than the actor itself.
    const inline = (selector, path) => {
      for (const el of this.element.querySelectorAll(selector)) {
        el.addEventListener("change", event => {
          event.stopPropagation();
          const item = this.document.items.get(el.dataset.itemId);
          item?.update({ [path]: Math.max(0, Math.floor(Number(el.value) || 0)) });
        });
      }
    };
    inline(".trait-dice", "system.dice");
    inline(".item-qty", "system.quantity");
  }

  /* -------------------------------------------------------------- Actions */

  #item(target) { return this.document.items.get(target.dataset.itemId); }

  static async #onShowTab(event, target) {
    this.tab = target.dataset.tab;
    return this.render();
  }

  static async #onRollTrait(event, target) { return this.document.rollTrait(this.#item(target)); }
  static async #onRollWeapon(event, target) { return this.document.rollAttack(this.#item(target)); }
  static async #onRollGMCAttack() { return this.document.rollAttack(); }
  static async #onRollFate() { return this.document.rollHandOfFate(); }
  static async #onRollDefense() { return this.document.rollDefense(); }
  static async #onRollInitiative() { return this.document.rollInitiative({ createCombatants: true }); }

  static async #onCreateTrait(event, target) {
    const kind = target.dataset.kind;
    const [item] = await this.document.createEmbeddedDocuments("Item", [{
      name: Item.implementation.defaultName({ type: "trait", parent: this.document }),
      type: "trait",
      system: { kind, dice: kind === "flaw" ? 0 : 3 }
    }]);
    item?.sheet.render(true);
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const [item] = await this.document.createEmbeddedDocuments("Item", [{
      name: Item.implementation.defaultName({ type, parent: this.document }), type
    }]);
    item?.sheet.render(true);
  }

  static async #onEditItem(event, target) { this.#item(target)?.sheet.render(true); }

  static async #onDeleteItem(event, target) {
    const item = this.#item(target);
    if (!item) return;
    const ok = await DialogV2.confirm({
      window: { title: localize("OTE.Delete") },
      content: `<p>${game.i18n.format("OTE.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`,
      rejectClose: false
    });
    if (ok) await item.delete();
  }

  static async #onToggleSuperior(event, target) {
    const item = this.#item(target);
    return item?.update({ "system.superior": !item.system.superior });
  }

  static async #onToggleEquipped(event, target) {
    const item = this.#item(target);
    return item?.update({ "system.equipped": !item.system.equipped });
  }

  static async #onHurt() {
    const r = await promptDamage();
    if (r) await this.document.applyDamage(r.amount, { stun: r.stun });
  }

  /** Shift-click to choose a fraction other than the default half. */
  static async #onRecover(event) {
    const fraction = event.shiftKey ? await promptRecover() : 0.5;
    if (fraction === null) return;
    const value = await this.document.recover(fraction);
    ui.notifications.info(game.i18n.format("OTE.Recover.Done", { name: this.document.name, value }));
  }

  static async #onHeal() {
    const r = await promptHeal();
    if (!r) return;
    const gained = await this.document.heal(r);
    ui.notifications.info(game.i18n.format("OTE.Heal.Done", { name: this.document.name, gained, days: r.days }));
  }

  static async #onRollHP() { return this.document.rollHitPoints(); }

  static async #onPsychicAdjust(event, target) {
    const { value, max } = this.document.system.psychic;
    const next = Math.min(max, Math.max(0, value + Number(target.dataset.delta)));
    return this.document.update({ "system.psychic.value": next });
  }

  static async #onRestorePsychic() { return this.document.restorePsychic(); }
  static async #onNewSession() { return this.document.newSession(); }
}

// Stubs for the template/context compatibility check: real Handlebars (strict), recording schema fields.
import Handlebars from "handlebars";
import fs from "node:fs";
const ROOT = new URL("../", import.meta.url).pathname;
export const rendered = {};

Handlebars.registerHelper("localize", k => k);
Handlebars.registerHelper("selectOptions", () => "");
Handlebars.registerHelper("checked", v => (v ? "checked" : ""));

class Field { constructor(a = {}) { this.a = a; } }
class SchemaField extends Field { constructor(fields) { super(); this.fields = fields; } }
globalThis.foundry = {
  abstract: { TypeDataModel: class {} },
  data: { fields: { SchemaField, StringField: Field, NumberField: Field, BooleanField: Field } },
  utils: { hasProperty: () => false, getProperty: () => undefined, escapeHTML: s => s },
  applications: {
    api: {
      HandlebarsApplicationMixin: B => class extends B {},
      DialogV2: { prompt: async cfg => globalThis.__dialogAnswer ?? null, confirm: async () => true }
    },
    sheets: {
      ActorSheetV2: class { static DEFAULT_OPTIONS = {}; async _prepareContext() { return {}; } },
      ItemSheetV2: class { static DEFAULT_OPTIONS = {}; async _prepareContext() { return {}; } }
    },
    handlebars: {
      renderTemplate: async (path, ctx) => {
        const file = ROOT + path.replace("systems/over-the-edge/", "");
        const html = Handlebars.compile(fs.readFileSync(file, "utf8"), { strict: true })(ctx);
        rendered[path] = html;
        return html;
      }
    },
    ux: { FormDataExtended: class {} },
    apps: { DocumentSheetConfig: {}, FilePicker: {} }
  },
  appv1: { sheets: { ActorSheet: class {}, ItemSheet: class {} } }
};
globalThis.Actor = class {}; globalThis.Item = class {}; globalThis.Combatant = class {};
globalThis.Hooks = { once() {}, on() {} };
globalThis.CONFIG = { sounds: { dice: "x" }, Dice: { rollModes: { publicroll: "CHAT.RollPublic", gmroll: { label: "CHAT.RollPrivate" } } }, statusEffects: [] };
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
globalThis.ui = { notifications: { warn() {}, info() {} } };
globalThis.ChatMessage = { getSpeaker: () => ({}), applyRollMode() {}, create: async d => d };
const settings = { botches: true, blowTheTop: false, unstoppableSix: false, multipleXP: false, autoPenalty: true };
globalThis.game = { settings: { get: (s, k) => settings[k] ?? "publicroll" }, i18n: { localize: k => k, format: k => k } };
export const queue = [];
globalThis.Roll = class {
  constructor(f) { this.formula = f; }
  async evaluate() {
    const m = this.formula.match(/^(\d+)d6(?:dh(\d+))?(?:(kh|kl)(\d+))?$/); const n = +m[1];
    const vals = Array.from({ length: n }, () => queue.length ? queue.shift() : 3);
    const res = vals.map(v => ({ result: v, active: true })); const order = [...res.keys()].sort((a, b) => vals[a] - vals[b]);
    if (m[2]) for (const i of order.slice().reverse().slice(0, +m[2])) res[i].active = false;
    if (m[3]) { const live = order.filter(i => res[i].active), k = +m[4]; for (const i of (m[3] === "kh" ? live.slice(0, live.length - k) : live.slice(k))) res[i].active = false; }
    this.dice = [{ results: res }]; this.total = res.filter(r => r.active).reduce((s, r) => s + r.result, 0);
  }
};

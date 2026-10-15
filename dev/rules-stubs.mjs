// Minimal stand-ins for the Foundry globals our modules touch at import/run time.
const F = class { constructor(o) { this.options = o; } };
globalThis.foundry = {
  abstract: { TypeDataModel: class {} },
  data: { fields: new Proxy({}, { get: () => F }) },
  utils: { hasProperty: () => false, getProperty: () => undefined, escapeHTML: s => s },
  applications: {
    api: { HandlebarsApplicationMixin: B => class extends B {}, DialogV2: class {} },
    sheets: { ActorSheetV2: class { static DEFAULT_OPTIONS = {}; }, ItemSheetV2: class { static DEFAULT_OPTIONS = {}; } },
    handlebars: { renderTemplate: async (path, ctx) => JSON.stringify(ctx) },
    ux: { FormDataExtended: class {} },
    apps: { DocumentSheetConfig: {}, FilePicker: {} }
  },
  appv1: { sheets: { ActorSheet: class {}, ItemSheet: class {} } }
};
globalThis.Actor = class { constructor() { this.updates = []; } async update(u) { this.updates.push(u); } };
globalThis.Item = class {};
globalThis.Combatant = class {};
globalThis.Hooks = { once() {}, on() {} };
globalThis.CONFIG = { sounds: { dice: "x" }, Dice: { rollModes: { publicroll: "CHAT.RollPublic" } }, statusEffects: [] };
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
globalThis.ui = { notifications: { warn() {}, info() {} } };
globalThis.ChatMessage = { getSpeaker: () => ({}), applyRollMode() {}, create: async d => d };
const settings = { botches: true, blowTheTop: false, unstoppableSix: false, multipleXP: false, autoPenalty: true };
globalThis.game = { settings: { get: (s, k) => settings[k] ?? "publicroll", register() {} }, i18n: { localize: k => k, format: k => k } };
export const setRule = (k, v) => { settings[k] = v; };

/** Scripted dice: queue values, then evaluate formulas with Foundry's keep/drop semantics. */
export const queue = [];
globalThis.Roll = class {
  constructor(formula) { this.formula = formula; }
  async evaluate() {
    const m = this.formula.match(/^(\d+)d6(?:dh(\d+))?(?:(kh|kl)(\d+))?$/);
    if (!m) throw new Error("Unsupported formula in stub: " + this.formula);
    const n = +m[1];
    const vals = Array.from({ length: n }, () => queue.length ? queue.shift() : 3);
    const res = vals.map(v => ({ result: v, active: true }));
    const order = [...res.keys()].sort((a, b) => vals[a] - vals[b]);   // ascending
    if (m[2]) for (const i of order.slice().reverse().slice(0, +m[2])) res[i].active = false;      // drop highest
    if (m[3]) {
      const live = order.filter(i => res[i].active);
      const k = +m[4];
      const drop = m[3] === "kh" ? live.slice(0, live.length - k) : live.slice(k);
      for (const i of drop) res[i].active = false;
    }
    this.dice = [{ results: res }];
    this.total = res.filter(r => r.active).reduce((s, r) => s + r.result, 0);
  }
};

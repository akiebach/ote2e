import { SYSTEM_ID } from "./config.mjs";

/** Optional rules from Chapter 1, exposed as world settings. */
const RULES = {
  botches: true,
  blowTheTop: false,
  unstoppableSix: false,
  multipleXP: false,
  autoPenalty: true
};

export function registerSettings() {
  for (const [key, initial] of Object.entries(RULES)) {
    game.settings.register(SYSTEM_ID, key, {
      name: `OTE.Settings.${key}.name`,
      hint: `OTE.Settings.${key}.hint`,
      scope: "world",
      config: true,
      type: Boolean,
      default: initial
    });
  }
}

/** Current optional-rule toggles as a plain object. */
export function getRules() {
  return Object.fromEntries(Object.keys(RULES).map(k => [k, game.settings.get(SYSTEM_ID, k)]));
}

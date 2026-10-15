/**
 * Over the Edge (2nd Edition) — Foundry VTT system entry point.
 *
 * Load order matters only in that every module imported here is self-contained:
 *   config → data models → documents → dice → sheets → hooks
 */
import { OTE, SYSTEM_ID } from "./config.mjs";
import { registerSettings } from "./settings.mjs";
import { bindChatListeners } from "./chat.mjs";

import { CharacterData, GMCData } from "./data/actor-models.mjs";
import { TraitData, WeaponData, ArmorData, GearData } from "./data/item-models.mjs";

import { OTEActor } from "./documents/actor.mjs";
import { OTEItem } from "./documents/item.mjs";
import { OTECombatant } from "./documents/combatant.mjs";

import { OTEActorSheet } from "./sheets/actor-sheet.mjs";
import { OTEItemSheet } from "./sheets/item-sheet.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialising Over the Edge`);
  CONFIG.OTE = OTE;

  // Documents & data models (v14: TypeDataModel is the only way to define system data).
  CONFIG.Actor.documentClass = OTEActor;
  CONFIG.Actor.dataModels = { character: CharacterData, gmc: GMCData };
  CONFIG.Actor.typeIcons = { character: "fa-solid fa-user", gmc: "fa-solid fa-user-secret" };

  CONFIG.Item.documentClass = OTEItem;
  CONFIG.Item.dataModels = { trait: TraitData, weapon: WeaponData, armor: ArmorData, gear: GearData };
  CONFIG.Item.typeIcons = { trait: "fa-solid fa-star", weapon: "fa-solid fa-khanda", armor: "fa-solid fa-shield", gear: "fa-solid fa-box" };

  // Initiative: the dice of the trait the character would use (see OTECombatant).
  CONFIG.Combatant.documentClass = OTECombatant;
  CONFIG.Combat.initiative = { formula: "2d6", decimals: 0 };

  registerSettings();

  // Sheets: replace the core sheets with ours.
  const { DocumentSheetConfig } = foundry.applications.apps;
  // Guarded: a missing legacy class must never be able to abort system initialisation.
  const dropCore = (documentClass, sheetClass) => {
    if (sheetClass) DocumentSheetConfig.unregisterSheet(documentClass, "core", sheetClass);
  };
  dropCore(Actor, foundry.appv1?.sheets?.ActorSheet);
  dropCore(Item, foundry.appv1?.sheets?.ItemSheet);
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, OTEActorSheet, {
    types: ["character", "gmc"], makeDefault: true, label: "OTE.Sheet.Actor"
  });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, OTEItemSheet, {
    types: ["trait", "weapon", "armor", "gear"], makeDefault: true, label: "OTE.Sheet.Item"
  });
});

Hooks.on("renderChatMessageHTML", bindChatListeners);

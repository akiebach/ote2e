import { rendered, queue } from "./compat-stubs.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
const P = new URL("../", import.meta.url).pathname, M = P + "module/";

const { CharacterData, GMCData } = await import(M + "data/actor-models.mjs");
const { TraitData, WeaponData, ArmorData, GearData } = await import(M + "data/item-models.mjs");
const { OTEActorSheet } = await import(M + "sheets/actor-sheet.mjs");
const { OTEItemSheet } = await import(M + "sheets/item-sheet.mjs");
const { OTEActor } = await import(M + "documents/actor.mjs");
const { promptRoll } = await import(M + "dice/dialogs.mjs");
const { evaluateRoll, postRollCard } = await import(M + "dice/roll.mjs");
const { computeDamage, postDamageCard } = await import(M + "dice/damage.mjs");

/* ---------- 1. schema paths vs every system.* reference in templates and code ---------- */
const flatten = (fields, pre = "") => Object.entries(fields).flatMap(([k, f]) =>
  f.fields ? [`${pre}${k}`, ...flatten(f.fields, `${pre}${k}.`)] : [`${pre}${k}`]);
const schemas = {
  character: new Set(flatten(CharacterData.defineSchema())), gmc: new Set(flatten(GMCData.defineSchema())),
  trait: new Set(flatten(TraitData.defineSchema())), weapon: new Set(flatten(WeaponData.defineSchema())),
  armor: new Set(flatten(ArmorData.defineSchema())), gear: new Set(flatten(GearData.defineSchema()))
};
const files = ["templates/actor/actor-sheet.hbs", "templates/item/item-sheet.hbs", "templates/dice/roll-dialog.hbs",
  "module/sheets/actor-sheet.mjs", "module/sheets/item-sheet.mjs", "module/documents/actor.mjs", "module/dice/dialogs.mjs",
  "module/dice/roll.mjs", "module/dice/damage.mjs", "module/chat.mjs", "module/documents/combatant.mjs"];
const actorPaths = new Set([...schemas.character, ...schemas.gmc]);
const itemPaths = new Set(Object.entries(schemas).filter(([k]) => !["character", "gmc"].includes(k)).flatMap(([, s]) => [...s]));
const derived = new Set(["status", "status.key", "status.messedUp", "status.down", "status.dead", "armorPenalty"]);
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(P + f, "utf8");
  for (const m of src.matchAll(/\bsystem\.([A-Za-z][A-Za-z0-9_.]*[A-Za-z0-9])/g)) {
    let path = m[1];
    if (/^(hp|psychic|xp)\.(value|max)$/.test(path) || actorPaths.has(path) || itemPaths.has(path) || derived.has(path)) continue;
    // allow prefixes of real paths (e.g. "system.hp" in hasProperty)
    if ([...actorPaths, ...itemPaths].some(p => p.startsWith(path + "."))) continue;
    bad.push(`${f}: system.${path}`);
  }
}
assert.deepEqual(bad, [], "Unknown system paths:\n" + bad.join("\n"));
console.log(`✓ every system.* path (${files.length} files) exists in a data model`);

/* ---------- 2. data-action / data-ote-action wiring ---------- */
const actorTpl = fs.readFileSync(P + "templates/actor/actor-sheet.hbs", "utf8") + fs.readFileSync(P + "templates/item/item-sheet.hbs", "utf8");
const used = new Set([...actorTpl.matchAll(/data-action="([A-Za-z]+)"/g)].map(m => m[1]));
const reg = new Set([...Object.keys(OTEActorSheet.DEFAULT_OPTIONS.actions), ...Object.keys(OTEItemSheet.DEFAULT_OPTIONS.actions)]);
assert.deepEqual([...used].filter(a => !reg.has(a)), [], "template actions with no handler");
for (const [k, fn] of [...Object.entries(OTEActorSheet.DEFAULT_OPTIONS.actions), ...Object.entries(OTEItemSheet.DEFAULT_OPTIONS.actions)])
  assert.equal(typeof fn, "function", `action ${k} is not a function`);
const chatTpl = fs.readFileSync(P + "templates/chat/roll-card.hbs", "utf8") + fs.readFileSync(P + "templates/chat/damage-card.hbs", "utf8");
const chatSrc = fs.readFileSync(M + "chat.mjs", "utf8");
for (const a of new Set([...chatTpl.matchAll(/data-ote-action="([A-Za-z]+)"/g)].map(m => m[1])))
  assert.ok(chatSrc.includes(`"${a}"`), `chat action ${a} unhandled`);
console.log(`✓ ${used.size} sheet actions + chat actions all have handlers; unused handlers: ${[...reg].filter(a => !used.has(a)).join(", ") || "none"}`);

/* ---------- 2b. reserved ApplicationV2 action names must never be used for custom actions ----------
   ApplicationV2 dispatches these itself, so a handler registered under the same name is never called
   (this is the bug that made the Background & Notes tab button do nothing). */
const RESERVED = ["close", "tab", "toggleControls"];
const allTemplates = fs.readdirSync(P + "templates", { recursive: true }).filter(f => f.endsWith(".hbs"));
for (const f of allTemplates) {
  const src = fs.readFileSync(P + "templates/" + f, "utf8");
  for (const m of src.matchAll(/data-action="([A-Za-z]+)"/g))
    assert.ok(!RESERVED.includes(m[1]), `${f}: data-action="${m[1]}" is reserved by ApplicationV2`);
}
for (const k of [...Object.keys(OTEActorSheet.DEFAULT_OPTIONS.actions), ...Object.keys(OTEItemSheet.DEFAULT_OPTIONS.actions)])
  assert.ok(!RESERVED.includes(k), `action "${k}" shadows a reserved ApplicationV2 action`);
console.log(`✓ no template or handler uses a reserved ApplicationV2 action name (${RESERVED.join(", ")})`);

/* ---------- 3. render every template in STRICT mode via the real context builders ---------- */
const mkItem = (id, type, name, system, sort = 0) => ({ id, type, name, sort, system: { description: "", ...system }, img: "i.png" });
const items = [
  mkItem("t1", "trait", "Mythology", { kind: "central", dice: 4, superior: true, fringe: false, sign: "Sanskrit ring" }),
  mkItem("t2", "trait", "Manipulation", { kind: "side", dice: 3, superior: false, fringe: false, sign: "" }),
  mkItem("t3", "trait", "Ch'i Strike", { kind: "developed", dice: 1, superior: false, fringe: true, sign: "Calm" }),
  mkItem("t4", "trait", "Losing grip", { kind: "flaw", dice: 0, superior: false, fringe: false, sign: "Mutters prayers" }),
  mkItem("w1", "weapon", "Knife", { damageFactor: 2, attackType: "normal", equipped: true }),
  mkItem("a1", "armor", "Duro-Trench", { rating: 2, unit: "dice", bulletproof: 0, penalty: true, equipped: true }),
  mkItem("a2", "armor", "Kevlar", { rating: 1, unit: "points", bulletproof: 1, penalty: false, equipped: false }),
  mkItem("g1", "gear", "Tarot cards", { quantity: 1 })
];
const baseSys = { concept: "c", physicalDescription: "p", personalDescription: "q", wounds: "w", finances: "$", motivation: "m", secret: "s",
  importantPerson: "i", background: "b", hp: { value: 10, max: 22, base: null, stun: 3 }, psychic: { label: "", value: 2, max: 3 },
  xp: { value: 1, max: 1 }, initiative: { dice: 2 }, naturalArmor: { rating: 0, unit: "points" },
  status: { key: "messedUp", messedUp: true, down: false, dead: false }, armorPenalty: 2 };
const mkActor = type => ({ type, name: "Arthur", img: "a.png", items, isGMC: type === "gmc",
  system: type === "gmc" ? { ...baseSys, role: "Cranky cop", connections: "x", attack: { dice: 3, factor: 2 }, defense: { dice: 3 } } : { ...baseSys, player: "Jon" } });

for (const type of ["character", "gmc"]) {
  const actor = mkActor(type);
  for (const tab of ["sheet", "notes"]) {
    const fake = { document: actor, tab, isEditable: true };
    const ctx = await OTEActorSheet.prototype._prepareContext.call(fake, {});
    const hbs = (await import("handlebars")).default.compile(fs.readFileSync(P + "templates/actor/actor-sheet.hbs", "utf8"), { strict: true });
    const html = hbs(ctx);
    assert.ok(html.length > 500);
    if (tab === "sheet") { assert.ok(html.includes('data-item-id="t1"') && html.includes("Duro-Trench") && html.includes("Mutters prayers")); }
    if (type === "gmc" && tab === "sheet") assert.ok(html.includes("system.attack.dice") && !html.includes("atlas-games-logo"));
    if (type === "character" && tab === "sheet") assert.ok(html.includes("atlas-games-logo") && html.includes("system.player"));
  }
}
console.log("✓ actor sheet renders (strict) for character/gmc × sheet/notes, from the real _prepareContext");

{ // Tab buttons: click handler -> instance state -> re-render shows the other tab
  const hbs = (await import("handlebars")).default.compile(fs.readFileSync(P + "templates/actor/actor-sheet.hbs", "utf8"), { strict: true });
  let rerenders = 0;
  const sheet = { document: mkActor("character"), tab: "sheet", isEditable: true, render: async () => { rerenders++; } };
  const showTab = OTEActorSheet.DEFAULT_OPTIONS.actions.showTab;
  assert.equal(typeof showTab, "function");
  const page = async () => hbs(await OTEActorSheet.prototype._prepareContext.call(sheet, {}));
  assert.ok((await page()).includes("system.hp.value") && !(await page()).includes("system.motivation"));
  await showTab.call(sheet, {}, { dataset: { tab: "notes" } });
  assert.equal(sheet.tab, "notes"); assert.equal(rerenders, 1);
  assert.ok((await page()).includes("system.motivation") && !(await page()).includes("system.hp.value"));
  await showTab.call(sheet, {}, { dataset: { tab: "sheet" } });
  assert.ok((await page()).includes("system.hp.value"));
  console.log("✓ tab buttons: handler switches state, re-renders, and each tab shows the right content");
}

for (const t of ["trait", "weapon", "armor", "gear"]) {
  const doc = items.find(i => i.type === t);
  const ctx = await OTEItemSheet.prototype._prepareContext.call({ document: doc, isEditable: true }, {});
  const hbs = (await import("handlebars")).default.compile(fs.readFileSync(P + "templates/item/item-sheet.hbs", "utf8"), { strict: true });
  assert.ok(hbs(ctx).includes("system.description"));
}
console.log("✓ item sheet renders (strict) for trait / weapon / armor / gear");

/* roll dialog: weapon attack (with trait select), defense, and a fringe trait */
const { isGMC, ...pcData } = mkActor("character");   // isGMC is a getter on the real class
const pc = Object.assign(Object.create(OTEActor.prototype), pcData);
globalThis.__dialogAnswer = { trait: "t2", dice: 3, bonus: 1, penalty: 2, extraActions: 0, xpSpent: 1, xpReason: "Used to this", rollMode: "publicroll", factor: 2, attackType: "normal", special: "on", divisor: 1 };
let opts = await promptRoll(pc, { title: "t", label: "Attack: Knife", dice: 2, traits: pc.actionTraits, agility: true, attack: { name: "Knife", factor: 2, attackType: "normal" } });
assert.equal(opts.label, "Attack: Knife — Manipulation"); assert.equal(opts.bonus, 2); assert.equal(opts.xpSpent, 1); assert.equal(opts.attack.special, true);
assert.ok(rendered["systems/over-the-edge/templates/dice/roll-dialog.hbs"].includes('name="factor"'));
globalThis.__dialogAnswer = { dice: 3, bonus: 0, penalty: 0, extraActions: 2, xpSpent: 0, rollMode: "publicroll", difficultyMode: "dice", difficultyValue: 2, hideOpposition: true, push: "on" };
opts = await promptRoll(pc, { title: "t", label: "Ch'i", dice: 1, fringe: true });
assert.deepEqual([opts.dice, opts.penalty, opts.push, opts.shotsSpent], [2, 1, true, 2]);
console.log("✓ roll dialog renders (strict) and parses answers (extra actions, push, trait label)");

/* chat cards */
queue.push(4, 5, 6, 2, 3);
let res = await evaluateRoll({ ...opts, difficulty: { mode: "dice", value: 2 }, hideOpposition: true });
let msg = await postRollCard(pc, { ...opts, attack: { name: "Knife", factor: 2, attackType: "normal", special: false, divisor: 1 } }, res);
assert.ok(msg.content.includes("data-ote-action=\"resolveAttack\"")); assert.equal(msg.flags["over-the-edge"].attack.factor, 2);
const defRes = await evaluateRoll({ dice: 2 });
const dmg = await computeDamage({ attackTotal: 12, attackBotch: false, defenseTotal: 5, defenseBotch: false, factor: 2, attackType: "bullet", special: false, divisor: 1, armor: { points: 1, dice: 1, bpDice: 1 } });
const tokenless = { name: "Zipper", uuid: "Actor.z" };
msg = await postDamageCard({ attacker: pc, targetActor: tokenless, targetToken: null, weaponName: "Knife", attackResult: { botch: false }, defenseResult: defRes, dmg });
assert.ok(msg.content.includes("applyDamage") || dmg.damage === 0);
const miss = await computeDamage({ attackTotal: 2, attackBotch: false, defenseTotal: 5, defenseBotch: false, factor: 2, attackType: "normal", armor: { points: 0, dice: 0, bpDice: 0 } });
msg = await postDamageCard({ attacker: pc, targetActor: tokenless, targetToken: null, weaponName: "", attackResult: { botch: false }, defenseResult: defRes, dmg: miss });
console.log("✓ roll card + damage card render (strict): hit, armored hit, and miss");
console.log("\nALL COMPATIBILITY CHECKS PASSED");

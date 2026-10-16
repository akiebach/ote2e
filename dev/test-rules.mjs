import "./rules-stubs.mjs";
import { queue, setRule } from "./rules-stubs.mjs";
import assert from "node:assert/strict";
const P = new URL("../module", import.meta.url).pathname;

// 1. Every module must load (catches bad imports, missing exports, private-member typos).
for (const f of ["config","settings","data/actor-models","data/item-models","documents/actor","documents/item",
  "documents/combatant","dice/roll","dice/dialogs","dice/damage","chat","sheets/common","sheets/actor-sheet","sheets/item-sheet","ote"])
  await import(`${P}/${f}.mjs`);
console.log("✓ all 15 modules import");

const { buildFormula, applyExtraActions, evaluateRoll, compare } = await import(`${P}/dice/roll.mjs`);
const { computeDamage } = await import(`${P}/dice/damage.mjs`);
const { OTEActor } = await import(`${P}/documents/actor.mjs`);
const { OTEItem } = await import(`${P}/documents/item.mjs`);

// 2. Formulas
const t = (o, e) => assert.equal(buildFormula(o), e);
t({ dice: 3 }, "3d6");
t({ dice: 3, bonus: 1 }, "4d6kh3");
t({ dice: 3, penalty: 1 }, "4d6kl3");
t({ dice: 3, bonus: 1, penalty: 1 }, "3d6");            // cancel
t({ dice: 2, bonus: 3, penalty: 1 }, "4d6kh2");
t({ dice: 2, push: true }, "4d6kh2");
t({ dice: 2, push: true, bonus: 1 }, "5d6kh2");
t({ dice: 2, push: true, penalty: 1 }, "5d6dh1kh2");
t({ dice: 0 }, "1d6");                                    // clamped
assert.deepEqual(applyExtraActions({ dice: 3, extraActions: 1 }), { dice: 3, penalty: 1 });
assert.deepEqual(applyExtraActions({ dice: 3, extraActions: 3 }), { dice: 1, penalty: 1 });
console.log("✓ formulas");

// 3. Rulebook examples: botch with penalty die (5,1,1,1 → kept 1,1,1 = 3, a botch)
queue.push(5, 1, 1, 1);
let r = await evaluateRoll({ dice: 3, penalty: 1, difficulty: { mode: "fixed", value: 2 } });
assert.equal(r.total, 3); assert.equal(r.botch, true); assert.equal(r.outcome, "failure");
console.log("✓ rulebook botch example (3 total, still fails vs 2)");
// bonus die: roll 4 take best 3
queue.push(2, 6, 5, 1); r = await evaluateRoll({ dice: 3, bonus: 1 }); assert.equal(r.total, 13); assert.equal(r.faces.filter(f => !f.kept).length, 1);
// penalty die: drop the highest
queue.push(2, 6, 5, 1); r = await evaluateRoll({ dice: 3, penalty: 1 }); assert.equal(r.total, 8);
// push: 4d6 keep best 2
queue.push(1, 6, 2, 5); r = await evaluateRoll({ dice: 2, push: true }); assert.equal(r.total, 11);
// blowing the top off
setRule("blowTheTop", true); queue.push(6, 6, 6, 4); r = await evaluateRoll({ dice: 2 }); assert.equal(r.total, 22); assert.equal(r.toppedOff, true);
setRule("blowTheTop", false);
// compare
assert.deepEqual(compare(10, 7), { outcome: "success", margin: 3 });
assert.deepEqual(compare(7, 7), { outcome: "stalemate", margin: 0 });
console.log("✓ bonus/penalty/push/top-off/compare");

// 4. Damage: the Easy Gunfire Example (Ch.1, pp.31-33)
const noArmor = { points: 0, dice: 0, bpDice: 0 };
const dmg = async (o) => computeDamage({ attackBotch: false, defenseBotch: false, special: false, divisor: 1, ...o });
queue.push(3);   // reinforced jacket: 1 die, rolls 3 → halved vs bullet = 1
let d = await dmg({ attackTotal: 16, defenseTotal: 6, factor: 3, attackType: "bullet", armor: { points: 0, dice: 1, bpDice: 0 } });
assert.equal(d.damage, 29); console.log("✓ Arthur shot: 30 − 1 = 29");
queue.push(4);   // kevlar vest 1b rolls 4 → 6 / 4 = 1.5 → 2
d = await dmg({ attackTotal: 17, defenseTotal: 15, factor: 3, attackType: "bullet", armor: { points: 0, dice: 0, bpDice: 1 } });
assert.equal(d.damage, 2); console.log("✓ Samantha shot: 6 ÷ 4 → 2");
queue.push(3);   // hollow point vs jacket: 50, minus double the roll (6) = 44
d = await dmg({ attackTotal: 16, defenseTotal: 6, factor: 3, attackType: "hollowPoint", armor: { points: 0, dice: 1, bpDice: 0 } });
assert.equal(d.damage, 44); console.log("✓ hollow point vs jacket: 50 − 6 = 44");
queue.push(4);   // hollow point vs kevlar: 10 ÷ (2×4) = 1.25 → 1
d = await dmg({ attackTotal: 17, defenseTotal: 15, factor: 3, attackType: "hollowPoint", armor: { points: 0, dice: 0, bpDice: 1 } });
assert.equal(d.damage, 1); console.log("✓ hollow point vs kevlar: 10 ÷ 8 → 1");
queue.push(3);   // Peace Officer vs .38 (X4): margin 4 → 16, uniform rolls 3 → halved → 1 → 15
d = await dmg({ attackTotal: 11, defenseTotal: 7, factor: 4, attackType: "bullet", armor: { points: 0, dice: 1, bpDice: 0 } });
assert.equal(d.damage, 15); console.log("✓ Peace Officer shot: 16 − 1 = 15");

d = await dmg({ attackTotal: 5, defenseTotal: 9, factor: 3, attackType: "normal", armor: noArmor }); assert.equal(d.hit, false);
d = await dmg({ attackTotal: 12, defenseTotal: 5, factor: 2, attackType: "normal", special: true, armor: noArmor }); assert.equal(d.damage, 7); assert.equal(d.raw, 14); // 14 → half
d = await dmg({ attackTotal: 12, defenseTotal: 2, factor: 10, attackType: "bullet", divisor: 3, armor: noArmor }); assert.equal(d.damage, 33); assert.equal(d.raw, 100); // shotgun 100/3
d = await dmg({ attackTotal: 9, defenseTotal: 5, factor: 5, attackType: "taser", armor: { points: 5, dice: 0, bpDice: 0 } }); assert.equal(d.blocked, true); // protection 5 ≥ margin 4
d = await dmg({ attackTotal: 9, defenseTotal: 5, factor: 5, attackType: "taser", armor: { points: 1, dice: 0, bpDice: 0 } }); assert.equal(d.damage, 20); assert.equal(d.stun, true);
d = await dmg({ attackTotal: 20, defenseTotal: 10, factor: 3, attackType: "armorPiercing", armor: { points: 1, dice: 0, bpDice: 1 } }); assert.equal(d.damage, 14); assert.equal(d.rolls.length, 0); // (30−2)/2, uses dice counts not rollsd = await dmg({ attackTotal: 0, attackBotch: true, defenseTotal: 1, factor: 3, attackType: "normal", armor: noArmor }); assert.equal(d.hit, false);
console.log("✓ miss / special effect / shotgun / taser / armor-piercing / botch");

// 5. Recovery (Ch.1 conventions) — drive OTEActor methods against a fake actor
const mk = hp => { const a = Object.create(OTEActor.prototype); a.updates = []; a.update = async u => { a.updates.push(u); for (const [k, v] of Object.entries(u)) a.system.hp[k.split(".").pop()] = v; };
  a.system = { hp: { value: 22, max: 22, base: null, stun: 0, ...hp }, naturalArmor: { rating: 0, unit: "points" } }; return a; };
let a = mk({ value: 12 });                         assert.equal(await a.recover(), 17);
a.system.hp.value = 7;                             assert.equal(await a.recover(), 12);          // halfway between 7 and 17, not 22
a = mk({ max: 21, value: 21 }); a.system.hp.value = 14; assert.equal(await a.recover(), 18);   // 7 down → 3.5 → rounds up to 18? (21-7 → up)
a = mk({ max: 22, value: 15 }); await a.recover(); a.system.hp.value = a.system.hp.value - 7; await a.recover();
assert.equal(22 - a.system.hp.value, 6); console.log("✓ recovery: 7+7 wounds leave you 6 down");
a = mk({ max: 22, value: 8 });                     await a.recover(); assert.equal(22 - a.system.hp.value, 7); console.log("✓ recovery: one 14-pt wound leaves you 7 down");
a = mk({ value: 12, stun: 5 });                    assert.equal(await a.recover(), Math.ceil((17 + 22) / 2)); console.log("✓ stun damage returns before the halfway step");
// Healing: rest = 1/day mobile; medical = 2/day; bedridden rest = 1 per 2 days
a = mk({ value: 10 }); assert.equal(await a.heal({ care: "medical", days: 3 }), 6);
a = mk({ value: 0 });  assert.equal(await a.heal({ care: "rest", days: 5 }), 2);
a = mk({ value: -3 }); assert.equal(await a.heal({ care: "medical", days: 4, critical: true }), 2);
console.log("✓ long-term healing table");

// 6. Armor aggregation
const arm = (items, nat) => { const x = Object.create(OTEActor.prototype); x.items = items; x.system = { naturalArmor: nat ?? { rating: 0, unit: "points" } }; return x.getArmor(); };
assert.deepEqual(arm([{ type: "armor", system: { equipped: true, rating: 1, unit: "points", bulletproof: 1 } },
                       { type: "armor", system: { equipped: true, rating: 2, unit: "dice", bulletproof: 0 } },
                       { type: "armor", system: { equipped: false, rating: 9, unit: "dice", bulletproof: 9 } }], { rating: 1, unit: "points" }),
  { points: 2, dice: 2, bpDice: 1 });
assert.equal(OTEItem.ruleDice("standard", true), 4); assert.equal(OTEItem.ruleDice("technical", false), 1); assert.equal(OTEItem.ruleDice("narrow", true), 6);
console.log("✓ armor aggregation & rule-chart dice");
console.log("\nALL CHECKS PASSED");

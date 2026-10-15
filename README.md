# Over the Edge (2nd Edition) — Foundry VTT system

Unofficial fan implementation of *Over the Edge*, 2nd Edition (Atlas Games) for **Foundry VTT v14**.
You need your own copy of the rulebook; this system contains mechanics, not the book's text.

## Install
Copy this folder to `<FoundryData>/Data/systems/over-the-edge/` (the folder name must match `id` in
`system.json`), restart Foundry, and create a World using "Over the Edge (2nd Edition)".

## What's in it

**Sheet** — the *Character Sheet* tab reproduces the printed sheet box-for-box (same proportions, labels,
masthead). Everything is sized in container-query units, so it scales with the window. A second tab,
*Background & Notes*, holds the creation prompts (concept, motivation, secret, important person), natural
armor, initiative dice and the pool's name. GMCs use the same sheet; the Atlas logo is replaced by an
Attack/Defense stat-block box and "Player Name" becomes "Identifying Phrase".

**Actors:** `character`, `gmc`. **Items:** `trait` (central / side / developed / flaw), `weapon`, `armor`, `gear`.
Drag items from the sidebar onto a sheet.

**Dice (Chapter 1)** — click a trait's die icon, a weapon's crosshair, or a toolbar button:
- score = dice rolled; **bonus die** = extra die, drop lowest; **penalty die** = extra die, drop highest; they cancel
- experience dice (as bonus dice, with the required justification), multiple-actions penalty, fixed or dice difficulty
- fringe powers spend psychic-pool shots; "push" costs 2 shots (twice the dice, keep the better half)
- Hand of Fate (2 dice), initiative (trait dice), defense
- optional rules as world settings: **botches**, **blowing the top off**, **unstoppable six**, multiple experience dice
- automatic penalty die while "messed up" (≤ half HP) and for heavy/stacked armor on agility actions

**Combat** — an attack card has *Resolve vs. target*: target a token, the defender rolls, and the Armor/Attack
matrix is applied (normal, bullet, armor-piercing, hollow-point, taser; special-effect = half; shotgun divisor).
The damage card has an *Apply* button. HP tracks the rules directly: recovery is halfway back to the level
reached after the last recovery (rounds up; Shift-click for a different fraction), stun damage returns in full,
the Long-Term Healing table is built in, and 0 / −max set the Unconscious / Dead status effects.

## Judgement calls (the book contradicts itself in places)
- **Regular armor vs bullets** is halved (rule text). The worked example for Military Body Armor subtracts the full 3.
- **Armor-piercing**: subtract armor *rating*, then halve (rule text). The worked examples skip the halving.
- **Botch** is judged on the *kept* dice (matches the 5,1,1,1 penalty-die example). **Unstoppable six** counts kept dice.
- A roll never uses fewer than 1 die. Experience dice are limited to one per roll unless the setting is on.
- "Critical" healing is a checkbox because the book makes it the GM's option.

## Not built yet (suggested next phases)
Compendium packs (Gun Metal weapons/armor, sample GMCs), spells as an item type, a ranged-defense-dice calculator
(distance/cover/dodging table), a "spend experience to improve a trait" workflow, drag-out of items to the hotbar,
other languages.

## Assets & IP
`assets/ote-header.png` and `assets/atlas-games-logo.png` were extracted from the official printed character sheet
so the sheet matches it. They are trademarks/artwork of Atlas Games / John Nephew: fine for private use,
**remove them before publicly distributing** (the sheet degrades gracefully to blank space).

## Development
`dev/` is not loaded by Foundry. It lets you check changes without launching it:
```
cd dev && npm install && npm test
```
`test-rules.mjs` runs the dice/damage/recovery logic against the rulebook's worked examples.
`test-compat.mjs` checks schema paths, `data-action` wiring, and renders every template in strict mode
through the real `_prepareContext` / dialog / chat-card code.

## Verification status
Built against the v14 API (TypeDataModels, ApplicationV2 sheets, no `template.json`). Verified offline as above and
by rendering the sheet in Chromium; **not yet run inside a live Foundry v14 session.** If something misbehaves
on first launch, the places most worth checking are listed at the top of each file's doc comment:
`sheets/actor-sheet.mjs` (drag-drop options), `dice/dialogs.mjs` (DialogV2 `render` callback),
`documents/actor.mjs` (`toggleStatusEffect`), `documents/combatant.mjs` (`_getInitiativeFormula`).

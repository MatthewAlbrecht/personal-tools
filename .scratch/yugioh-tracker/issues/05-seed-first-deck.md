# 05: Seed my first Deck

**What to build:** An agent takes my card list (names, set codes, rarities, Overloaded info, copies, Sections) and loads it into the app through internal Convex functions, so my first Deck is ready without typing.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** ready-for-human (the Chaos Lightsworn Deck is seeded on dev; the prod load waits on Matt)

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Internal (not public) Convex functions exist for loading a Deck
- [x] Agent asks me for the list and confirms anything ambiguous before writing
- [x] Loaded Deck matches the list: Cards, Candidates, copies, Sections (dev)
- [ ] Running it against prod is confirmed with me first

**Left for you:** "Running it against prod is confirmed with me first". The payload is `/tmp/yugioh-seed/chaos-lightsworn.json` (60 Cards, 66 Candidates); load it into prod with `docs/yugioh/seeding.md` after deploying. `/tmp` doesn't survive a reboot, so copy it somewhere safe first.

**Cleanup check (2026-10-20):** the dev Deck "Chaos Lightsworn" matches the payload Card for Card: names, Sections, Copies needed and Candidates. One cosmetic difference: `normalizeRarity` title-cases unknown rarities word by word, so "Secret Rare (Pharaoh's Rare)" and "Ultra Rare (Pharaoh's Rare)" (MAMA-EN108, MAMA-EN110) are saved as "… (pharaoh's Rare)". Prod would get the same spelling. Left as is.

## Notes from the build

**Convex**
- `internal.yugioh.seed.loadDeck` (`convex/yugioh/seed.ts`): one internal mutation. Args: `{ name, cards: [{ cardName, section, copiesNeeded, copiesOwned?, lowestAcceptableCondition?, candidates: [{ setCode, rarity, overloadedRarities }] }], removeUnlisted? }`. It returns a report: `deckId`, `deckCreated`, `cardsAdded`, `cardsChanged`, `candidatesAdded`, `cardsRemoved`, `candidatesRemoved`, `unlistedCards`, `unlistedCandidates`.
- Run it with `npx convex run [--push] yugioh/seed:loadDeck "$(cat file.json)"`. `convex run` has no file flag.
- Logic: `loadDeck` in `convex/model/yugioh/seed.ts`, built on the ticket 01 model functions (`addCard`, `updateCard`, `findOrCreatePrinting`, `addCandidatePrinting`, `removeCard`).
- `decks.ts` now exports `nameKey`, `listDeckCards` and `listCandidates`.
- **Schema:** `yugiohDecks` gained index `by_name`.

**Load semantics (decisions)**
- The Deck is upserted by **exact** cleaned name. Two Decks with that name is an error; dev has three "Agent test Deck"s.
- Cards match by name + Section (case- and space-insensitive). A listed Card whose name matches a leftover saved Card in another Section is **moved** with `updateCard`, which keeps its id, Copies owned and Chosen Printing.
- An omitted `copiesOwned` or `lowestAcceptableCondition` keeps the saved value, so the app's edits survive re-runs. When a field is given, it overwrites.
- Cards and Candidates the Deck has but the list lacks are **reported, not removed**, unless `removeUnlisted: true`. With that flag, unlisted Candidates are deleted before listed ones are added, so a full Card (10) can swap all of them. A Chosen Printing that's removed resets to undecided.
- New Printings take the saved Card's name, not the list's spelling.
- The load is all-or-nothing:
  - The list is checked before any write: a Card twice in one Section, no Candidates, more than 10 Candidates, more than 150 Cards.
  - Model errors (a set code + rarity saved under another Card name, copies out of range) roll the whole load back.
- It never sets a Chosen Printing or Custom order, and it doesn't map list order to positions.

**Tests**: `convex/yugioh/seed.test.ts`, 16 tests at Seam 1. They cover the first load, an identical re-run as a no-op, updates and additions, preserved app edits, a Section move, the copies clamp, unlisted reporting and removal, swapping 10 Candidates, shared Printings and Overloaded merging, rejected lists writing nothing, and the internal-only check.

**Runbook**: `docs/yugioh/seeding.md` covers a pasted list or `.ydk`, resolved through the YGOPRODeck `cardinfo.php` `id=`/`name=` lookups. It then has Matt confirm the ambiguities, loads into dev, checks the result with `getDeck`, and loads into prod only after an explicit yes.

**Verified**: pushed to dev with `npx convex dev --once`. The CLI call was smoke-tested on dev with a payload that gets rejected, so nothing was written. No Deck was seeded.


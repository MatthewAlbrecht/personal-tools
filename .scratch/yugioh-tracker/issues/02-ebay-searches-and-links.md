# 02: eBay Searches and links

**What to build:** Each Deck shows its eBay Searches: Printings packed into groups of up to about 8 set codes, Printings needing the same Exclusions grouped together, Exclusions derived automatically from Overloaded rarities. Each Search has a Newly Listed link and a Sold link.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] No Search exceeds 8 set codes
- [x] Exclusions (e.g. -super, -ultra) only apply to Searches containing an Overloaded set code that needs them
- [x] Newly Listed link sorts by newest; Sold link includes sold and completed filters
- [x] Un-chosen Candidates drop out of Searches once a Chosen Printing is set
- [x] Searches update when Cards or Printings change
- [x] Tested through Convex views (Seam 1), with packing logic in the shared library module

## Notes from the build

**Domain library**: `src/lib/yugioh/searches.ts` (relative imports only).
- `buildDeckSearches(cards)` takes the Deck's Cards (`{ cardName, chosenPrintingId, candidates[] }`, which is what `readDeck` returns per Card) and returns `Search[]`: `{ setCodes, exclusions, printings: [{ cardName, setCode, rarity }], newlyListedUrl, soldUrl }`.
- `searchKeywords`, `ebayNewlyListedUrl`, `ebaySoldUrl`, `exclusionWord` and `MAX_SET_CODES_PER_SEARCH` (8) are exported. Ticket 15's automated browser can visit `newlyListedUrl` and `soldUrl` directly.
- Packing:
  - A Card with a Chosen Printing searches only that Printing; an undecided Card searches every Candidate.
  - ~~Set codes are grouped by identical Exclusion sets, then split into even chunks of ≤ 8; fewest Exclusions first.~~ Superseded: set codes share a Search when the union of their Exclusions drops none of its Printings (no word of a wanted rarity or Card name), packed first-fit with the most Exclusions first, ≤ 8 per Search. The Chaos Lightsworn seed went from 7 Searches to 5.
  - Set codes inside a Search are sorted.
  - The same Printing on two Cards is searched once.
- Exclusions:
  - For an Overloaded set code, each other rarity contributes its first word ("Super Rare" → `super`, "Collector's Rare" → `collector`).
  - **Decision:** a word is dropped if any wanted rarity **or Card name** under that code contains it. Excluding `-secret` would drop Quarter Century Secret Rare, and `-super` would drop Super Polymerization. As a result, a wanted QCSR can never exclude Secret Rare, and plain "Rare" is never excluded, so those Searches stay a bit noisy.
  - Overloaded rarities come from the shared Printing, so rarities learned in another Deck apply here too.
- Keywords: `(A,B) -super -ultra`. A single set code goes bare, without brackets.
- URLs:
  - Newly Listed: `https://www.ebay.com/sch/i.html?_nkw=…&_sop=10`.
  - Sold: `…&LH_Sold=1&LH_Complete=1&_sop=13`.
  - No `_sacat` and no location filter. The `_sop` values are the reference doc's assumptions and haven't been checked against a live eBay page.

**Convex**
- `api.yugioh.searches.listSearches({ deckId })` returns `Search[]`, or null for a missing Deck (`convex/yugioh/searches.ts`).
- The logic is `readSearches` in `convex/model/yugioh/searches.ts`. It reuses `readDeck`, so it inherits that function's bounds and indexes.
- Tests: `convex/yugioh/searches.test.ts` (Seam 1) and `src/lib/yugioh/searches.test.ts` (the word map).

**UI**
- `decks/[deckId]/layout.tsx` renders `DeckShell` (`_components/deck-shell.tsx`): the back link, the Deck name, and sticky line-variant `Tabs` whose triggers are `next/link`s, with the active tab taken from the pathname. The Deck name and the missing-Deck state moved there out of `DeckPage`, so `DeckPage` now returns null for a missing Deck.
- **Listings is not a tab yet.** Ticket 06 adds `{ value: "listings", label: "Listings", path: "/listings" }` to `TABS` in `deck-shell.tsx`, in the middle position.
- `src/app/yugioh/decks/error.tsx` catches errors thrown by the layout, such as a malformed Deck ID. `[deckId]/error.tsx` only wraps the pages.
- `/searches` (`_components/searches-page.tsx`): one `Card` per Search with mono outline set-code Badges (`title` = Card name and rarity), "Leaves out" plus secondary `−word` Badges, and Newly listed / Sold link Buttons (new tab, 44px tall on mobile). Ticket 03 adds the TCGplayer list and the "need a TCGplayer link" callout here. Type: `EbaySearch` in `_utils/types.ts`.
- Checked in light and dark, desktop and iPhone viewports.

**Open review notes (judgement calls, left as is)**
- `searchValidator` repeats the lib's `Search` type. tsc checks that they match through the `returns` validator.
- No shared `deckPath()` helper, and test fixtures are duplicated between `decks.test.ts` and `searches.test.ts`.
- The section-heading style renders "eBay Searches" as "EBAY SEARCHES".
- The set-code tooltip isn't reachable on touch.

**Dev data**: added "Agent test Called by the Grave" (RA01-EN060, Overloaded Super/Ultra) to the first "Agent test Deck" in the dev deployment.

# 04: Custom card order

**What to build:** On a Deck I can toggle between 'by cost' and 'custom' ordering, and in custom mode drag Cards to reorder them within a Section.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Toggle persists per Deck
- [x] Drag reorders within a Section only
- [x] Order survives reload
- [x] Default 'by cost' order puts unfinished Cards first (by remaining cost once prices exist; by name until then)

## Notes from the build

**Data model** (`convex/schema.ts`)
- `yugiohDecks.cardOrder`: optional `"byCost" | "custom"` (`yugiohCardOrderValidator`, lib type `CardOrder` / `CARD_ORDERS` in `src/lib/yugioh/deck.ts`). Missing reads as `"byCost"`.
- `yugiohDeckCards.position`: optional number, the Card's place within its Section in Custom order. It's missing until a Section is first reordered. A Card added to a Section that already has positions, or moved into one (an `updateCard` Section change), gets max + 1, so it goes last. In a Section with no positions yet, it takes its By cost place.

**Convex**
- `api.yugioh.decks.setCardOrder({ deckId, cardOrder })` and `api.yugioh.decks.moveCard({ deckCardId, toIndex })`. `moveCard` clamps `toIndex` to the Card's own Section, rejects a non-integer, and rewrites every position in that Section (patching only those that changed). A Card can never leave its Section through a move.
- `getDeck` now returns `cardOrder`. `readDeck` and `moveCard` both order Cards through one private function, `orderCards(cards, cardOrder)` in `convex/model/yugioh/decks.ts`. It works on the Card docs, before they become views. **Ticket 10:** change the By cost comparator there, by passing a compare to `groupCardsBySection`, so the screen and `moveCard` keep agreeing.
- In Custom order, Cards with a position come first; Cards without one follow in their By cost order (`customOrder` in the lib). Switching back to By cost keeps the positions for next time.
- **Decision (assumption):** in Custom order, finished Cards stay where you put them, still dimmed. Only By cost moves them to the bottom.

**Lib**
- `src/lib/yugioh/deck.ts`: `customOrder(sections, positionOf)` and `moveToIndex(cards, id, toIndex)`. The server and the optimistic update share `moveToIndex`.
- `src/lib/yugioh/drag-reorder.ts`: `dragTarget(rows, fromIndex, offset)` is the drop-slot maths. The offset is clamped to the list, and the leading edge passing a neighbour's middle swaps them, so the ends are reachable.

**UI**
- `card-order-toggle.tsx`: base-vega `ToggleGroup` (By cost · Custom) inside a one-field TanStack form (`cardOrderSchema`). The optimistic update (`applyCardOrder`) flips the toggle at once; rows re-sort when the server answers.
- `sortable-card-list.tsx` is used for each Section in Custom order. Each row gets a 44px grip handle at its left, a sibling of the row link, so the row still opens the Card drawer.
  - **Drag:** pointer events on the handle with `touch-action: none` and pointer capture. No drag library. The row tracks the pointer 1:1 through direct `style.transform` writes, with no React state per move. Siblings shift in 150 ms, the dropped row settles with a FLIP after `flushSync`, and the page auto-scrolls near the screen edges. Under reduced motion, nothing transitions.
  - **Tap, Enter or Space** on the handle opens a `DropdownMenu`: Move up / down / to top / to bottom. Each move is announced in a polite live region, and focus returns to the moved Card's handle.
  - Optimistic `applyCardMove` lives in `_utils/optimistic.ts`.
- `CardRow` takes `withHandle` to tighten its left padding. The Add Card button is now `h-11 md:h-9` to match the toggle's 44px mobile height.
- shadcn: added `toggle` and `toggle-group` from base-vega. The CLI first pulled the Radix `toggle` as a dependency; re-add it from the base-vega URL with `--overwrite` and fix the `cn` import, as in ticket 01.

**Verified** with Playwright against the dev deployment:
- Desktop: mouse drag, the keyboard menu, reload, and dark mode with reduced motion.
- Mobile viewport: Chromium touch through CDP (drag moves without scrolling the page; a tap opens the menu).
- Auto-scroll with a short viewport.
- Not tried on a physical iPhone. Worth a quick check that a drag on the handle never scrolls the page in Safari.

**Open (judgement calls left as is)**
- `position` is `v.optional`, not `v.union(v.number(), v.null())`, matching ticket 03's pattern for fields older rows lack.
- `moveCard` also works while the Deck is in By cost order. That's harmless: the UI only offers it in Custom.
- Escape doesn't cancel a pointer drag.
- "By cost" and "Custom" aren't glossary terms.

**Dev data:** reordered the first "Agent test Deck" and left it in By cost.


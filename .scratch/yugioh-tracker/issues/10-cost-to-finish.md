# 10: Cost to finish

**What to build:** Each Deck leads with its estimated cost to finish (remaining Copies x Reference price) and the cheapest buy-it-now total available right now, with subtotals per Section and per Card. The Decks overview shows each Deck's cost to finish.

**Blocked by:** 09 (eBay Reference price and Deal grades)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Graded Listings excluded from both numbers
- [x] Undecided Cards use their cheapest Candidate
- [x] Cards without a Reference price are counted and called out rather than silently dropped
- [x] Default 'by cost' order now uses remaining cost
- [x] convex-test covers the estimate (Seam 1)

## Notes from the build

**Shape: `now` is optional on getDeck and listDecks.** A query can't read the clock, and By cost order needs prices, so pricing lives inside `getDeck` rather than in a client join.
- `api.yugioh.decks.getDeck({ deckId, now? })` and `listDecks({ now? })`. With `now`, they return:
  - `cost` on the Deck: `DeckCost`, which is `{ toFinish, buyNow, unfinishedCards, cardsWithoutPrice: [{ _id, cardName }], cardsWithoutBuyNow }`;
  - `cost` on each Section: `{ toFinish, buyNow }`;
  - `cost` on each Card: `{ remainingCopies, toFinish | null, buyNow | null }`.
- Without `now`, every `cost` is null and By cost sorts by name. `deck-shell`, `searches-page` and `listing-drawer` still call it without `now`.
- The Cards tab and the overview send `useHourClock()` (`src/lib/hooks/use-hour-clock.ts`): the minute clock floored to the hour, so the priced query re-runs hourly, not every minute. It still updates live on every capture.
- `useHeldWhileLoading(value, key)` (`src/lib/hooks/use-held-while-loading.ts`) keeps the last result while the query reloads for a new hour, so there's no skeleton flash.
- **Optimistic updates** now go through `updateCachedDeck(store, deckId, fn)` (`_utils/optimistic.ts`). It patches every cached `getDeck` for the Deck, priced or not, using `store.getAllQueries`. Use it for any new optimistic update to getDeck.

**Ordering:** `orderCards(cards, cardOrder, costs)` in `convex/model/yugioh/decks.ts` passes `byRemainingCost` (lib) to `groupCardsBySection`. Within a Section the order is:
1. unfinished Cards, highest cost to finish first;
2. then unfinished Cards without a price;
3. then finished Cards.

Ties go by name.

`moveCard` now takes optional `now`. `sortable-card-list` sends the same hour clock, so it orders unpositioned Cards at the same prices the screen used. Without `now`, it falls back to `Date.now()`.

**Lib** `src/lib/yugioh/costs.ts` (relative imports only):
- `cardCost(card, candidatePrices)`:
  - A Chosen Printing prices the Card alone.
  - An undecided Card takes its cheapest Candidate **for each figure separately**, so the estimate and buy-now can come from different Candidates.
  - A finished Card is 0 and needs no price.
- `sumCosts`, `deckCost`, `byRemainingCost`, `formatWholeDollars` ($1,240), and `BUY_NOW_FRESH_DAYS` (7).
- `CandidatePrices.reference` is "the lower of its Reference prices". **Ticket 12:** pass `min(eBay, TCGplayer)` there, and add TCGplayer Listings to the buy-now floor (spec story 49).

**Convex**
- `convex/model/yugioh/deals.ts` exports `loadPriceReaders(ctx, now)`, which returns `{ reference(printingId, condition), buyNow(printingId, condition) }`. Both are memoised per Printing and condition for one query.
- `buyNow` is the cheapest Per-copy price among Listings that:
  - are matched to the Printing;
  - are still for sale at a fixed price (`saleAt` null, not sold, not an auction);
  - are Qualifying at the Card's condition (so not graded);
  - were last seen in the last 7 days.

  It reads `by_matchedPrintingId_and_saleAt` with `saleAt == null`, newest 200 (`MAX_BUY_NOW_LISTINGS`).
- `convex/model/yugioh/costs.ts`: `readCardCosts(prices, cards, candidates)`, priced at each Card's own Lowest acceptable condition. `listDeckSummaries` loads the readers once for all Decks, so a Printing shared across Decks is read once.
- `decks.ts` exports `listDeckCandidates(ctx, deckId)`.
- Validators: `yugiohCardCostValidator`, `yugiohCostTotalsValidator` and `yugiohDeckCostValidator`, each with a compile-time check against the lib.
- There's an import cycle: `decks.ts` → `costs.ts` → `deals.ts` → `decks.ts` (for the `MAX_*` limits). It's harmless because the limits are only used inside functions. If it ever bites, move the limits into their own module.

**Decisions (assumptions)**
- **Buy-now total:** remaining Copies × the cheapest Qualifying buy-it-now Per-copy price. eBay quantity isn't captured, so one Listing is assumed to cover every remaining Copy.
- **Stale Listings:** a Listing not seen in 7 days is treated as gone.
- **Totals:** Deck and Section totals add up only the Cards that have a figure. The UI names or counts the rest:
  - "for 1 of 4 Cards" on buy-now;
  - the unpriced Cards listed by name, each linking to its Card drawer.

**UI**
- `deck-cost.tsx` has three parts:
  - `DeckCostHeader`, at the top of the Cards tab. It shows the hero figure "to finish", "Complete", or "No Reference prices yet"; then the buy-now line, the progress bar, and the callout naming every Card without a Reference price.
  - `DeckCostLine`, on the overview. It shows "$X to finish · $Y buy now [for N of M Cards]". It's hidden before any price exists and shows "Complete" when finished. The overview footer adds "N Cards without a price".
  - `DeckCostHeaderSkeleton`.
- **Section headings:** subtotal on the right, "$640 · $520 buy now". It's hidden at $0.
- **Card rows:** the right column shows the cost to finish, or "No price", over "$X buy now". This replaces "N left"; the meta line still shows owned / needed.
- Checked against the dev deployment with Playwright: desktop and 390px, light and dark, priced, partly priced and unpriced Decks.

**Glossary:** added Cost to finish and Buy-now total.

**Open / left as is**
- **Read volume.** Each priced Card reads up to 200 sales plus 200 Listings for sale per Candidate. Real Decks are far below Convex's per-query limits, but a 40-Card Deck whose Printings each have hundreds of sales could approach them, and the overview adds up every Deck. If that happens, store costs on a schedule instead.
- **Sheen not built.** The finished-Deck sheen (design §8) isn't built: "Complete" appears without motion.
- **"Last captured 9h ago" not built.** The design §5.2 callout belongs to ticket 15.
- **Section buy-now subtotal.** It doesn't say how many Cards it covers. Rows show the detail.
- **Overview skeleton.** It always draws a cost line.

**Dev data:** added and then removed a temporary Card, "Agent test Nibiru", in the third "Agent test Deck". Its Printing AGT1-EN999 Secret Rare remains, because Printings are never deleted.


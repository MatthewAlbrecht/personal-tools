# 09: eBay Reference price and Deal grades

**What to build:** Each Printing shows an eBay Reference price: the median Per-copy price of Qualifying sold Listings in the last 60 days, or 'not enough sales' under 3. Each eBay Listing gets a Deal grade against it (Great <=80%, Good <=95%, Fair <=110%, Poor above). Graded Listings are flagged with company and grade and still graded; running auctions get no grade; ended auctions count as sales.

**Blocked by:** 07 (AI title reading and matching), 08 (Per-copy price)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Qualifying = matched, English, not graded, at or above the Card's Lowest acceptable condition or unknown condition
- [x] Unknown-condition Listings count but are flagged
- [x] Thin data shows 'not enough sales'
- [x] Deal grade badges on Listings
- [x] convex-test covers the Qualifying rule, median, thresholds, graded and auction cases (Seam 1)

## Notes from the build

**Left for you (prod):** after deploying, run the backfill on prod until `isDone` is true (pass back `cursor`), so sales captured before 09 count:
`npx convex run --prod yugioh/deals:backfillSaleTimes '{"paginationOpts":{"numItems":200,"cursor":null}}'`. It has been run on dev.

**Decision: a sale keeps the exchange rate of when it sold.** `yugiohListings.capturedUsdPerUnit` holds the rate (dollars per unit of `currency`) at each capture while the Listing is still for sale. Once it is a sale, the rate freezes: either sold, or an auction that ended with bids. A sale's Per-copy price, in both the view and its Reference price, is computed with that frozen rate. Listings still for sale use today's rate. The rest of the Per-copy price stays live: import fees follow my Settings table, and Copies follow the title read. Limits:
- A Listing first captured already sold (from the Sold page, up to ~60 days late) gets the rate of the day it was captured. There is no rate history to look back on.
- Sales captured before 09 have no stored rate. They use today's rate until a capture sees them again, which then freezes it.

**Lib** `src/lib/yugioh/deals.ts` (relative imports only; tested in `deals.test.ts`):
- `isQualifying(listing, lowestAcceptable)`: English, not graded, and at or above the condition. Unknown condition counts.
- `getsDealGrade(listing, lowestAcceptable)`: the same, but a Graded Listing is allowed.
- `isBelowCondition`, `mostLenientCondition`.
- `saleTime(listing, seenSoldAt)`, `isSale(listing, now)`, `isRunningAuction(listing, now)`.
- `referencePrice(perCopies)` returns `{ price | null, sales }`. `percentOfReference`, `dealGrade(percent)`.
- Constants `REFERENCE_WINDOW_DAYS` (60) and `MIN_REFERENCE_SALES` (3); `DEAL_GRADE_LABELS`.
- `listing-format.ts`: `titleFlags(read, { belowCondition })` adds a `belowCondition` flag ("LP", "DMG").

**Language rule:** the title read's language, else the set code's region, else English.

**Ended auctions:** an auction whose `endsAt` has passed counts as a sale, unless it had 0 bids. Unknown bids (`null`) count.

**Grading:** grades use the rounded whole percent, so "80% of ref" always reads Great, even when the exact figure is 80.4%.

**Data model** (`yugiohListings`, both fields optional for older rows):
- `saleAt` (Unix ms or null): when it sold, or when an auction ends. The sold date is midnight UTC; a sold Listing with no date uses the capture that first saw it sold. Null for a fixed-price Listing still for sale.
- `capturedUsdPerUnit`: see the decision above.
- New index `by_matchedPrintingId_and_saleAt`. A Reference price reads `matchedPrintingId = p` and `saleAt` within `[now - 60d, now]`, newest first, at most 200 (`MAX_REFERENCE_SALES`). `by_matchedPrintingId` stays: `readDeckListings` uses its creation-time order.
- Ingest (`ingestEbayListings`) sets both fields. `currentUsdPerUnit(ctx, currency)` is in `convex/model/yugioh/pricing.ts`.

**Deck context (decision):** Qualifying depends on the Card's Lowest acceptable condition, which is per Deck, so prices and grades are always judged inside a Deck.
- `loadDealContext(ctx, deckId, now)` (`convex/model/yugioh/deals.ts`) returns `{ perCopyPrice(listing), deal(listing, perCopy) }`, with Reference prices memoised per Printing and condition.
- A Listing's grade uses the **most lenient** condition among the Deck's Cards that want its Printing.
- The Card drawer's Reference price uses **each Card's own** condition. The two only differ when one Printing is a Candidate of two Cards in a Deck (e.g. Main and Side) with different conditions.
- `listingView(ctx, listing, deals)` replaced the `pricing` argument.

**Queries take `now`:** a query can't read the clock, so the client sends `now`, floored to the minute.
- `api.yugioh.listings.listListings({ deckId, now })`.
- `getListing({ listingId, deckId, now })`. It has no UI caller yet.
- New `api.yugioh.deals.listReferencePrices({ deckId, now })` returns `[{ deckCardId, printingId, ebay: { price, sales } }]`.
- On the client, `useMinuteClock()` (`src/lib/hooks/use-minute-clock.ts`) ticks each minute, so every caller shares one subscription.
- Each Listing view now carries `deal: { qualifying, belowCondition, reference | null, grade | null, percentOfReference | null }`. `reference` is null when the Listing isn't matched to a Printing this Deck wants.
- **`getDeck` is unchanged, on purpose.** Its args key the optimistic updates (`store.getQuery(getDeck, { deckId })` in card-drawer, sortable-card-list and card-order-toggle), so adding `now` would break them.
- **Ticket 10:** cost to finish needs Reference prices per Card. Either join `listReferencePrices` on the client, or compute inside `getDeck` and keep its args stable. Note that By cost ordering also runs inside `moveCard`, a mutation, which can use `Date.now()`.

**UI**
- Tokens `--deal-great`, `--deal-great-foreground` and `--deal-good`, with `@theme inline` entries, are in `src/styles/globals.css`, matching §2. Every pair measured ≥ 4.5:1; the lowest is 4.71, dark Good text on its tint.
- `deal-grade.tsx`:
  - `DealGradeBadge`: Great is solid with `ArrowDown`, Good tinted, Fair outlined, Poor plain muted text.
  - `DealGradeSummary`: the badge plus "78% of ref". `stacked` is used in the desktop table.
  - `ReferenceLine`: "$54.00 eBay ref · 11 sales", or "Not enough eBay sales (2 of 3)". It says "eBay" because ticket 12 adds a TCGplayer ref.
- Listings:
  - Mobile line 1: Per-copy, then the grade summary.
  - Desktop: a Grade column after Per-copy. Title flags now sit under the title, because the narrower column pushed them into Type.
  - The `belowCondition` flag is a muted outline badge.
- Listing drawer: `DealLine` under the type line shows the badge and "78% of $12.18 eBay ref (4 sales, 60 days)". Otherwise it shows the `ReferenceLine`, and nothing for a Listing outside the Deck's Printings.
- Card drawer: each Candidate shows its `ReferenceLine` above the TCGplayer link. `Printings` now takes `deckId`.
- Checked with Playwright against dev data: light and dark, 390px and 1280px, the Listings page and both drawers.

**Tests**
- `convex/yugioh/deals.test.ts` (Seam 1, 21 tests) covers:
  - median, even count, Per-copy inputs, the 60-day window, Listings still for sale;
  - the Qualifying rule (KR, graded, LP, damaged, other rarity, no set code), unknown condition, the Card's condition, two Cards' conditions, overrides;
  - the four thresholds, thin data, graded, non-English and unmatched;
  - running, ended and 0-bid auctions, and an auction ending between queries;
  - the frozen sale rate, the backfill, and the backfill being internal.
- `src/lib/yugioh/deals.test.ts` covers boundaries, rounding, sale times and null bids.
- Existing callers in `listings`, `matching` and `pricing` tests now pass `now`.

**Open review notes (left as is)**
- Design §6's "none: … not Qualifying" row contradicts the ticket's "Graded Listings … still graded". The ticket wins, so Graded Listings get a grade (and the flag).
- Flag and Reference explanations use `title`, which touch can't reach. This is the same as 07; design §4 asks for Tooltip/Popover.
- `currentUsdPerUnit` repeats the USD/upper-case logic of `pricingFrom().usdPerUnit`.
- Sold Listings get grades too ("sold for Great"). That's informative, and ticket 13's push rule should only consider Listings still for sale.
- With no TypeSafe key on dev, title reads fail. On dev, some odd titles therefore match by set code alone (e.g. "Libromancer Geek Boy MP23-EN001") and feed Reference prices.

**Dev data:** `backfillSaleTimes` was run on dev and updated 24 Listings. No new Listings were added.

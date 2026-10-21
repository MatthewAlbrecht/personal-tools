# 11: Listings filters and what's new

**What to build:** The Listings view shows everything by default with filters for marketplace, type (buy-it-now / auction / sold), language, condition, graded, match status, location and 'new', kept in the URL. 'New' means first seen since I last opened that Deck. Each Card shows its new Listings per week, and auctions ending soon are easy to find.

**Blocked by:** 07 (AI title reading and matching)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Nothing hidden by default
- [x] Filters round-trip through the URL
- [x] Per-Deck last-viewed time updates on visit
- [x] Weekly new-listing rate per Card
- [x] Auctions ending soon view or filter
- [x] convex-test covers 'new' and the weekly rate (Seam 1)

## Notes from the build

**"New since my last visit"**
- Table `yugiohDeckVisits { deckId, viewedAt, newSince }`, index `by_deckId`. One row per Deck I've opened.
- `api.yugioh.decks.recordDeckVisit({ deckId })` (mutation, uses `Date.now()`). A missing Deck is ignored.
- Rule (`nextVisit` in `src/lib/yugioh/whats-new.ts`): looking again within 30 minutes (`VISIT_GAP_MS`) continues the visit and keeps `newSince`. A longer gap starts a new visit whose `newSince` is the previous `viewedAt`. **Decision:** the first visit ever marks nothing new (`newSince = now`), so existing Decks don't light up all at once.
- A Listing is new when `firstSeenAt > newSince` (`isNewListing`). Before any visit, nothing is new.
- Client: `useDeckVisit` in `deck-shell.tsx` records on mount, every 5 minutes while the page is visible, and on `visibilitychange` to visible. That keeps "new" right in the installed app, which resumes without remounting.
- Model: `convex/model/yugioh/whatsNew.ts` holds `recordDeckVisit` and `readNewSince`. **Ticket 13/14:** "the most recently viewed Deck" for push targets is `yugiohDeckVisits.viewedAt`.

**Listings query** (breaking shape change)
- `api.yugioh.listings.listListings({ deckId, now, filters? })` now returns `{ listings, matching, newCount, locations }`. `ListingView` is `…["listings"][number]`.
- Each Listing view (also from `getListing`) carries `isNew`. `listingView(ctx, listing, deals, newSince)` gained the last argument.
- `readDeckListingsPage` (`convex/model/yugioh/listings.ts`) filters every found Listing, then caps at 200 and builds views for those only. `readDeckListings` no longer slices to 200, but each set code or Printing read is still capped at its newest 200 (50 without a set code). So counts and Sold / Ending soon views can miss older Listings on very busy Printings.

**Filters** (`src/lib/yugioh/listing-filters.ts`, relative imports only)
- `ListingFilters` has: `new`, `ending`, `marketplace`, `type` (`buyItNow` (includes Best Offer) | `auction` | `sold`, where sold = `isSale`), `language` (`listingLanguage`, now exported from `deals.ts`), `condition` (a read condition or `unknown`), `graded`, `match` (`match|unsure|notMatch|reading`), `location` (compared with `countryKey`), and `card` (a Deck Card ID; Listings matched to the Printings the Card searches).
- `applyListingFilters(listings, filters, { now, newSince, cardPrintings })`: "Ending soon" means running auctions, the soonest end first, unknown end times last. No other ordering changes.
- URL: `listingFiltersFromParams` / `withListingFilters` (`new=1`, `ending=1`, `graded=yes|no`, others by value). Unknown values are ignored. Other params (`listing`) are kept.
- Quick views: `quickView` / `withQuickView` (All · New · Ending soon · Sold). `extraFilters` / `activeFilterCount` count what the quick view doesn't show.
- Convex validator `yugiohListingFiltersValidator` (with a `Same<>` check). `card` is `v.string()`, so a stale link can't fail argument validation; it just matches nothing.
- `shownMatchStatus` (`title-reading.ts`) is now the one place that decides "reading" vs the stored status. `listingMatchView` uses it.
- `searchedPrintingsByCard(cards, candidates)` was added to `src/lib/yugioh/searches.ts`.

**Weekly new-Listing rate**
- `getDeck({ deckId, now })` cards carry `newListingsPerWeek` (null without `now`).
- It counts Listings matched to the Card's searched Printings (the Chosen one, or every Candidate) that were listed in the last 4 weeks, divided by 4. "Listed" means `listedAt`, else `firstSeenAt`. A sale without `listedAt` isn't counted (the Sold page doesn't say when it went up). A match whose new title is still being read isn't counted.
- The read is `by_matchedPrintingId` with `_creationTime > now - 4 weeks`, newest first, up to 200 per Printing (`readNewListingRates`, `whatsNew.ts`).
- Copy is `newListingsRate` in `listing-format.ts`: "About 3 new a week", "Under 1 new a week", "No new Listings in 4 weeks".

**UI**
- `listing-filters.tsx` → `ListingsToolbar` has:
  - the quick-view `ToggleGroup`, a one-field TanStack form, with the New count on "New";
  - a "Filters" button with a count badge;
  - removable filter chips plus "Clear";
  - `ListingFiltersDrawer`: a TanStack form of `Select`s (`listingFiltersSchema`) that applies on each change. Its footer has "Clear filters" and "Show N Listings".
- Filter changes use `router.replace` (no history entries). The Listings page holds the last result while a new filter loads (`useHeldWhileLoading`).
- New Listings get a `bg-primary` dot before the price, read out as "New" by screen readers.
- Count line: "N Listings, newest first", "The newest 200 of N Listings", or "N running auctions, ending soonest first".
- Filtered to nothing: `Empty` "Nothing matches these filters." with [Clear filters].
- Card row: a third line with the rate, only when it's above 0. Card drawer: a "Listings for this Card" section (after Printings) with the rate and "All Listings for this Card →" (`?card=`). The design's top-5 Listings there aren't built.

**Deviations from design §5.3 (judgement calls)**
- Full filters use `YugiohDrawer` on desktop too, not a `Popover`: AGENTS.md says Drawer for multi-field settings.
- Location is a `Select` of the Deck's seller countries, not a `Combobox`.
- Removable filters are secondary `Button` chips (44px on mobile), not `Badge`s, because Badge isn't interactive.

**Not done / open**
- The overview's "N new" badge (design §5.1) isn't built. `newCount` exists per Deck in `listListings`, but listDecks doesn't compute it.
- No visual check of the "new" dot against real data: dev had no capture after a visit. It's covered by Seam 1 tests.
- Opening a Deck after a break: until `recordDeckVisit` commits, the previous visit's `newSince` shows for a moment.

**Tests**
- `convex/yugioh/whats-new.test.ts` (Seam 1, 12 tests): new since the last visit, a visit continuing, the next visit, the first visit, per-Deck visits, the New filter and counts, the weekly rate (window, no listing date, sold, Chosen vs undecided, no `now`), ending soon, and filters narrowing.
- `src/lib/yugioh/listing-filters.test.ts` (16): every filter, the URL round-trip, ignoring bad values, and quick views.
- `newListingsRate` is tested in `listing-format.test.ts`. Existing `listListings` callers in tests now read `.listings`.

**Dev data**: viewing Decks in the browser created `yugiohDeckVisits` rows in dev.

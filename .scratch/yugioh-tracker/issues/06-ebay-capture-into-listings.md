# 06: eBay capture into Listings

**What to build:** When I open any eBay search-results page (active or sold), the extension reads every result and sends it to the app. Each Listing is stored by marketplace item ID with title, price, shipping, type (buy-it-now / best offer / auction), bids, time left, date listed, seller location and sold status; seeing it again updates it. The extension's dock shows how many were captured, and a basic Listings view shows them.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** ready-for-human (only the real sold-page fixture is left, below)

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Added to the existing RYM/Bandcamp extension (new content script, host permission, service-worker handler)
- [x] Ingest API route checks the existing extension bearer secret and forwards to internal Convex mutations
- [x] Ingest is idempotent on marketplace + item ID; price changes are recorded as observations
- [ ] Saved HTML fixtures of eBay active and sold search pages produce the expected payloads (Seam 2). Active: done, from real pages. **Sold: the fixture is reconstructed**, because eBay sends signed-out fetches of `LH_Sold=1` to sign-in. Left for Matt: save a real sold page (below).
- [x] convex-test covers ingest and dedupe (Seam 1)
- [x] Listings view lists captured Listings newest first

**Left for Matt (can't be done by an agent):**
1. Reload the unpacked extension (`extensions/rym-release-scraper`, now 0.5.0) and accept the new eBay host permission.
2. Make sure `RYM_EXTENSION_INGEST_SECRET` is set on the Next deployment you point the extension at (it isn't in local `.env.local`), and the same value is in the extension options.
3. Open a Search's Newly listed and Sold links; the dock should say "Captured N Listings", and they should appear on the Deck's Listings tab.
4. On the Sold page, "Save Page As → Webpage, HTML only" and hand it to an agent to replace `extensions/rym-release-scraper/tests/fixtures/ebay-sold.html` (trim with the approach in Notes), then tick the fixture criterion.

## Notes from the build

**Flow:** content script `ebay-content.js` → `chrome.runtime.sendMessage({ type: "YUGIOH_EBAY_CAPTURE", listings })` → service worker `forwardEbayListingsToBackend` → `POST /api/yugioh/ebay-capture` (Next; `Bearer RYM_EXTENSION_INGEST_SECRET`, same check as Bandcamp/RYM; allowlisted in `src/lib/route-access.ts`) → `captureEbayListings` in `src/server/convex-server.ts` → Convex HTTP action `POST /server/yugioh/ebay-listings` (`Bearer CONVEX_SERVER_SECRET`, `serverRoute` in `convex/http.ts`) → `internal.yugioh.listings.ingestEbayListings`. Response `{ captured, created, updated }` feeds the dock ("Captured 48 Listings · 12 new, 36 seen before"). Verified end to end against the dev deployment with a temporary local secret.

**Data model** (`convex/schema.ts`)
- `yugiohListings`: `marketplace` (`"ebay" | "tcgplayer"`, `yugiohMarketplaceValidator`) plus every field of `yugiohCapturedEbayListingValidator` (`itemId, url, title, imageUrl, price, currency, shipping, listingType, bids, endsAt, listedAt, sellerLocation, sold, soldDate`), `firstSeenAt`, `lastSeenAt`. Index `by_marketplace_and_itemId`. Shared across Decks. No Printing match yet (ticket 07 adds match fields; ticket 12 may need its own captured-TCGplayer shape, since the eBay fields are spread in).
- `yugiohListingObservations { listingId, observedAt, price, currency, shipping, bids, sold }`, index `by_listingId`. One on first capture, then one whenever price, currency, shipping, bids or sold change (bids and sold count as price-relevant: auctions, sold capture). A repeat sighting with no change only bumps `lastSeenAt`.
- `price`/`shipping` are in `currency` (always USD on ebay.com so far; ticket 08 converts). `shipping` is 0 for free delivery and null when unknown (local pickup only). `endsAt`, `listedAt` are Unix ms; `soldDate` is `YYYY-MM-DD`. `sellerLocation` is the country from "Located in …".

**Merge rules** (`convex/model/yugioh/listings.ts`, `ingestEbayListings`): upsert by marketplace + item ID; the same item twice in one capture counts once (last wins); a later capture overwrites what it saw, but `imageUrl`, `listedAt`, `sellerLocation`, `endsAt`, `soldDate` keep earlier values when the new page lacks them, and `sold` never goes back to false. Max 250 Listings per capture (`MAX_LISTINGS_PER_CAPTURE`, also checked in the HTTP action). Ticket 07: queue AI reading on insert and when `title` changes, here.

**Convex functions**: `api.yugioh.listings.listListings({})` (newest first by `_creationTime`, i.e. first captured; `take(200)`, `MAX_LISTINGS_SHOWN`), `api.yugioh.listings.getListing({ listingId })` (with up to 100 observations, newest first; for the Listing drawer), `internal.yugioh.listings.ingestEbayListings`.

**Extension** (`extensions/rym-release-scraper/`)
- `ebay-reader.js`: `readEbayResults(document, { now, url })` → `{ listings }`, and `countEbayResults(document)`. Pure DOM, no chrome APIs; exposed on `globalThis` so Vitest can import it. Selectors and formats: `docs/yugioh/references/ebay-search-results.md` (new, verified live 2026-10-20).
- Reading rules: cards are `ul.srp-results > li.s-card[data-listingid]`; skips the fake "Shop on eBay" id `2500219655424533`; **stops at "Results matching fewer words"** (`li.srp-river-answer--REWRITE_START`); rows are told apart by text; a price range reads its low end; an auction with Buy It Now reads the bid as price; `endsAt = now + time left` (only on the ending-soonest sort); listing dates have no year, so the year steps back each time a date comes out later than the one above (newest-first sort only); listing times are read as the viewer's local time (eBay shows no timezone, unverified); every result on a `LH_Sold=1` page is sold, and a `Sold  Oct 18, 2026` caption also marks one sold. Sponsored cards are read like any other and not flagged.
- `ebay-content.js` runs on `https://www.ebay.com/sch/*`, captures on load, and the dock's button runs it again. `scrape-dock.js` gained `pageKind: "ebay"` via a `SCRAPE_DOCK_COPY` map. Manifest 0.5.0 adds the content script and `https://www.ebay.com/*`.
- Tests: `extensions/rym-release-scraper/tests/ebay-reader.test.ts` (Seam 2, 18 tests; includes a check that every fixture's Listings pass `yugiohCapturedEbayListingValidator`) and `ebay-content.test.ts` (content-script wiring, chrome stubbed). Both are in `vitest.config.ts`. `extensions/` is outside tsconfig.
- Fixtures (`tests/fixtures/`): `ebay-newly-listed.html` (list view), `ebay-newly-listed-grid.html`, `ebay-ending-soon.html`, `ebay-fewer-words.html` are real pages trimmed to a few cards (SVGs and data URIs removed). `ebay-sold.html` is **reconstructed** from real active cards. Raw pages are in `.scratch/yugioh-tracker/ebay-raw/` (uncommitted). Fetching eBay with curl needs a cookie jar from the homepage plus full Chrome headers over HTTP/2, or it returns 403.

**UI**
- `/yugioh/decks/[deckId]/listings` → `ListingsPage` (`_components/listings-page.tsx`); Listings is the middle tab in `DeckShell`. Mobile: one link row per Listing (price + shipping · eBay + type / location · freshness right-aligned, with line 2's left side left free for ticket 07's Card and Printing / title). Desktop: shadcn `Table` (added from base-vega, `cn` import fixed) with Price · Title · Type · Location · Seen and an external-link button. Empty state uses the §7 copy. Rows link straight to eBay until the Listing drawer (`?listing=`) exists.
- **Decision:** until matching (07), the Deck's Listings tab shows every captured Listing, from any Deck. 07 should filter to the Deck's Printings.
- Display helpers: `src/lib/yugioh/listing-format.ts` (`formatMoney`, `timeLeft`, `listingTypeLabel`) with tests. Prices show in their own currency until 08 converts.
- **date-fns was added** (`pnpm add date-fns`): it's in the AGENTS.md stack but wasn't installed.

**Open review notes (left as is)**
- The HTTP action answers 400 for any ingest error, including server faults.
- `getListing` has no UI yet (the drawer is a later ticket).
- The bearer check in the Next route repeats the Bandcamp route's code, and the service worker repeats the origin/secret loading, matching the existing pattern.
- `scrape-dock.js` still has formatting drift in lines this ticket didn't touch.

**Dev data**: 17 test Listings from the fixtures were ingested into the dev deployment.

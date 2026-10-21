# 12: TCGplayer capture and Reference price

**What to build:** When I open a Printing's TCGplayer product page, the extension reads its current Listings (seller, condition, price, shipping, quantity) and latest sales (with condition) without AI. Each Printing gets a TCGplayer Reference price (median of Qualifying sales in 60 days at or above the Card's condition, min 3) shown separately from eBay's, plus the cheapest current Qualifying TCGplayer Listing as the 'buy now' floor. TCGplayer Listings get Deal grades against the TCGplayer Reference, and cost to finish uses the lower of the two References.

**Blocked by:** 03 (TCGplayer product link and image), 09 (eBay Reference price and Deal grades)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Extension handles TCGplayer product pages
- [x] Saved HTML fixtures of a TCGplayer product page produce the expected payloads (Seam 2)
- [x] eBay and TCGplayer Reference prices never blended
- [x] convex-test covers the TCGplayer Reference, floor and cost-to-finish choice (Seam 1)

**Left for you (can't be done by an agent):**
1. Reload the unpacked extension (`extensions/rym-release-scraper`, now 0.6.0) and accept the new `https://www.tcgplayer.com/*` host permission.
2. Signed in to TCGplayer, open a Printing's product page (the link in its Card drawer). The dock should say "Captured 10 Listings and N sales" and name the Printing. Check that "Load More Sales" got clicked (more than 5 sales), then open the Card drawer and the Listings tab filtered to TCGplayer.
3. After deploying, run the product-id backfill on prod until `isDone` (pass back `cursor`), so Printings linked before this ticket are found by captures:
   `npx convex run --prod yugioh/tcgplayer:backfillTcgplayerProductIds '{"paginationOpts":{"numItems":200,"cursor":null}}'`. It has been run on dev.

## Notes from the build

**Research:** `docs/yugioh/references/tcgplayer-product-page.md` (new, verified live with Playwright on 2026-10-20). The key facts:
- The page is client-rendered.
- Listings are `.product-details__listings-results > section.listing-item`. There are 10 per page, sorted by price + shipping, and only `Language=English` is filtered by default.
- Each Listing has a stable id from `section.add-to-cart[data-testid]`: `<productConditionId>-<sellerKey>[-<listingId>]`.
- Latest sales exist in the DOM only after clicking "View More Data". Signed out you get 5; signed in, "Load More Sales" adds 25 a click.
- Sale prices are per Copy. Sales show no shipping and have no id.
- Listings with photos carry a seller title and can be another card.

Raw pages are in `.scratch/yugioh-tracker/tcgplayer-raw/` (uncommitted).

**Flow:** `tcgplayer-content.js` runs `readTcgplayerProduct` (`tcgplayer-reader.js`) and sends `chrome.runtime.sendMessage({ type: "YUGIOH_TCGPLAYER_CAPTURE", product })`. From there:
1. The service worker's `postYugiohCapture` (now shared with eBay) posts to `POST /api/yugioh/tcgplayer-capture`. The route uses the extension bearer secret via `rejectUnlessExtension` in `src/server/extension-ingest.ts`, now shared with the eBay route, and is allowlisted in `route-access.ts`.
2. `captureTcgplayerProduct` (`src/server/convex-server.ts`) forwards to the Convex HTTP action `POST /server/yugioh/tcgplayer-product`.
3. That calls `internal.yugioh.listings.ingestTcgplayerProduct`.
4. It returns `{ printing | null, listings, sales, created, updated }`, which feeds the dock.

**Payload** (`yugiohCapturedTcgplayerProductValidator`): `{ productId, url, listingsFromCheapest, listings: [{ listingId, seller, condition, price, shipping, quantity, customTitle }], sales: [{ soldDate, condition, quantity, price, shipping: null, customTitle }] }`.
- `condition` is TCGplayer's own wording ("Near Mint 1st Edition"). Sales take it from the tooltip, or expand the short form.
- `listingsFromCheapest` means page 1 with no `Condition`/`Printing`/`direct` filter, and `Language` absent, English or all.

**Data model**
- `yugiohPrintings` gains three optional fields:
  - `tcgplayerProductId`, plus index `by_tcgplayerProductId`. It's set wherever the product URL is set (`linkFields`).
  - `tcgplayerListingsSeenAt` and `tcgplayerListingsSeenUpTo`: when a cheapest-first capture last ran, and the highest price + shipping it showed (null when it showed none).
- TCGplayer Listings and sales are rows in `yugiohListings` with `marketplace: "tcgplayer"`, the eBay-shaped fields, and an optional `tcgplayer: { seller, condition, quantity }` (`yugiohTcgplayerDetailsValidator`).
  - The fields are set as: USD, `buyItNow`, `sellerLocation: "United States"` (assumption: no import fees), and `capturedUsdPerUnit: 1`.
  - `titleRead` is filled from the page (the set code and rarity of the Printing, the condition and language TCGplayer states, 1 Copy, not graded), with `titleReadStatus: "read"`. So the Qualifying rule judges TCGplayer like eBay, with no AI.
  - Item ids are `listing:<listingId>` or `sale:<date>:<condition>:<price>:<shipping>:<qty>:<customTitle>#<n>`, where `n` counts identical sales above it on the page.
- **Index replaced:** `by_matchedPrintingId_and_saleAt` → `by_matchedPrintingId_and_marketplace_and_saleAt`. Every Reference and buy-now read is per marketplace, so the two are never blended.

**Matching:** the Printing comes from the product id, so the row is `match`. A Listing or sale with photos (a `customTitle`) is `unsure` and uses the seller's title until I match it. A re-capture follows photos being added or removed, unless I've overridden it. `rematchSetCode` skips TCGplayer rows. A product none of my Printings has is reported (`printing: null`, dock: "Not one of your Printings") and not stored.

**Prices** (`convex/model/yugioh/deals.ts`)
- `PriceReaders` is now `reference(marketplace, printingId, condition)` and `buyNow(marketplace, printingId, condition)`, memoised per marketplace, Printing and condition.
- A Listing's Deal grade uses its own marketplace's Reference.
- The TCGplayer buy-now floor also drops a Listing the latest cheapest-first capture didn't show if it's priced at or below the dearest one shown (`goneFromTcgplayerPage`). A pricier unseen one may be on a later page, so it still counts.
- `readCardCosts` takes `lowestPrice([ebay, tcgplayer])` for both the Reference and the buy-now (`lowestPrice` is now exported from `src/lib/yugioh/costs.ts`).
- `api.yugioh.deals.listReferencePrices` rows are `{ deckCardId, printingId, ebay, tcgplayer, tcgplayerBuyNow }`.

**Lib**
- `readTcgplayerCondition(text)` and `tcgplayerProductIdOf(url)` in `src/lib/yugioh/tcgplayer.ts`.
- `MARKETPLACE_LABELS` and `listingSeller(listing)` in `listing-format.ts`: the country for eBay, or "Card Castle · 3 Copies" for TCGplayer.

**UI**
- `ReferenceLine` takes a `marketplace` ("$43.42 TCGplayer ref · 3 sales", "Not enough TCGplayer sales (2 of 3)").
- The Card drawer shows, per Candidate: the eBay ref, the TCGplayer ref, then "Buy now from $42.98 on TCGplayer" (only when there's a floor).
- Listings:
  - Rows and the drawer name the marketplace. The desktop Type cell has the marketplace muted under it.
  - The "Location" column is now "Seller"; design-direction §5.3 is updated to match.
  - TCGplayer titles lead with the condition.
- The Listing drawer has "What TCGplayer says" (Seller, Condition, Copies for sale/sold, Language) in place of "What the title says", and "Open on TCGplayer".
- Checked with Playwright on dev: desktop light, 390px dark, Card drawer, Listings, Listing drawer.

**Extension:** manifest 0.6.0 adds the content script on `https://www.tcgplayer.com/product/*` and the host permission. `scrape-dock.js` gained `pageKind: "tcgplayer"`.
- The content script waits up to 15 s for Listings (or "No Listings Available") and opens the sales window if it's closed.
- It then clicks "Load More Sales" (signed in only) up to 7 times, until the oldest sale is older than 60 days.
- In-page navigation to another product needs the dock's button.

**Tests**
- `convex/yugioh/tcgplayer-prices.test.ts` (Seam 1, 21 tests) covers:
  - capture: storing, idempotent re-capture, Listings with photos, gaining photos, re-matching, an unknown product, the backfill, the secret;
  - the TCGplayer Reference: median, window, condition, never blended;
  - the floor: cheapest, shipping, gone vs on a later page, a page with none;
  - grades on each marketplace's own Reference;
  - cost to finish and buy-now taking the lower.
- `extensions/rym-release-scraper/tests/tcgplayer-reader.test.ts` (Seam 2, 11 tests) runs on 4 trimmed real pages (`tests/fixtures/tcgplayer-*.html`) and checks the validator. `tcgplayer-content.test.ts` checks the wiring.
- Lib tests cover conditions and `listingSeller`.

**Dev data:** on dev, the backfill set 1 product id. The reader's payload from `tcgplayer-latest-sales.html` (product 524817: 10 Listings, 5 sales) was ingested onto "Ash Blossom & Joyous Spring" MP23-EN001 Starlight Rare, the Printing ticket 03 pasted 524817 onto. That Printing now shows a $43.42 TCGplayer ref and a $42.98 floor in the first two "Agent test Deck"s.

**Open (decisions and limits, left as is)**
- **TCGplayer sales have no shipping** (the page doesn't show it), so the TCGplayer Reference is item price only. TCGplayer Listings' Per-copy prices include shipping. Grades lean slightly toward Fair/Poor when a seller charges shipping, and "the lower Reference" leans slightly toward TCGplayer. Most Listings above $5 say "Shipping: Included". The latest-sales API has `shippingPrice` if this matters.
- **Only the page on screen is read** (10 Listings by default). That's enough for the floor; it isn't every Listing.
- **Sale keys:** if the oldest identical sale on a date drops off the page as a new identical one arrives, the new one isn't stored. This is rare.
- **TCGplayer sellers are assumed to be in the US** and priced in USD. The page marks non-USD sellers with `span.listing-item__currency`; the reader ignores it.
- **The sort is assumed to be "Price + Shipping",** the default. It's kept in local settings, not the URL, so "Item Price Only" would skew the cutoff a little.
- **Read volume:** each priced Candidate now reads up to 4 × 200 rows (the Reference and buy-now for each marketplace). This is the same concern as ticket 10, made larger.
- **Sold sales** count as "new" and get grades, as eBay sales do (decisions from 09 and 11).
- **Not built:**
  - The Card row's desktop "eBay | TCGplayer" ref columns (design §5.2).
  - An eBay buy-now floor per Candidate.
  - Hiding the Match form on TCGplayer rows.
- **Pre-existing:**
  - The Listing drawer's Match `Select` overflows at 390px with long Printing names.
  - `scrape-dock.js` has Biome formatting drift.
- `requireAuth` is still a no-op (the repo pattern).

**Bug fix (coordinator): capturing a page no Printing is linked to**
- Before, every unlinked product page said "Paste this page's URL on its Printing in the tracker", even when no Printing existed for it.
- The reader now sends `details: { productName, setCode, rarity }` from the page's heading and "Number:"/"Rarity:" details (null until loaded; optional in `yugiohCapturedTcgplayerProductValidator` for older builds). Fixtures gained the real details block.
- `ingestTcgplayerProduct` (`linkPageToPrinting` in `convex/model/yugioh/tcgplayerCapture.ts`) matches Printings by the page's set code (`by_setCode_and_rarity` prefix) and `rarityNamesAgree`:
  - none: nothing stored, reason "<Card> <set code> <rarity> isn't in a Deck yet. Add it in the tracker first." (`tcgplayerCardName` drops TCGplayer's rarity suffix);
  - exactly one without a link: the URL must pass `checkTcgplayerProductUrl` for that Printing, then it's linked (`savePastedLink`) and the page captured; the report has `linked: true` and the dock says "Linked this page to …";
  - otherwise (several, or the one is linked to another product): nothing stored, the reason names each candidate and keeps the paste instruction.
- The report gains `linked` and `reason`; the dock ("Not captured") and automated runs (`visitOutcome`) show `reason`.
- Tests: `convex/yugioh/tcgplayer-capture-linking.test.ts` (7), plus reader, content-script and runner tests. Manifest 0.7.1.
- Open: a Printing already linked to another product can't be re-pasted in the UI (the paste form shows only for `needsPaste`), so that case's paste instruction isn't actionable yet.

# 08: Per-copy price

**What to build:** Every Listing shows a Per-copy price: price plus shipping plus import fees, converted to dollars with a daily exchange rate, divided by the number of Copies in the Listing. Import fees come from a per-country rate table (10% when a country isn't listed) that I can edit.

**Blocked by:** 06 (eBay capture into Listings)

**Status:** done (one step left for you: seed and refresh on prod, below)

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Daily exchange-rate refresh
- [x] Per-country import fee table researched and seeded once; editable in the app (seeded on dev; **prod: run the seed yourself**, see Notes)
- [x] US Listings have no import fee
- [x] Copies in the lot come from AI reading (defaults to 1 when unknown)
- [x] convex-test covers conversion, fees and lot division (Seam 1)

## Notes from the build

**Left for you (prod):** after deploying, run once on prod:
- `npx convex run --prod yugioh/pricing:seedImportFeeRates '{}'` (fills the table; safe to re-run, keeps edits)
- `npx convex run --prod yugioh/pricing:refreshExchangeRates '{}'` (otherwise foreign Listings show "No rate yet" until the 06:00 UTC cron)

**Research**: `docs/yugioh/references/exchange-rates-and-import-fees.md`.
- Rates come from **Frankfurter v2**, `GET https://api.frankfurter.dev/v2/rates?base=USD`. It's keyless, needs no attribution, covers 165 currencies, and is verified working from Convex's cloud.
- Import fees:
  - Yu-Gi-Oh cards are HTS 9504.40.00, duty Free.
  - The $800 de minimis exemption is suspended.
  - The IEEPA tariffs were struck down in Feb 2026. Section 301 tariffs (10% / 12.5%) have applied since 2026-07-24.
  - Defaults are tariff + 3 points for carrier fees: 13% (EU, UK, Canada, Mexico, Taiwan, India…), 16% (Japan, Korea, China, HK, Australia…), Brazil 41%.

**Lib** `src/lib/yugioh/pricing.ts` (relative imports only):
- `perCopyPrice(listing, copies, pricing)` returns `PerCopyPrice | null`: `{ price, shipping, importFees, importFeePercent, importFeeDefaulted, copies, perCopy }`, all USD and rounded to cents. It's null with no price or no rate for the currency. Fees are charged on price + shipping, and the total is divided by Copies (at least 1).
- `pricingFrom(exchangeRates, importFeeRates)` builds the `Pricing` lookups.
- Also here: `parseFrankfurterRates`, `DEFAULT_IMPORT_FEE_RATES`, `DEFAULT_IMPORT_FEE_PERCENT` (10), `HOME_COUNTRY`, `countryKey` / `cleanCountry` / `isHomeCountry`. "Korea, South" is aliased to "South Korea".

**Convex**
- Tables:
  - `yugiohExchangeRates { currency, usdPerUnit, fetchedAt, source }`, index `by_currency`. **One row per currency, latest only, no history.**
  - `yugiohImportFeeRates { country, countryKey, percent }`, index `by_countryKey`.
- `convex/model/yugioh/pricing.ts`:
  - `loadPricing(ctx)`: call it once per query, then pass it to `listingView(ctx, listing, pricing)`, whose signature changed.
  - Also `saveExchangeRates`, `setImportFeeRate`, `seedImportFeeRates` and `readPricingSettings`.
- Public: `api.yugioh.pricing.getPricingSettings` and `setImportFeeRate({ country, percent })`, which upserts, so it also adds countries. It rejects United States and anything outside 0-100.
- Internal: `refreshExchangeRates` (action; a failed fetch keeps the old rates and only logs), `saveExchangeRates`, `seedImportFeeRates`.
- Cron `yugioh exchange rates`: daily at 06:00 UTC.
- The fetch adapter is `convex/model/yugioh/exchangeRateSource.ts` (`fetchUsdRates`), which tests `vi.mock`.
- Listing views (`listListings`, `getListing`) now carry `perCopyPrice` (`yugiohPerCopyPriceValidator`). Copies come from `titleRead.copies`, or 1.
- **Ticket 09:** compute sold Listings' Per-copy prices with the same `loadPricing` + `perCopyPrice`. Note that old sold Listings in foreign currencies are repriced at **today's** rate. If that matters, store the rate at capture time or keep rate history.

**Decisions (assumptions)**
- An unknown seller location pays the 10% default. Missing shipping counts as $0 and shows as "Not stated".
- US territories (Guam, Puerto Rico) aren't special-cased; they pay 10% unless added. Add them in Settings at 0% if wanted.
- **Question for you:** the spec's 10% fallback is lower than every researched rate (13-16%), so an unlisted country looks cheaper than a listed one. Consider raising `DEFAULT_IMPORT_FEE_PERCENT`. **Resolved in ticket 13:** approved and raised to 15%.
- Per-copy price includes the 3-point fee allowance. Express couriers' flat brokerage fees ($15-30) aren't modelled.

**UI**
- Listings: "$42.15 /copy" leads each row and the desktop "Per-copy" column. Without a rate the row shows "No rate yet EUR", and without a price, "No price".
- Listing drawer:
  - The title is "$47.71 a copy".
  - A "Per-copy price" breakdown shows: original → USD price, shipping, import fees with "(United Kingdom 13%)" / "(Chile, default 10%)" / "(none from United States)" plus a "Change rate" link, and "÷ N" ("(title not read)" when assumed). The Per copy total sits under a rule.
- `/yugioh/settings` (`settings-page.tsx`):
  - Import fees `Card`: a `Table` with an inline TanStack rate form per row that saves on blur or Enter. Toasts on save. Blurring away from an invalid value restores the saved rate and toasts "Not saved".
  - An "Other countries 10%" footer row, and an "Add a country" form.
  - An exchange-rates line ("Exchange rates updated today at 6:00 AM from Frankfurter.").
  - It's reached from a Settings icon button on the Decks overview. Ticket 13's Notifications card goes on this page.
- Schemas: `importFeeRateSchema`, `newImportFeeRateSchema` in `_utils/schemas.ts`.

**Tests**:
- `convex/yugioh/pricing.test.ts` (Seam 1, 15 tests) covers:
  - US, foreign and unlisted countries, and an unknown location;
  - no rate, no price;
  - a lot, and an unread title;
  - refresh, replacement and failure;
  - the cron registered;
  - seed idempotency and edits;
  - validation;
  - internal-only functions.
- `src/lib/yugioh/pricing.test.ts` covers the Frankfurter parser and the Korea alias.

**Open review notes (left as is)**
- The daily refresh rewrites ~165 rate rows, re-running Listings subscriptions once a day (cheap).
- A failed refresh is silent apart from the log and the Settings timestamp.
- `seedImportFeeRates` looks each country up twice.
- The drawer headline keeps the 07 `font-display` style, and drawer section headings aren't the §2 section-heading style. Both are drawer-wide, pre-existing.

**Dev data**: on dev, real Frankfurter rates are loaded, and the fee table is seeded (the UK was edited and restored to 13%). Test Listings 707000000101 (GBP, UK), 102 (EUR, Germany) and 103 (USD, Chile) were added. An "Agent test rates" GBP row was overwritten by the real refresh.


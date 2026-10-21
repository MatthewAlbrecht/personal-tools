# TCGplayer product page DOM

How a content script can read Current Listings and Latest Sales from a TCGplayer product page (`https://www.tcgplayer.com/product/<id>/<slug>`). Checked live on 2026-10-20 with Playwright Chromium (headless, Chrome 141 UA, `en-US`, timezone `America/New_York`, signed out). The rendered DOM (`document.documentElement.outerHTML`, unstripped) is saved in `.scratch/yugioh-tracker/tcgplayer-raw/`, and each claim names the file, network call or bundle it came from. **Verified** means seen in a saved page, a live response or TCGplayer's own bundle. **Assumption** means not checked. See [tcgplayer-product-lookup.md](./tcgplayer-product-lookup.md) for URLs and product lookup.

## Fetching and blockers

- **Headless Chromium renders the page fine (verified).** There was no bot challenge, captcha, cookie banner or modal on any load (0 matches for `onetrust|cookie` in all saves). Listings were in the DOM about 10 s after `domcontentloaded`.
- **The page rewrites the URL with a language filter (verified).** `/product/524817/x` → `/product/524817/x?Language=English`. Product 80526 (0 listings) → `?Language=all`. The slug isn't checked.
- **Signed-out users see at most 5 Latest Sales (verified).** The modal shows a `Sign In to View More Sales` button instead of `Load More Sales` whenever `!isLoggedIn` (`showSignIn()` in `ProductDetails-DSjrgF2V.js`). A content script in the user's signed-in browser should get `Load More Sales`, 25 rows per click (`Es=25` in `index-iVg5nyjt.js`). **Assumption:** signed-in markup is the same table, but it wasn't captured.

Saved pages:

| File | State |
|---|---|
| `p524817-loaded.html` | Ash Blossom QCSR, page as loaded: 10 listings of 61, "3 Month Snapshot", no sales rows |
| `p524817-sales-modal.html` | Same, after clicking `View More Data`: modal with 5 Latest Sales and `Sign In to View More Sales` |
| `p524817-listings-page2.html` | After clicking pagination `2` (URL gains `&page=2`) |
| `p524817-listings-page3-direct.html` | Loaded directly with `?Language=English&page=3`. Has a custom listing (photos) |
| `p453851-loaded.html` | Accesscode Talker Starlight: 38 listings, 4 pages |
| `p80526-zero-listings-loaded.html` | Fish Depth Charge (Blue), Duelist League Promo: 0 listings, `No Listings Available` |
| `p80526-zero-listings-sales-modal.html` | Same, modal open: 3 sales from `8/11/26` |

## Listings: page structure

- **List (verified, all files):** `.product-details__listings-results > section.listing-item`, 10 per page. The buy box `.spotlight` / `.product-details__spotlight` repeats the cheapest listing ("Sold by Solo Gaming") but is **not** a `section.listing-item`. Select inside `.product-details__listings-results` so you don't count it twice.
- **Default filter (verified):** `Language=English` only. Condition and printing are unfiltered. The filter chip is `.filter-bubbles__bubble` "English", and the `All Filters1` button shows the count. The page request body was `{"filters":{"term":{"sellerStatus":"Live","channelId":0,"language":["English"]},…},"from":0,"size":10,"sort":{"field":"price+shipping","order":"asc"}}`. A product with no English listings defaults to `Language=all`.
- **Default sort includes shipping (verified):** `Sort By` options are `Price + Shipping` (`price+shipping`, default) and `Item Price Only` (`price`). Page 2 shows `$42.81 + $1.19 Shipping` between two `$44.00 Shipping: Included` rows. Sort and page size (`10 | 25 | 50`, default 10) are kept in a `product-display-settings` store, not in the URL (`fa()` in `ProductDetails-DSjrgF2V.js`). **Assumption:** a user who changed them will see different defaults.
- **Pagination (verified):** `.tcg-pagination[data-testid=details-pagination] .tcg-pagination__pages a` (`role=link`, the active page has `aria-current=true`). Clicking `2` adds `&page=2` and requests `from:10`. A direct load of `?page=3` requested `from:20` (`p524817-listings-page3-direct.html`). There's no "load more" for listings.
- **Counts (verified):** `.horizontal-filters-bar__right__sorting` → `61 Listings As low as $40.98` (the count respects the filters). `.view-all-listings__other-listings` → `View 61 Other Listings`. With no listings: `No Listings Available` (`listingsAvailable()`; `1,000+` above 1000).
- **URL filters (verified, `ProductDetails-DSjrgF2V.js`):** the page reads `query.Language` (pipe-separated, e.g. `English|Japanese`, or `all`), `query.Printing`, `query.Condition`, `query.direct` and `query.page`. **Assumption:** `Printing`/`Condition` use the same pipe format (not tried).

## Listings: selector table

Relative to one `section.listing-item` (`p524817-loaded.html` unless noted).

| Field | Selector / source | Example | Notes |
|---|---|---|---|
| Stable ID | `section.add-to-cart[data-testid]` → strip `AddToCart_` | `AddToCart_7512666-3477adeb` | `<productConditionId>-<sellerKey>`, with `-<listingId>` added for custom listings: `AddToCart_7512665-796b3365-2630183` (page3). Same value in `button#btnAddToCart_…`. Built by `uniqueId()` in `prepareSellerCountryFilterForIdentity-DzAPVzn0.js`. The productConditionId is the SKU (one per condition, printing and language) |
| Price | `.listing-item__listing-data__info__price` | `$40.98` | Item price only. A non-USD seller adds `span.listing-item__currency` |
| Shipping | `.listing-item__listing-data__info__shipping-message` text | `Shipping: Included` / `+ $0.99 Shipping` | See shipping formats below |
| Condition | `h3.listing-item__condition` text | `Lightly Played 1st Edition` | Spans: condition, then ` <printing>` (left out when `Normal`), then ` - <language>` (left out when English) |
| Quantity | `[data-testid=availableTotalQuantity]` | ` of 3` | Parse `/of (\d+)/`. The `<select>` options run 1..N too |
| Seller name | `a.seller-info__name` | `Solo Gaming` | |
| Seller key | `a.seller-info__name[href]` | `/sellers/Solo-Gaming/3477adeb` | The last path segment is the `sellerKey`. The numeric `sellerId` exists only in the API |
| Rating / sales | `.seller-info__rating` spans | `100% ` / ` (4789 Sales) ` | Also `50000+`. The tooltip text "Seller feedback rating…" is in the same node |
| Gold Star | `img[alt="Gold Star Seller"]` in `.seller-info__content` | | API `goldSeller` |
| Hobby shop | `img[alt="Certified Hobby Shop"]` | The Side Deck | API `verifiedSeller` (`sellerIsCertifiedHobbyShop`). Others seen: `WPN Seller`, `GEM Seller` |
| Direct | `img.listing-item__icon` (`src=…/img/direct-icon-new.svg`) | none seen live | From the bundle template (`n.listing.directListing?…img…listing-item__icon`). **Trap:** the tooltip text "This item will be fulfilled by TCGplayer Direct" is in **every** listing (hidden `.is-disabled` overlay). Don't match on it |
| Photos (custom) | `.listing-item__listing-data__listo` | page3 | Title in `.listing-item__listing-data__listo__title > div` (first text node): `Korean Ash Blossom Alt Art Quarter Century Rare`. Link `a.listing-item__listing-data__listo__see-more[href]` = `/product/listing/hqmlWox8bHA1/<slug>`. Up to 2 `img.listo-thumbnail__image` |

**Custom listings can be a different card (verified).** Of 3 custom listings on 524817, one is a Korean `RC03-KRO10` alt-art, one is `CGC 8.5` graded and one is a plain listing (API `customData.title`). The title is the only clue, so flag custom listings instead of treating them as ordinary copies.

### Shipping formats (verified, `ShippingMessages` component `data-v-19e6da8d` in `Breadcrumbs-BMN-dlj3.js`)

In order of precedence:
1. Direct and US: `Free Shipping` or a link `Free Shipping on Orders Over $<directThreshold>` (`a.free-shipping-direct`).
2. Direct and a non-Direct country: `Available via <Direct> <img.direct-icon>`.
3. Seller already in cart, or `shippingPrice` 0/missing: ` Shipping: ` + `a.link-default` `Included` (seen as `Shipping: Included`).
4. Otherwise ` + $1.00 Shipping `. If `sellerShippingPrice === 0`, it's followed by `a.free-shipping-over-min` `Free Shipping on Orders Over $<freeShippingThreshold>`.

Parse rule: `/\+\s*\$([\d,.]+)\s*Shipping/` → amount; `Included` or `Free Shipping` → 0. Seen live: `Shipping: Included`, `+ $0.99 Shipping`, `+ $1.19 Shipping`, `+ $1.49 Shipping`, `+ $1.99 Shipping`, `+ $1.00 Shipping`. The Direct and "Orders Over" variants weren't seen live.

## Latest Sales

- **Opener (verified):** `.price-guide__latest-sales .modal__activator` (`role=button`, text `View More Data`) in the "3 Month Snapshot" box. On page load that box shows only `Low Sale Price: $34.00 High Sale Price: $45.99 Total Sold: 17 Avg. Daily Sold: -` (`table` inside `section.data-table`). Sales rows exist **only after the modal opens** (`.latest-sales-table__tbody` is absent from `p524817-loaded.html`), even though the page fetches them on load.
- **Modal (verified, `p524817-sales-modal.html`):** `.modal__content .sales-history-snapshot`. The header `.sales-history-snapshot__main-header` holds the price points (`Market Price$49.84`, `Most Recent Sale$41.45`, `Listed Median`, `Current Quantity:121`, `Current Sellers:60`). The sales are in `.sales-history-snapshot__latest-sales__table table.latest-sales-table`.
- **Sales filter defaults to the page's Language (verified):** a `Filter Sales 1` badge and an `English` chip. The request was `{"conditions":[],"languages":[1],"variants":[],"listingType":"All","limit":25}`. 80526 (`Language=all`) sent `"languages":[]`.
- **More (verified, bundle):** `button.sales-history-snapshot__load-more__button`. Signed out its text is `Sign In to View More Sales`; signed in it is `Load More Sales` (`loadMore()` → `getMoreSalesHistoryV2`, body adds `offset`, `limit:25`, `time`). It's hidden when the response `nextPage` is `""`.

| Field | Selector | Example | Notes |
|---|---|---|---|
| Row | `tbody.latest-sales-table__tbody > tr` | | No id or key on the row (Vue `key` is the index) |
| Date | `td.latest-sales-table__tbody__date` | `10/20/26`, `8/11/26` | `localizedShortDateAndYear(orderDate,"/")` = `new Date(orderDate)` in **browser local time**, formatted `${M}/${D}/${YY}` with no zero padding (`w=(e,t,n)=>…` in `src-DhHPfYzk.js`). There's no time of day in the DOM |
| Condition | `td.latest-sales-table__tbody__condition .tcg-tooltip__toggle` first text node | `NM 1st Edition` | Abbreviated (`NM`, `LP`, `MP`…) + variant (left out when `Normal`) + language (left out when English). Full text in the tooltip `.tcg-tooltip__content span`: `Near Mint 1st Edition` (non-English: `… - Japanese`). Off desktop there's no tooltip, just a `div` |
| Qty | `td.latest-sales-table__tbody_quantity` (single underscore) | `3` | |
| Price | `td.latest-sales-table__tbody__price` | `$43.42` | `purchasePrice` per unit. **Shipping isn't shown** (it's only in the API) |
| Photo sale | `.latest-sales-table__tbody__condition__custom-listing` | none seen live | Only when `listingType==="ListingWithPhotos"` and there's a title. A link to `/product/listing/<id>/…`, an image icon and the listing title (`…__custom-listing__title` on mobile) |

**Telling sales apart (verified):** rows have no ID, and two sales can have the same date, condition, qty and price. Build a key from `(date, condition, qty, price, row index within that date)`, or use the API `orderDate` (ms precision, e.g. `2026-10-20T23:38:21.117+00:00`).

## Network fallback

Seen in the page's own requests (`p524817-*`). All of them sent no cookies from curl.

- **Listings: `POST https://mp-search-api.tcgplayer.com/v1/product/<id>/listings` (verified).** The body is shown above (`from`, `size`, `sort`, `filters.term.language|condition|printing|listingType`). curl with **a browser User-Agent → 200**, with no cookies, `Origin` or `mpfev`. **curl's default UA or `-A node` → 403** (nginx "403 Forbidden"), unlike `/v1/search/request`. `listingType:["custom"]` returned the 3 photo listings. Response, trimmed: `results[0].totalResults: 61`, `aggregations.{condition,quantity,listingType,language,printing}`, `results[]: {listingId: 890117354.0, productConditionId: 7512666.0, sellerKey: "3477adeb", sellerId: "39121", sellerName: "Solo Gaming", condition: "Lightly Played", printing: "1st Edition", language: "English", price: 40.98, sellerPrice: 40.98, shippingPrice: 0.0, sellerShippingPrice: 0.0, quantity: 1.0, goldSeller: true, verifiedSeller: false, directListing: false, listingType: "standard"|"custom", sellerPrograms: [...], customData: {images, title, description, linkId}}`.
- **Latest sales: `POST https://mpapi.tcgplayer.com/v2/product/<id>/latestsales?s=<salt>&b=<nonce>&mpfev=5617` (verified).** `s` comes from `GET https://mpapi.tcgplayer.com/v2/ProofOfWork/Salt` (`{"salt":"…","expiration":"…"}`) and `b` from a client-side proof-of-work (`getValidSalt`/`getNonce` in `index-iVg5nyjt.js`). Even so, curl with a browser UA and **no** `s`/`b` → 200, while curl's default UA → 403. Signed out, `limit:25` and `offset:5` both returned the same 5 rows (`totalResults: 5`, `nextPage: ""`). Row: `{condition: "Near Mint", variant: "1st Edition", language: "English", quantity: 3, title: "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)", listingType: "ListingWithoutPhotos", customListingId: "0", purchasePrice: 43.42, shippingPrice: 0.0, orderDate: "2026-10-20T23:38:21.117+00:00"}`. The page also sends a `limit:1` call filtered to the buy-box SKU (`conditions:[2], variants:[8]`) for "Most Recent Sale".
- **Assumption / risk:** these are undocumented internal APIs, and the proof-of-work suggests TCGplayer may enforce `s`/`b` later. The DOM is the primary source, and the API is only a fallback. Respect `Crawl-Delay: 10`.

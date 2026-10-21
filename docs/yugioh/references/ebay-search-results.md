# eBay search results DOM

How a content script can read each result on an eBay US search page (`https://www.ebay.com/sch/i.html?...`). Checked live on 2026-10-20 with `curl`. The raw HTML is saved in `.scratch/yugioh-tracker/ebay-raw/`, and each claim below names the file it came from. **Verified** means seen in a saved page. **Unverified** means it wasn't seen, so treat it as a guess.

This is the server-rendered HTML that eBay sends before any JavaScript runs. A real browser runs scripts afterwards, which may change some attributes, for example swapping lazy image `src` values.

**Signed-out pages differ from what a signed-in browser shows (corrected 2026-10-20).** Every page here was a signed-out `curl` fetch, and those Newly Listed pages held only one or two auctions. Looking at Newly Listed in a signed-in browser, the user sees auctions with "4d 12h left"-style time left, and the dev data has end times for 6 of the 9 auctions captured. So **don't read "no time left on Newly Listed" below as a rule.** It is only what these signed-out pages showed. The reader looks for time left on every card, whatever the sort (see "Time left on any layout").

## Fetching

- **Plain `curl` gets a 403 (verified).** `curl -A "<Chrome UA>" -H 'Accept-Language: en-US'` with no other headers returned `403` and a 1.8 KB "SORRY Something went wrong on our end" page. It was not a "Pardon our interruption" captcha.
- **Browser-like headers plus a cookie jar get a 200 (verified).** This worked: first `GET https://www.ebay.com/` with `-c/-b jar`, then search with `--http2 --compressed`, the Chrome `sec-ch-ua*` headers, `Sec-Fetch-Dest: document`, `Sec-Fetch-Mode: navigate`, `Upgrade-Insecure-Requests: 1`, and `Referer: https://www.ebay.com/`. Each search page came back as about 180 KB compressed, or 1.2 to 1.7 MB of HTML.
- **Sold and completed searches need sign-in (verified).** Any URL with `LH_Sold=1` returned `302` to `https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&siteid=0&ru=<search url>&sgfl=srch`. This happened with or without `LH_Complete=1` and with or without a category path. `LH_Complete=1` on its own returned `403`. WebFetch also got `403`. Third-party write-ups say eBay began redirecting signed-out sold searches to sign-in in July 2026 ([openwebninja](https://www.openwebninja.com/blog/how-to-get-ebay-sold-and-completed-listings), [Apify actor notes](https://apify.com/cmfapps/ebay-sold-search.md)). **A content script running in the user's signed-in browser should still see sold results, but no sold markup was captured for this doc.**

Saved pages:

| File | URL | Notes |
|---|---|---|
| `active.html` | `https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10` | "Sort: Time: newly listed", 251 results, **grid** (`s-card--vertical`) |
| `active-list.html` | `…?_nkw=RA01-EN008&_sop=10&_dmd=1` | Same search in **list** view (`s-card--horizontal`), with seller rows |
| `multi.html` | `…?_nkw=%28RA01-EN008%2CMP23-EN001%29+-super&_sop=10` | 296 results. eBay chose list view for this one with no `_dmd` |
| `auctions.html` | `…?_nkw=quarter+century+secret+rare&LH_Auction=1&_sop=1` | "Sort: Time: ending soonest", 200 results |
| `ending-soon.html` | `…?_nkw=quarter+century+secret+rare&_sop=1` | Auctions and Buy It Now mixed |
| `range.html` | `…?_nkw=yugioh+quarter+century+secret+rare+choose+your+card&_sop=10` | 9 results, then "Results matching fewer words". Has price ranges |
| `fewer.html` | `…?_nkw=RA01-EN008+ash+blossom+psa+10+korean+asia+misprint&_sop=10` | 14 results |
| `worldwide.html` | `…?_nkw=RA01-EN008&_sop=10&LH_PrefLoc=2` | Worldwide filter. Prices still in USD |
| — | `…&LH_Sold=1&LH_Complete=1&_sop=13` | Not saved, because it redirects to sign-in (see above) |

## Page structure

- **Results list (verified, all files):** `ul.srp-results` with `srp-grid` (grid) or `srp-list` (list) → `li.s-card`. No page used the old `li.s-item` markup (0 matches in every file).
- **Layout modifier (verified):** a grid card is `li.s-card.s-card--vertical`, and a list card is `li.s-card.s-card--horizontal`. Both have `s-card--pagination-below`. The inner content is the same, except that seller rows appear only in list view (see below). `_dmd=1` forces list view (`active-list.html`). Otherwise eBay chose the view itself: it returned grid for `active.html` and list for `multi.html` in the same session.
- **"Shop on eBay" placeholder (verified, all files):** two `li.s-card` elements per page sit **before** `ul.srp-results`, inside a hidden `div.s-clipped[aria-hidden=true]`. Each has title `Shop on eBay`, `data-listingid=2500219655424533`, `href=https://ebay.com/itm/123456`, and an image from `ir.ebaystatic.com`. Selecting `ul.srp-results > li.s-card` skips them. As a fallback, also skip any card whose `data-listingid` is `2500219655424533` or whose title is `Shop on eBay`, in case script moves them later.
- **Other rows inside the list (verified):** these are `li.srp-river-answer.srp-river-answer--<KIND>` and are not cards:
  - `--REWRITE_START` contains `<span class=BOLD>Results matching fewer words</span>` (`range.html`: 9 exact cards come before it and 57 after). **Stop reading at this row**, or mark every card after it as a loose match.
  - `--RIGHT_ALIGNED_MESSAGE` ("Tell us what you think"), `--BASIC_PAGINATION_V2` (pagination, at the end).
  - `--NAVIGATION_ANSWER_COLLAPSIBLE_CAROUSEL` ("Popular Filters" chips) sits above the list, not inside it.
  - **Unverified:** in-list ad or carousel answers. None appeared in these pages.
- **Sponsored (verified, but how eBay displays it was not confirmed).** Every card has the same footer: `div.s-card__sep > b[aria-labelledby="<id1> <id2>"]`, with a CSS `background-image` SVG that draws "Sponsored" (using look-alike characters such as `Sрons⁧ored`), plus a decoy `<span aria-hidden=true style="color: transparent !important">derosnopS</span>`. The `aria-labelledby` ids point into a page-level `<div hidden>` such as `<div id=s-cg2u024>Sponsored</div><div id=s-y2mk108>Sponsored</div><div id=s-dws0769>Sponsored</div><div id=s-ieqz937></div>` (`active.html`). Some ids don't exist at all. The ids are random on every page load. A card is sponsored when the referenced elements' combined text is "Sponsored". The `b` element's accessible name gives the same answer. By that rule, 39 of 60 real cards in `active.html`, 29 of 60 in `multi.html` and 34 of 60 in `auctions.html` are sponsored. Sponsored cards are still real listings, in date order on the newly-listed sort, so read them and only flag them. Don't match the text "Sponsored" or "derosnopS" inside a card, because every card has both.

## Selector table

Everything below is relative to one `li.s-card`.

| Field | Selector / source | Verified in | Notes |
|---|---|---|---|
| Item ID | `li.s-card[data-listingid]` | all | Present on all 456 cards. Also equals `parseInt(li.id.slice(4), 16)` (`id=item42f9c19d0b` → `287658056971`), on all 440 real cards (placeholders have an empty `id`) |
| URL | `a.s-card__link[href]` (two per card: the image link and the title link) | all | `https://www.ebay.com/itm/<id>?_skw=…&itmmeta=…&hash=item<hex>:g:<imgId>&itmprp=…`. Rebuild a clean URL as `https://www.ebay.com/itm/<id>` |
| Title | `.s-card__title > span.su-styled-text.primary` | all | `.s-card__title` also holds `span.clipped` "Opens in a new window or tab" and, sometimes, `span.s-card__new-listing` "New Listing". Read the `primary` span, not `.textContent` of the whole title |
| "New Listing" | `.s-card__title > span.s-card__new-listing` | `multi.html` (1 card) | Only on very fresh listings (`Oct-19 19:50`). It sits outside the title span, so there's no prefix to strip if you read the span above |
| Image | `img.s-card__image` → `data-defer-load` first, then `src` | all | Cards near the top have `src=…/s-l500.webp`. Later cards have `src=…/s-l140.webp` and `data-defer-load=…/s-l500.webp`. `alt` is the title. You can raise the size: `s-l1600.webp` and `s-l1600.jpg` return 200 (checked with curl on `8icAAeSwe2xq1eHW`) |
| Condition | `.s-card__subtitle > span` | all | `Pre-Owned`, `Brand New`, `New (Other)` |
| Price | `span.s-card__price` (first match) | all | Classes `su-styled-text primary bold large-1 s-card__price` |
| Was-price | `span.su-styled-text.strikethrough`, in the same row as the price | `range.html` | `$3.40` then `$5.00` (struck through) |
| Attribute rows | `.su-card-container__attributes__primary > .s-card__attribute-row` | all | Each row is plain text in a `span.su-styled-text.secondary`. Tell rows apart by their text (see formats below), not by position |
| Listing date | `.su-card-container__attributes__secondary > .s-card__attribute-row:first-child span` | `active.html`, `range.html`, `multi.html` | Only on the newly-listed sort |
| Seller | `.su-card-container__attributes__secondary .s-card__attribute-row` with two `span.su-styled-text.primary.large` | `active-list.html`, `multi.html` | **List view only**. Grid view (`active.html`) has none (0 matches) |
| Auction time left | `.s-card__time > .s-card__time-left`, else any card text in a time-left format | `auctions.html`, `ending-soon.html` (the class) | Has a modifier `s-card__time--soon` or `s-card__time--urgent`. Signed-in Newly Listed shows time left too, but the layout wasn't saved (see "Time left on any layout") |
| Badges | `.s-card__program-badge-container--<kind>` | various | `--topRatedSeller` (icon only, `aria-label="Top Rated Plus"`, so its row text is `''`), `--authenticityGuarantee` "Authenticity Guarantee" |
| Caption | `.s-card__caption` (above the title link) | `active.html` etc. | Only seen holding `<span class="signal signal--trustworthy">NEW LOW PRICE</span>`. **Unverified:** the sold date probably goes here on sold pages |
| Sponsored | `.s-card__sep > b[aria-labelledby]` → resolve the ids | all | See Page structure |

**Stable vs hashed.** These look stable: BEM classes (`s-card`, `s-card__*`, `su-card-container__*`, `su-styled-text`), `srp-results`, `srp-river-answer--*`, and `data-listingid`. These change on every page load: the `s-xxxx000` ids, `data-s-<hash>` attribute names (`data-s-ieqz937`), Marko keys (`s0-0-1-46-…`) and `data-marko-key`. Never select on those. The styling classes `primary`, `secondary`, `bold`, `large` and `large-1` are design tokens. They work for telling the price apart (`s-card__price`) but are shared by many rows.

## Text formats (real examples)

All prices on ebay.com were in USD, including sellers in the UK, Canada, Australia, Greece and Guam, and on the worldwide filter (`worldwide.html`). **No foreign-currency strings appeared** (no `C $`, `GBP` or `EUR` in any file). Still, parse the currency prefix in case one turns up. **Unverified:** foreign-currency display.

| Field | Format | Examples (file) |
|---|---|---|
| Price | `$N.NN`, with thousands commas | `$19.99`, `$114.25` (`active.html`), `$2,499.00` (`fewer.html`) |
| Price range (variation listing) | `$A to $B` in one `s-card__price` span | `$0.99 to $10.00`, `$1.89 to $109.99` (`range.html`) |
| Discount | price span, spacer, strikethrough span | `$3.40` + `$5.00` (`range.html`) |
| Format | its own row | `Buy It Now`, `or Best Offer` (`active.html`) |
| Auction (newly-listed sort, signed out) | `N bids` / `N bid` row, with no time left in these signed-out pages | `0 bids` (`active.html`, item 900018651245). A signed-in browser shows time left here too (user report, unverified markup) |
| Auction + Buy It Now | two `s-card__price` rows | `$1.19`, `0 bids`, `$3.25`, `Buy It Now` (`active.html`). **Read the first price as the current bid and the second as the Buy It Now price** |
| Auction (ending-soonest sort) | `N bids · Time left Xd Yh` in one row. The `·` is its own span, and "Time left" is `span.clipped` | `0 bids · Time left 4m`, `2 bids · Time left 10m`, `0 bids · Time left 1h 56m`, `1 bid · Time left 1d 2h` (`ending-soon.html`) |
| Time-left units | `Nd Nh`, `Nd`, `Nh Nm`, `Nh`, `Nm` | from the tally across `auctions.html` |
| End clock time | **not present** in any saved file. The reader still accepts `Ending today 5:12 PM`, `Ending tomorrow 9:05 AM` and `Ends Sat, 5:12 PM` | — |
| Auction with Best Offer | both rows appear | `0 bids · Time left 5m`, then `or Best Offer` (`auctions.html`, item 940016620219) |
| Shipping | `+$N.NN delivery`, `Free delivery`, `+$N.NN shipping estimate`, `Free delivery in 2-4 days`, `+$N.NN delivery in N-N days`, `Free local pickup` | `+$4.99 delivery`, `+$25.88 shipping estimate` (`active.html`). "Shipping not specified" **not seen** |
| Import fees (extra row) | `Import fees due prior to delivery`, `Import fees paid at checkout`, `Customs services and international tracking provided` | `active.html`, `multi.html` |
| Location | `Located in <Country>` | `Located in United States`, `Located in United Kingdom`, `Located in Canada`, `Located in Guam` (`active.html`). Present on every real card in every file. `from Japan` **not seen** |
| Listing date | `Mon-D HH:MM` (24-hour, **no year**, no zero padding on the day) | `Oct-19 02:24`, `Oct-9 14:17`, `Sep-30 17:06` (`active.html`) |
| Seller (list view) | `<name> ` + `<pct>% positive (<count>)` as two spans | `cardboardscouts ` / `99.9% positive (1.7K)` (`multi.html`). Counts look like `(12)`, `(1.7K)`, `(12.3K)` |
| Other rows to ignore | marketing text | `Free returns`, `15% off $15+`, `Save up to 25% when you buy more`, `Buy 1, get 1 free with coupon`, `69 watchers`, `Last one`, `Almost gone`, `In the PSA Vault`, `Authenticity Guarantee` |

**Listing date has no year.** `range.html` (newly listed) goes `Sep-9 11:09`, `Aug-15 19:41`, `Jan-11 08:05`, `Apr-18 23:40`, `Nov-27 14:38`… The order is newest first, so Apr-18 and Nov-27 must be from earlier years. To get the year, walk down the list and subtract a year each time the month goes up. The page shows no timezone. **Unverified:** whether the time is the viewer's local time or US Pacific time.

**Which rows appear depends on the sort, and on sign-in.** In these signed-out pages, newly-listed cards (`_sop=10`) have a listing-date row and auctions show only `N bids`. Ending-soonest cards (`_sop=1`) have `Time left` and no listing date (0 date rows in `auctions.html` and `ending-soon.html`). A signed-in browser shows time left on Newly Listed auctions as well (user report, 2026-10-20). That layout wasn't saved, so the reader doesn't rely on one.

## Time left on any layout

The reader (`ebayEndsAt` in `extensions/rym-release-scraper/ebay-reader.js`) takes `.s-card__time-left` when a card has it. Otherwise it searches the card's text, leaving out the title and `aria-hidden` decoys, for:

| Format | Read as |
|---|---|
| `4d 12h left`, `12h 30m left`, `45m left` | now + the duration |
| `Time left 1d 2h` (label and value in separate spans, no class) | now + the duration |
| `Ends in 3h`, `Ending in 45m` | now + the duration |
| `Ending today 5:12 PM`, `Ends tomorrow 9:05 AM` | that clock time today or tomorrow, in the viewer's time |
| `Ends Sat, 5:12 PM` | the coming Saturday at that time |

A unit must be a bare letter (`4d`, not `4 days`), so `Free delivery in 2-4 days` is never read as an end time. Tests: `tests/fixtures/ebay-time-left-layouts.html`. That fixture is **reconstructed**: real list-view card markup with each format dropped in. **To verify against the real thing,** save a signed-in Newly Listed page with auctions as `.scratch/yugioh-tracker/ebay-raw/newly-listed-signed-in.html` ("Save Page As → HTML only"), and trim it into a fixture.

Each automated run counts the matched running auctions whose page showed no time left. Settings → Automated runs shows the count ("2 auctions with no end time"). A count that keeps climbing means a layout the reader doesn't know yet.

## Sold results (unverified)

None were captured, because the request redirected to sign-in. From memory of the pre-2026 `s-card` layout, expect: a `.s-card__caption` reading like `Sold  Oct 18, 2026` (with a double space), the price shown in a "positive" (green) style, and, for accepted offers, a struck-through list price with the sold price beside it. **Check all of this against a page saved from a signed-in browser before relying on it.** The quickest way is "Save Page As → HTML only" from the user's own browser into `ebay-raw/sold.html`.

## Gotchas

- Read the title from the `primary` span. The title block also holds "Opens in a new window or tab" (`span.clipped`) and possibly "New Listing".
- Lazy images: `src` can be the 140 px thumbnail, so prefer `data-defer-load`.
- Every card carries the hidden "Sponsored" footer. Use the `aria-labelledby` lookup instead.
- Two placeholder cards with fake id `2500219655424533` come before the real results.
- Stop reading at `li.srp-river-answer--REWRITE_START` ("Results matching fewer words").
- Grid view and list view differ only in seller rows. Don't depend on a seller being present.
- The URL's `_sop`/`_skw`/`itmmeta`/`itmprp` params are tracking. Use `data-listingid` for identity.
- A page can contain 120 or 240 results (the "Items Per Page" control). The first page holds 60 by default.

## Trimmed HTML

Active, grid view (`active.html`; tracking attributes, SVGs, comments and watch/similar buttons removed):

```html
<li class="s-card s-card--vertical s-card--pagination-below" id=item42f9c19d0b data-listingid=287658056971>
 <div class="su-card-container su-card-container--vertical">
  <div class=su-card-container__media>…<a class="s-card__link image-treatment" href=https://www.ebay.com/itm/287658056971?…>
   <img class=s-card__image data-defer-load=https://i.ebayimg.com/images/g/8icAAeSwe2xq1eHW/s-l500.webp src=https://i.ebayimg.com/images/g/8icAAeSwe2xq1eHW/s-l500.webp alt="Ash Blossom & Joyous Spring | FADED! | RA01-EN008 | Super Rare | NM | YuGiOh!"></a>…</div>
  <div class=su-card-container__content>
   <div class=su-card-container__header>
    <a class=s-card__link href=https://www.ebay.com/itm/287658056971?…><div role=heading aria-level=3 class=s-card__title>
     <span class="su-styled-text primary default">Ash Blossom &amp; Joyous Spring | FADED! | RA01-EN008 | Super Rare | NM | YuGiOh!</span>
     <span class=clipped>Opens in a new window or tab</span></div></a>
    <div class=s-card__subtitle-row><div class=s-card__subtitle><span class="su-styled-text secondary default">Pre-Owned</span></div></div>
   </div>
   <div class="su-card-container__attributes su-card-container__attributes--has-secondary">
    <div class=su-card-container__attributes__primary>
     <div class=s-card__attribute-row><span class="su-styled-text primary bold large-1 s-card__price">$19.99</span></div>
     <div class=s-card__attribute-row><span class="su-styled-text secondary large">Buy It Now</span></div>
     <div class=s-card__attribute-row><span class="su-styled-text secondary large">Free delivery</span></div>
     <div class=s-card__attribute-row><span class="su-styled-text secondary large">Located in United States</span></div>
    </div>
    <div class=su-card-container__attributes__secondary>
     <div class=s-card__attribute-row><span class="su-styled-text secondary bold large">Oct-19 02:24</span></div>
    </div>
   </div>
   <div class=su-card-container__footer>…<div class=s-card__sep><b aria-labelledby="s-fwoj224 s-h65v810" role=heading aria-level=6 style="background-image:url(data:image/svg+xml;base64,…)"><span aria-hidden=true style="color: transparent !important">derosnopS</span></b></div>…</div>
  </div>
 </div>
</li>
```

List view with New Listing and seller (`multi.html`, header and secondary only):

```html
<div role=heading aria-level=3 class=s-card__title><span class=s-card__new-listing>New Listing</span><span class="su-styled-text primary default">Libromancer Geek Boy MP23-EN001 25th Anniversary Yu-Gi-Oh 1st Edition NM/M</span><span class=clipped>Opens in a new window or tab</span></div>
…
<div class=su-card-container__attributes__secondary>
 <div class=s-card__attribute-row><span class="su-styled-text secondary bold large">Oct-19 19:50</span></div>
 <div class=s-card__attribute-row><span class="su-styled-text primary large">cardboardscouts </span><span class="su-styled-text primary large">99.9% positive (1.7K)</span></div>
</div>
```

Auction, ending-soonest sort (`auctions.html`, item 940016620219, attributes only):

```html
<div class=s-card__attribute-row><span class="su-styled-text primary bold large-1 s-card__price">$299.00</span></div>
<div class=s-card__attribute-row><span class="su-styled-text secondary large">0 bids</span><span class="su-styled-text secondary small"> · </span><span class="s-card__time s-card__time--urgent"><span class=clipped>Time left</span><span class=s-card__time-left>5m</span></span></div>
<div class=s-card__attribute-row><span class="su-styled-text secondary large">or Best Offer</span></div>
<div class=s-card__attribute-row><span class="su-styled-text secondary large">+$5.40 delivery</span></div>
<div class=s-card__attribute-row><span class="su-styled-text secondary large">Located in United States</span></div>
<div class=s-card__attribute-row><div class="s-card__program-badge-container s-card__program-badge-container--authenticityGuarantee">…<span class="su-styled-text default">Authenticity Guarantee</span></div></div>
```

Sold card: none captured (see Sold results).

## Keyword syntax (checked 2026-10-21)

How eBay reads the `_nkw` keyword string. The live checks below were signed-out `curl` fetches using the recipe in "Fetching", with `_sop=10&_ipg=240` so every result fits on one page. The pages are saved in `.scratch/yugioh-tracker/ebay-raw/syntax-2026-10-21/`, each next to a `.url` file holding the exact URL. None of them had a "Results matching fewer words" row, so every card counted was an exact match. The home-page `GET` returned `403`, but the cookie jar still let the searches through. The fourth search got the `403` "Something went wrong" page (`d-short-tokens-403.html`), so live checking stopped there.

**Sources.** eBay's buyer help page on search tips could not be found. `https://www.ebay.com/help/buying/search-tips/search-tips?id=4011` serves an unrelated page about seller problems, and community threads say eBay removed its Boolean-search help text. The legacy Finding API keyword guide (`developer.ebay.com/api-docs/user-guides/static/finding-user-guide/finding-searching-by-keywords.html`) now returns `404`. The only first-party text found is the Browse API `q` parameter reference ([developer.ebay.com/develop/api/buy/browse_api.md](https://developer.ebay.com/develop/api/buy/browse_api.md), saved as `browse_api.md`). It documents the API, not the website, but it describes the same operators:

> When successive keywords are separated by a space, the list of keywords is processed as an `AND` request. … When successive keywords are comma-separated and surrounded by a single pair of parentheses … the list of keywords is processed as an `OR` request. … The `*` wildcard character is **not** allowed in this field. … Strings longer than 100-characters are truncated.

The 100-character limit is documented for the API only. **Unverified** on the website, but keep packed `_nkw` strings under 100 characters to be safe.

Searches run:

| File | `_nkw` | Results |
|---|---|---|
| `a-codes.html` | `(TDGS-EN040,TDGS-EN041)` | 142 |
| `b-codes-and-rarity.html` | `(TDGS-EN040,TDGS-EN041) (ultimate,utr)` | 43 |
| `c-quoted-phrase-in-or.html` | `(TDGS-EN040,TDGS-EN041) (ghost,"ultimate rare")` | 86 |
| `d-short-tokens-403.html` | `(TDGS-EN040,TDGS-EN041) (ur,sr)` | `403`, not checked |

### 1. Two OR groups in one query are ANDed: Verified

`b` returned 43 results. In all 43 titles, one of the two codes appears and `ultimate` or `utr` appears as a whole word. In the 142 titles of `a`, 43 have `ultimate` or `utr` as a whole word, so `b` is exactly `a` filtered by the second group. This also agrees with the Browse API text above: a space means AND, and parentheses with commas mean OR.

### 2. Quotes work inside an OR group: Verified

`c` returned 86 results, and every title contains `ghost` or the adjacent phrase `ultimate rare`. In `a`, 86 titles match that rule. Three titles in `a` have "Ultimate" without "Rare" right after it ("…Unl Ed Ultimate TDGS-EN041…", twice "…Duelist Genesis Holo Ultimate"), and all three are missing from `c`. So a quoted item inside `( , )` is matched as a phrase, not as two loose words. Only a two-word phrase was tested. A single quoted token such as `"25th"`, as in `(quarter,qcsr,"25th")`, was not tested: **Unverified**, but nothing suggests eBay would handle it differently.

### 3. Short tokens and `-word` with a group

- **Whole-word vs substring matching for `ur` / `sr`: Unverified.** The test search got the `403`. Here is what the saved pages do show:
  - `b` behaves like whole-word matching on `ultimate` and `utr` (see 1).
  - In `a`, the only title with `UR` as a word is "Stardust Dragon - TDGS-EN040 - Ultra Rare - Unlimited - UR - …". Two titles hold `ur` only inside "Euro" (both Ultimate Rare listings), so `(ur,sr)` against those two codes would tell substring matching apart. Re-run it when allowed.
- **A hyphen splits a token (Verified, `multi.html` from 2026-10-20).** `(RA01-EN008,MP23-EN001) -super` matched "Yugioh Ash Blossom & Joyous Spring RA01 EN008 Quarter Century Secret Rare 1st Ed", which has a space where the query has a hyphen. So eBay breaks `RA01-EN008` into `RA01` and `EN008`. If the website matches on whole tokens, `sr` would match "SR" in "SR01-EN001" only when the title also has `SR` as a separate word, or by a quirk of how the hyphen is split. **Unverified.**
- **Minus combined with an OR group: Verified (`multi.html`).** In all 60 exact titles there, no title contains "super", and every title contains one of the codes. `-ultra` next to a required group such as `(ultimate,utr)` was not run. **Unverified**, but it is the same pattern.

### 4. Stemming or fuzzy matching of `(ultimate,utr)` to "Ultra": Verified that it does not happen

In `a`, 37 titles have "Ultra" but neither `ultimate` nor `utr` (for example "Red Dragon Archfiend - TDGS-EN041 - Ultra Rare - Unlimited Edition"). None of them appear among the 43 results in `b`. So eBay did not stem or fuzzy-match `ultimate` or `utr` to "Ultra". This test does not show how eBay handles plurals: whether `rare` also matches "rares" is **Unverified**. A community thread and a third-party guide say any advanced operator (quotes, `-`, parentheses) turns off eBay's keyword expansion. Those are not first-party sources, so treat that claim as **Unverified**, but it is consistent with these results.

### What the app does with this

- A Search whose Printings all have one rarity, with at least one Overloaded set code, adds that rarity's OR group after the set codes: `(TDGS-EN040,TDGS-EN041) (ultimate,utr) -ghost`. Per 1 and 4 this keeps only titles that say the rarity, without pulling in "Ultra" (`rarityTerms` in `src/lib/yugioh/searches.ts`).
- `ur` and `sr` are kept for Ultra and Super Rare even though whole-word matching is Unverified (3). Since the group is ANDed with the set codes, a substring hit can only let in a Listing of a wanted set code, which title matching then sorts out.
- `"25th"` is left out of Quarter Century Secret Rare's group. The question isn't syntax: RA01–RA04 Super, Ultra and Secret Rare titles say "25th Anniversary" too, and a Search for a QCSR can't leave out `-secret`.
- 8 set codes plus a group and Exclusions run past 100 characters (about 120 for the Chaos Lightsworn Ultimate Rares). That limit is documented only for the Browse API. **Unverified** on the website; eBay returned the expected results for the 8-code Searches so far.


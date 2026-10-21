# TCGplayer product lookup

How to find a Printing's TCGplayer product, build its URL and image, from server code with plain `fetch`. Checked live on 2026-10-20 with `curl`. **Verified** means seen in a live response or in TCGplayer's own front-end bundle. **Assumption** means not checked. Supersedes the TCGplayer assumptions in [tcgplayer-ebay-links.md](./tcgplayer-ebay-links.md).

## Product page URL

- **Shape (verified):** `https://www.tcgplayer.com/product/<productId>/<slug>`, where `slug = <productLineUrlName>-<setUrlName>-<productUrlName>` (the three API fields below), each passed through the same function: `&`→`and`, `+`→`plus`, `%`→`pct`, punctuation `: ( ) [ ] ' " ! ? . / # * …` removed, whitespace runs → `-`, lowercased. Source: `https://www.tcgplayer.com/js/src-DhHPfYzk.js` (route builder `{name:"ProductDetails",params:{id, info:`${line}-${set}-${product}`}}`).
- **Checked against the sitemap (verified):** for 428 products from 10 searches, `"yugioh-" + kebab(setUrlName) + "-" + kebab(productUrlName)` equalled the URL in `https://www.tcgplayer.com/sitemap/yugioh.0.xml` / `yugioh.1.xml` in all 428 (0 mismatches).
- **Rarity is in the slug only when it's in the product name (verified).** TCGplayer gives each rarity of one set code its own product. One of them (usually the lowest) gets the bare name, and the others get a suffix that is sometimes the full rarity name and sometimes an abbreviation: `(UR)`, `(PUR)`, `(PCR)`, `(Secret Rare)`, `(Quarter Century Secret Rare)`, `(Starlight Rare)`. So you can't recover the rarity from the slug. Use `rarityName` from the API.
- **Punctuation (verified):** `&` → `and`, while apostrophes, colons and quotes are dropped. Set names lose their colons too (`Structure Deck: Albaz Strike` → `structure-deck-albaz-strike`). Hyphens in names become spaces in `productUrlName` (`Blue-Eyes` → `Blue Eyes`).
- **Slug isn't checked by the server (verified):** `curl -w "%{http_code}" https://www.tcgplayer.com/product/524817/garbage-slug` → `200`. The page is a client-rendered shell (no `<title>`/canonical in the HTML), so you can't scrape it without a browser.

Real examples (all from the sitemap; ids and fields from the search API):

| Product | URL |
|---|---|
| Ash Blossom & Joyous Spring (Quarter Century Secret Rare), RA01-EN008 | `https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare` |
| Ash Blossom & Joyous Spring, RA01-EN008, Super Rare (no suffix) | `https://www.tcgplayer.com/product/524809/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring` |
| Called by the Grave (UR), RA01-EN057 | `https://www.tcgplayer.com/product/524804/yugioh-25th-anniversary-rarity-collection-called-by-the-grave-ur` |
| Called by the Grave, RA01-EN057, Super Rare | `https://www.tcgplayer.com/product/524803/yugioh-25th-anniversary-rarity-collection-called-by-the-grave` |
| Harpie's Feather Duster, SDD-003 | `https://www.tcgplayer.com/product/22959/yugioh-stairway-to-the-destined-duel-harpies-feather-duster` |
| Number 39: Utopia, BROL-EN059 | `https://www.tcgplayer.com/product/256350/yugioh-brothers-of-legend-number-39-utopia` |
| Maxx "C", STOR-EN086 | `https://www.tcgplayer.com/product/39269/yugioh-storm-of-ragnarok-maxx-c` |
| Accesscode Talker (Starlight Rare), BLCR-EN093 | `https://www.tcgplayer.com/product/453851/yugioh-battles-of-legend-crystal-revenge-accesscode-talker-starlight-rare` |

Note: in RA01, **Called by the Grave is RA01-EN057**, not EN060. RA01-EN060 is Dark Ruler No More (search `q=RA01-EN060`). It comes in 7 RA01 rarities: Super, UR, Secret, Platinum Secret, Quarter Century Secret, PUR, PCR.

## Image URL

- **Derivable from the product id alone (verified):** `https://tcgplayer-cdn.tcgplayer.com/product/<productId>_in_<N>x<N>.jpg`. The front end builds a srcset from exactly this. Sources: `https://www.tcgplayer.com/js/src-D0cJXWRE.js` (`product/${e}_in_200x200.jpg 200w … _in_1000x1000.jpg 1000w`) and `VITE_S3_TCGPLAYER_CDN: "https://tcgplayer-cdn.tcgplayer.com/"` in the same bundles.
- **Sizes (verified, `curl` + `sips` on product 524817):** each `_in_NxN` fits the card inside an N×N box: `_in_200x200` 137×200, `_in_400x400` 273×400, `_in_600x600` 410×600, `_in_800x800` 546×800, `_in_1000x1000` 546×800 (same file as 800, because the source is only 800 tall). The width variants `_25w`, `_75w` (front-end thumbnail), `_200w` and `_400w` also return 200. `_100w`, `_300w`, `_1000w`, bare `.jpg`, `.png` and `_in_100x100` return 403.
- **Missing image → 403 XML, not 404 (verified):** `…/product/999999999_in_1000x1000.jpg` → 403. The details endpoint has `imageCount` if you need to check first.
- `next.config` remote pattern: host `tcgplayer-cdn.tcgplayer.com`, path `/product/**` (served by CloudFront, no auth).

## Candidate lookup from a Convex action (no official API)

**Endpoint (verified):** `POST https://mp-search-api.tcgplayer.com/v1/search/request?q=<query>&isList=false`. The front end calls it as `getSearchResults(q, body, isList)` with `${VITE_SEARCH_API}v1/search/request` (`https://www.tcgplayer.com/js/src-DTOiPm24.js`; `VITE_SEARCH_API = "https://mp-search-api.tcgplayer.com/"`).

- **No cookies, no browser, no Cloudflare (verified):** plain `curl` gets `200`. Response headers are `server: Kestrel` plus a `set-cookie: TCG_VisitorKey=…` you can ignore. There's no `cf-*` header and no challenge page. It also works with `-A node` and with no User-Agent. `GET` returns `405`.
- **`algorithm` matters (verified):** a body without `"algorithm":"sales_dismax"` falls back to `salesrel`, which returns **0** results for a set-code query (`q=RA01-EN008`). With `sales_dismax` it returns all 7 RA01-EN008 products.
- **Best query is the set code alone (verified):** `q=RA01-EN008` → 7 results, all `number == "RA01-EN008"`. `MP19-EN043` → 1, `BLCR-EN093` → 2, `SDD-003` → 1, `RA05-EN117` → 2. A card-name query is fuzzy and spans sets: `q=Called by the Grave 25th Anniversary Rarity Collection` → 326 results.
- **Server-side filters (verified):** `filters.term.rarityName: ["Ultra Rare"]` with `q=RA01-EN057` → exactly 1 (524804). `filters.term.setName` takes the kebab url value (`["25th-anniversary-rarity-collection"]`, as in `aggregations.setName[].urlValue`).
- **Recommended:** query by set code, then match `customAttributes.number === setCode` and `rarityName` in code. Each result carries `listings` (seller offers), so keep `size` small. A `size: 3` response was about 5.6 KB.
- **Assumption / risk:** this is an undocumented internal API with no published terms for third-party use. It may change or start blocking without notice. `robots.txt` asks for `Crawl-Delay: 10`, so keep calls rare (one per Printing, on demand).

Exact request that worked:

```sh
curl -X POST 'https://mp-search-api.tcgplayer.com/v1/search/request?q=RA01-EN008&isList=false' \
  -H 'Content-Type: application/json' \
  -d '{"algorithm":"sales_dismax","from":0,"size":10,
       "filters":{"term":{"productLineName":["yugioh"]},"range":{},"match":{}},
       "listingSearch":{"filters":{"term":{},"range":{},"exclude":{"channelExclusion":0}},"context":{"cart":{}}},
       "context":{"cart":{},"shippingCountry":"US"},
       "settings":{"useFuzzySearch":true,"didYouMean":{}},"sort":{}}'
```

Response, trimmed (real values, `q=ash blossom RA01-EN008`):

```json
{
  "errors": [],
  "results": [{
    "aggregations": { "rarityName": ["…"], "setName": ["…"] },
    "algorithm": "sales_dismax",
    "searchType": "strict",
    "totalResults": 7,
    "results": [{
      "productId": 524817.0,
      "productName": "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
      "productUrlName": "Ash Blossom and Joyous Spring Quarter Century Secret Rare",
      "productLineName": "YuGiOh",
      "productLineUrlName": "YuGiOh",
      "setId": 23233.0,
      "setCode": "RA01",
      "setName": "25th Anniversary Rarity Collection",
      "setUrlName": "25th Anniversary Rarity Collection",
      "rarityName": "Quarter Century Secret Rare",
      "marketPrice": 44.68,
      "lowestPrice": 40.0,
      "totalListings": 66.0,
      "customAttributes": {
        "number": "RA01-EN008",
        "rarityDbName": "Quarter Century Secret Rare",
        "releaseDate": "2023-11-03T00:00:00Z"
      },
      "listings": ["…"]
    }, "…6 more"]
  }]
}
```

Fields: `productId` (a float, so cast it to an integer), `productName`, `productUrlName`, `setName`, `setUrlName`, `setCode` (the set prefix only), `rarityName`, and `customAttributes.number` (the full set code).

### Single product

- **`https://mpapi.tcgplayer.com/v2/product/<id>/details` → 404 (verified).** The front end uses the search host instead (`getProductDetails` in `src-DTOiPm24.js`).
- **`GET https://mp-search-api.tcgplayer.com/v1/product/<id>/details` (and `/v2/…`) → 200 without cookies (verified).** It returns the same fields as a search hit (`productName`, `productUrlName`, `setName`, `setUrlName`, `setCode`, `rarityName`, `customAttributes.number`, `productLineUrlName`) plus `imageCount`, `skus` and `formattedAttributes`. Use it to check a pasted product URL: parse the id, fetch the details, compare the number and rarity.

## YGOPRODeck

- **`card_sets[]` (verified):** `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=Called%20by%20the%20Grave` gives `{set_name, set_code, set_rarity, set_rarity_code, set_price}` per printing, e.g. `25th Anniversary Rarity Collection / RA01-EN057 / Ultra Rare`. It has no TCGplayer product id.
- **Rarity names differ from TCGplayer (verified):** YGOPRODeck calls the RA01 rarities `Collector's Rare` and `Ultimate Rare`, while TCGplayer calls them `Prismatic Collector's Rare` and `Prismatic Ultimate Rare`. Any match between the two needs a rarity map.
- **`&urls=yes` (verified):** adds one `tcgplayer_url` per **card**, not per printing: an affiliate redirect to an arbitrary printing (`…u=https://www.tcgplayer.com/product/162602/yugioh-extreme-force-called-by-the-grave`). It's no use for a specific Printing. `cardsetsinfo.php?setcode=RA01-EN057` returns a single row (`Ultra Rare`) with no TCGplayer data. Unknown params such as `tcgplayer_data` return an error listing the accepted params.

## Search page fallback

- **`https://www.tcgplayer.com/search/yugioh/product?q=<q>&productLineName=yugioh` is valid (verified):** the sitemap lists `https://www.tcgplayer.com/search/yugioh/product?productLineName=yugioh`. The front-end router matches `search/${productLineUrlName}/product` and reads `query.q` (`ProductSearch-BHNw9V1R.js`), and builds `search/${line}/product?…&productLineName=${line}` itself. The server returns 200 for any path (SPA shell), so a `curl` status alone proves nothing.
- **Assumption:** `q=<set code>` (e.g. `q=RA01-EN008`) is the tightest fallback query. The site's search box runs this same `search/request` call, which matched set codes exactly above.

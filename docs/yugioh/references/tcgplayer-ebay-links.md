# eBay and TCGplayer link formats

What the spec fixes about the links the app builds, plus the URL details it leaves open. Built in the shared domain library (spec, Implementation Decisions: Domain logic); tested at Seam 1. **Spec** means the spec says so. **Assumption** means it's standard eBay/TCGplayer behaviour the spec doesn't state: check it against a live page before relying on it.

## eBay Searches

- **Keywords (spec):** set codes in eBay's OR form, `(RA01-EN008,RA02-EN015,…)`, at most **8 codes** per Search.
- **Packing:** set codes share a Search (at most 8) when the union of their Exclusions drops none of the Search's Printings: no Exclusion is a word of a wanted rarity or Card name in it. The Search leaves out that union. Packed first-fit, most Exclusions first, so the result depends only on the set codes (`buildDeckSearches` in `src/lib/yugioh/searches.ts`). Un-chosen Candidates drop out once a Chosen Printing is set.
- **Required rarity:** a Search whose Printings all have one rarity, with at least one Overloaded set code, must say that rarity: its first distinctive word and abbreviations as an OR group after the set codes, `(ultimate,utr)`, `(secret,scr)`, `(quarter,qcsr,qcscr)`. None for Rare and Common. Packing first gives each such rarity's Overloaded set codes Searches of their own, topped up with that rarity's other set codes, unless that takes more Searches than packing everything together. Keyword syntax: `ebay-search-results.md`, "Keyword syntax".
- **Exclusions (spec):** for an Overloaded set code, one `-term` per other rarity printed under that code (e.g. `-super`, `-ultra`), appended to the keywords. Only Searches containing that code get them.
  - **Assumption:** use one distinctive word per rarity (`-super`, `-ultra`, `-secret`, `-starlight`, `-collector`…), never a word the wanted rarity's own name contains: excluding `-secret` would also drop "Quarter Century Secret Rare". The domain library owns this word map and its test cases.
- **Newly Listed link (spec):** the Search's keywords, sorted by newest. **Assumption:** `_sop=10` ("Time: newly listed").
- **Sold link (spec):** the same keywords with `LH_Sold=1&LH_Complete=1`. **Assumption:** add `_sop=13` (most recently ended) so the newest sales come first.
- **Base URL (assumption):** `https://www.ebay.com/sch/i.html?_nkw=<url-encoded keywords>&…`. Optionally `_sacat=183454` (Yu-Gi-Oh! individual cards) to cut sealed product; leave it out until a live check shows it doesn't drop real singles.
- **Location:** the app doesn't restrict location in the URL. Foreign Listings are captured, then flagged by language and charged import fees.

Example (assumption shape):

```
https://www.ebay.com/sch/i.html?_nkw=(RA01-EN008,RA01-EN024)+-super+-ultra&_sop=10
https://www.ebay.com/sch/i.html?_nkw=(RA01-EN008,RA01-EN024)+-super+-ultra&LH_Sold=1&LH_Complete=1&_sop=13
```

## TCGplayer

- **Product page (spec):** `https://www.tcgplayer.com/product/<id>/<slug>`. A found or pasted URL is accepted only if it matches that pattern **and** the slug agrees with the Card name, set and rarity. Otherwise the Printing shows a paste field.
  - **Assumption:** TCGplayer slugs look like `yugioh-<set-name>-<card-name>-<rarity>` in lower-kebab; compare normalised words, not exact strings. Strip query strings (`?Language=English&Condition=…`) before storing.
- **Search fallback (spec):** with no product URL, the Printing links to a TCGplayer search instead. **Assumption:** `https://www.tcgplayer.com/search/yugioh/product?q=<card name> <set code>&productLineName=yugioh`.
- **Image (spec):** the product page's image is stored on the Printing and shown with `next/image`. Its CDN host must be added to `images.remotePatterns` in `next.config.*` (**assumption:** `tcgplayer-cdn.tcgplayer.com`, `/product/**`).

## Capture coverage

- The extension reads **any** eBay search-results page (the app's Searches or the user's own) and each Printing's TCGplayer product page. It never reads eBay item pages or seller notes.
- Links open in a new tab on desktop (`target="_blank" rel="noopener noreferrer"`) and leave the installed iPhone app for Safari or the eBay app (assumption: iOS universal links decide which), where the extension isn't running. Capture on iPhone comes only from the automated browser on the Mac.

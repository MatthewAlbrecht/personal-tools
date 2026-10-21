# 03: TCGplayer product link and image

**What to build:** When I add a Printing, AI finds its TCGplayer product page. The URL is accepted only if it matches the tcgplayer.com/product/<id>/... pattern with a slug that agrees with card, set and rarity; otherwise I'm asked to paste it. The Card shows its TCGplayer image and a link to the product page.

**Blocked by:** 01 (Decks with Cards and Candidate Printings)

**Status:** done

Spec: docs/superpowers/specs/2026-10-19-yugioh-max-rarity-tracker-design.md

- [x] Lookup runs when a Printing is added, not on a schedule
- [x] URLs that fail the pattern check are rejected and the Printing shows a paste field
- [x] Pasted URLs go through the same pattern check
- [x] Card image appears on the Deck page via next/image
- [x] Without a product URL, the Printing falls back to a TCGplayer search link

## Notes from the build

**Research**: `docs/yugioh/references/tcgplayer-product-lookup.md` (verified live). It supersedes the TCGplayer assumptions in `tcgplayer-ebay-links.md`. Key facts:
- Slug is `yugioh-<set>-<product name>`. The rarity is only in it when it's in the product name: one product per set code is bare, others get a full rarity or an abbreviation (`-ur`, `-pur`, `-pcr`).
- The image comes from the product id alone.
- Candidates come from TCGplayer's own (undocumented) search endpoint, by set code.

**Data model**: `yugiohPrintings` gains optional `tcgplayerStatus` (`"searching" | "found" | "needsPaste"`, `yugiohTcgplayerStatusValidator`), `tcgplayerProductUrl`, `tcgplayerImageUrl`. Printings saved before this ticket have no status and read as `needsPaste` (they are never looked up; the user pastes).

**Domain library** `src/lib/yugioh/tcgplayer.ts`:
- `checkTcgplayerProductUrl(url, { cardName, rarity, setName? })` is the pattern check. It strips the query string and returns `{ productId, productUrl }` or null.
- `tcgplayerProductUrl`, `tcgplayerImageUrl` (`_in_400x400.jpg`), `tcgplayerSearchUrl(setCode)`, `rarityNamesAgree` (maps TCGplayer's Prismatic Collector's/Ultimate Rare).
- `parseTcgplayerSearchResponse` and `parseTcgplayerProduct`, ready for ticket 12.
- `REJECTED_PRODUCT_URL`.
- `searchedCandidates(card)` moved into `src/lib/yugioh/searches.ts` (Chosen Printing, or every Candidate while undecided).

**Convex**
- `findOrCreatePrinting` inserts new Printings as `searching` and schedules `internal.yugioh.tcgplayer.lookUpProduct` once. There's no cron.
- The action: TCGplayer search by set code (`convex/model/yugioh/tcgplayerSearch.ts`) → keep products with that exact set code → TypeSafe picks one (`tcgplayerPicker.ts`: a Choice plus a Noul) → `acceptPick` (`convex/model/yugioh/tcgplayer.ts`). `acceptPick` needs probability ≥ 0.6, the same set code and an agreeing rarity, and the URL must pass the pattern check. Any error leaves `needsPaste`. A paste made during the lookup wins.
- `api.yugioh.tcgplayer.setProductUrl` is a public **action** (`useAction`). It runs the pattern check, then fetches TCGplayer's product details and rejects if the set code or rarity disagree. If TCGplayer can't be reached, the pattern check alone decides.
- `getDeck` candidates now carry `tcgplayer: { status, productUrl, imageUrl, searchUrl }`.
- `TYPESAFE_API_KEY` must be set in Convex env (`npx convex env set TYPESAFE_API_KEY …`, dev and prod). Without it the lookup logs a clear error and every new Printing asks for a paste. The SDK runs with `compression: false` (no zstd in the Convex runtime).
- Tests: `convex/yugioh/tcgplayer.test.ts` fakes both `tcgplayerSearch` and `tcgplayerPicker` with `vi.mock`. Use `vi.useFakeTimers()` and `t.finishAllScheduledFunctions(vi.runAllTimers)` to run the lookup. `src/lib/yugioh/tcgplayer.test.ts` covers real slugs.

**UI**
- `CardArt` takes `imageUrl` and `alt` and renders `next/image` (48×70 row, 120×175 drawer). `next.config.js` allows `tcgplayer-cdn.tcgplayer.com/product/**`.
- `TcgplayerLink` (`tcgplayer-link.tsx`) sits under each Candidate in the Card drawer: a spinner, the product link, or a paste form. The paste form is TanStack Form plus `productUrlSchema` in `_utils/schemas.ts`, which runs the same check on the client. It also shows a "Search TCGplayer" link.
- The Searches tab has the "N Printings need a TCGplayer link" callout (the whole callout links to the first Card's drawer) and a TCGplayer list (`tcgplayer-links.tsx`).
- shadcn `alert` and `item` were added from base-vega (with the `cn` import fixed). `item` is only used for `Item`/`ItemSeparator`.

**Open / for later**
- Not checked live: TypeSafe's pick accuracy (no key in dev), and whether TCGplayer's search endpoint answers from Convex's cloud IPs. It works from a local `curl`/Node.
- There is no "Couldn't reach TCGplayer" message: a failed lookup looks the same as "couldn't find it".
- ~~There's no way to replace an already-found URL~~ (fixed 2026-10-20, see below). There's still no re-lookup button for old Printings.
- Ticket 12's capture can reuse `parseTcgplayerProduct` and the stored `tcgplayerProductUrl`.

**Dev data**: pasted a test URL (product 524817) onto "Ash Blossom & Joyous Spring" MP23-EN001 Starlight Rare in the first "Agent test Deck".

## Fix: replacing a TCGplayer link (2026-10-20)

- **UI:** a linked Printing in the Card drawer shows "Change TCGplayer link" next to "TCGplayer product page" (`LinkedProduct` in `tcgplayer-link.tsx`).
  - It opens the same `PasteProductUrl` form an unlinked Printing gets, labelled "Paste the right product URL.", with "Search TCGplayer" and "Keep current link" (cancel).
  - A save closes the form. A rejected URL shows the error and keeps the old link.
  - Checked in the browser on dev (desktop light, 390px dark).
- **Backend:** no change. `api.yugioh.tcgplayer.setProductUrl` never required `needsPaste`, so the paste runs ticket 03's checks unchanged: the pattern check, then TCGplayer's set code and rarity. A save replaces the URL, the image and `tcgplayerProductId`, so later captures of the new product page find the Printing. Tests are in `convex/yugioh/tcgplayer.test.ts` under "changing a linked Printing's TCGplayer link". They passed on first run because the backend already allowed it; they guard the flow.
- **Open:** TCGplayer Listings and sales captured from the old product page stay matched to the Printing (their `url` is the old product URL), so they still count toward its TCGplayer Reference price until they age out. Clearing them on a link change wasn't done: it deletes data and wasn't asked for.

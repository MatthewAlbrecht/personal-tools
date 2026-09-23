---
title: Folio Society catalog redesign
status: approved-design
date: 2026-09-15
---

# Folio Society catalog redesign

## Goal

Replace the `/folio-society` scraper console with a **catalog-first Folio browser**: seasonal drops as the spine, book cards in a grid, owned / want as filters — not a separate app.

Primary jobs:

1. **Browse what’s out / coming** by season
2. **See editions of a title** (standard / limited / signed) without treating every SKU as an unrelated row
3. **Mark owned or want per edition** and filter to that shelf
4. **Look at the object** — cover first, extra images only after expand

This is a collector tool, not a store. No buy/checkout. Folio’s site is the purchase path (outbound link).

## Non-goals (v1)

- Bulk “mark all Murakami owned”
- Scraping Folio’s CMS season pages (`New Books | Fall 2026`)
- Buy / cart / checkout
- `/books` AbeBooks search
- Process-images, IDs, SKUs, or first-seen on cards
- A separate admin route
- New font families or a dark-theme toggle
- Lightbox, book drawer, spine/bookshelf view, hover-3D covers, grain overlays
- Starting catalog pagination from all releases then TypeScript-filtering the page

## Jobs & IA

| Surface | Job |
|---|---|
| Catalog (`/folio-society`) | Seasonal grid. Default = no collection filters. |
| Same catalog + Owned | Editions marked owned |
| Same catalog + Want | Editions marked want |
| Settings sheet | Sync / enrich / ID range / images |

Owned and Want never become views, tabs, or routes. Header copy and empty states stay catalog; only the rail (and mobile badge) show filter state.

**Default on land:** newest season’s books. Not the scrape log.

**Sitemap (v1):** one route, `/folio-society`. Global nav and page heading: **Folio Society**. Utility: Settings. Local: filter rail. No child routes. Season headers are grouping, not navigation (no season index).

**Primary object:** an **edition** (Folio product / SKU). The grid **card** is **`titleKey` × `seasonKey`**.

- Same-season SKUs (standard + LE both in Fall 2026) collapse to one card. Default visible edition = the one that launched in that season; if two launched the same season, prefer limited > signed > standard.
- Cross-season family = multiple cards (LE in Fall, standard in Spring). The switcher inspects siblings; it does not merge seasons.
- Ownership filters override the default visible edition: Owned on → show the owned SKU’s cover/price/date/marks in **that SKU’s** launch season. Same for Want. Union: a card appears if any family edition in that season matches owned **or** want; if both match, prefer owned as the visible edition.
- **`titleKey`:** `lowercase(author)|normalizedTitle` when author is known. No author → **do not** join on title alone; each SKU is its own family (avoids merging generic titles).
- Bundles are an **edition type**, not a family. Do not `titleKey`-join a bundle to constituent singles. Hidden unless Bundles is on. Dated bundles sit in their season; undated → **Undated**.

## UX structure

### Desktop

```
┌─────────────────────────────────────────────┬──────────┐
│ Folio Society            N books    Settings│ Filters  │
├─────────────────────────────────────────────┤ (sticky) │
│ Fall 2026                                   │ Search   │
│ [cover] [cover] [cover] [cover]             │ Owned    │
│                                             │ Want     │
│ Spring 2026                                 │ LE       │
│ [cover] [cover] …                           │ Signed   │
│                                             │ This year│
│ Undated                                     │ Coming   │
│ …                                           │ Bundles  │
└─────────────────────────────────────────────┴──────────┘
```

Match Library / Queue: main column + sticky `w-48` rail, `border-l`, uppercase “Filters” label, mobile `Sheet`.

### Mobile

- Full-width 2-column grid
- **Filters** → `Sheet` with the same controls
- Badge on the button when any non-default filter is active
- Settings in the header icon, not a third column

### Grouping

- Timestamp: **`launch_time` first**, else parsed `publication_date`. None → season **Undated**.
- Season from that timestamp’s month:
  - Mar–May → Spring YYYY
  - Jun–Aug → Summer YYYY
  - Sep–Nov → Fall YYYY
  - Dec–Feb → Winter YYYY+1 for December (Dec 2026 label = Winter 2027; sort key `2026-12`)
- Infinite scroll loads **older complete seasons** (custom cursor, not Convex `.paginate()` then group). A season is never split across pages.
- After filters: omit empty seasons; if nothing remains, one empty state in the main column.
- `{n} books` = cards in the **current page of results** (title×season), not catalog-wide and not a second count query.

### Filters (v1)

URL-serialized. Client passes `now: number` into catalog queries. Never `Date.now()` in Convex queries.

| Filter | Default | Meaning |
|---|---|---|
| Search | empty | Title or author |
| Owned | off | Editions marked owned |
| Want | off | Editions marked want |
| LE | off | `edition === limited` |
| Signed | off | `edition === signed` |
| This year | off | Calendar year of catalog timestamp = year of client `now` |
| Coming | off | `isComingSoon` or `catalogLaunchTime > now` |
| Bundles | **off** | When off, `isBundle` rows are excluded |

Owned and Want independent. Both on = **union** (owned **or** want), not AND. Clear restores the catalog; Bundles stays off.

### Card UX

**Collapsed**

- Cover ~70% of the tile, ~3:4, `object-cover`. Missing cover: stone field + Fraunces initial, not a broken-image strip.
- Three lines under the cover: author (omit if unknown) → title (family title, 2-line clamp) → `$price · 15 Sep 2026` (USD; this store is USA). Hide time-of-day.
- No boxed chrome: no bordered dashboard card, no shadow, no hover lift. 1px stone edge on the cover at most.
- Badges on the cover, one quiet chip row: `LE`, `Signed`, `Coming` for **this visible edition**. Family scent only: `Also LE` / `Also signed` if other family editions exist. If those badges are absent, the expand switcher must not appear.
- Owned = filled teal stamp on the cover corner. Want = outline bookmark. Clicking a mark does **not** expand. Marks write the **visible edition**.
- Click cover or title → expand. Card is a button; marks are nested buttons.

**Expand (grid rule — required)**

Do **not** grow the cell and do **not** `col-span` the open card. Opening inserts a **full-width detail row that breaks the season grid** immediately after the row that contains the open card. Sibling covers keep column and size. **One expanded card per season.** Collapse restores the grid. No masonry, overlay, or modal.

Measure: after expand, the opened cover’s column index is unchanged; only a new row appears under that row.

**Expanded row**

- Left: larger cover + 3–4 thumbs + **Show more** / **Show less**.
- Right: edition switcher (`Standard` / `Limited` / `Signed` — only editions that exist), price/date/availability for the **selected** edition, owned/want for that edition, outbound **Folio** (text link, new tab). Close: card click, Close, or Escape.
- Switcher does not move the card to another season.
- Filter LE still shows the LE cover in **that LE’s** launch season.

## Visual direction

Same shell as Listens / Rankings: cool slate page, stone rail, teal only on owned/want and the Folio outbound. Fraunces for season chapter titles and book titles; Source Sans for author, price, date, rail. No new font families.

**Memorable:** season as a chapter, cover as the object. Season headers: Fraunces, large, little tracking, a thin stone rule — contents page, not a dashboard `h2`.

Motion: expand/collapse height only (200–280ms, ease-out). First paint: season title then covers, one stagger per section, then stop. Sheet as today. No cover tilt, no page-wide fade.

Avoid: three stat cards, image-dump rows, purple, Inter / Space Grotesk, merch CTAs, wrapping tiles in heavy bordered cards.

## Copy

Voice: one collector. Catalog nouns on the browse surface. Settings may be operational.

| Surface | String |
|---|---|
| Nav / page heading | Folio Society |
| Count | `{n} books` |
| Header | Settings |
| Rail / mobile | Filters |
| Search placeholder | Title or author |
| Filters | Owned, Want, LE, Signed, This year, Coming, Bundles |
| Clear | Clear filters |
| Seasons | Spring YYYY, Summer YYYY, Fall YYYY, Winter YYYY |
| No date | Undated |
| Badges | LE, Signed, Coming |
| Other editions | Also LE, Also signed |
| Switcher | Standard / Limited / Signed |
| Gallery | Show more, Show less |
| Outbound | Folio |
| Close | Close |
| Marks (aria) | Owned, Want |

Empty states (one line, main column):

| Case | String |
|---|---|
| No catalog | Nothing here yet. |
| Filters / search | No books match. |
| Owned only | Nothing owned yet. |
| Want only | Nothing wanted yet. |
| Owned + Want | Nothing on your shelf. |
| Coming | Nothing coming. |
| This year | Nothing this year. |
| LE | No limited editions. |
| Signed | No signed editions. |
| Bundles | No bundles. |

Settings only: Settings; Sync / Syncing…; Enrich details / Enriching…; Process images / Processing images…; ID range; Start; End; Dates filling in. Toasts: Sync failed.; Sync finished.; Enrichment failed.; Image processing failed.; Couldn’t save.; Couldn’t update range.

Cut from browse: subtitle, “open settings to sync,” first/last seen, ID, SKU, Sync from API, Full Enrichment, Process Images, View as primary, Buy/Shop, “successfully!”, “Check console.”

## Data & Convex

### Existing tables (keep)

- `folioSocietyReleases`, `folioSocietyProductDetails`, `folioSocietyImages`, `folioSocietyConfig`
- Catalog fields live **only on `folioSocietyReleases`** (denormalized at sync/backfill). Do **not** read `folioSocietyProductDetails` in the catalog query. Keep details `publicationDate*` for enrichment; backfill may copy into releases.

### Extend `folioSocietyReleases`

| Field | Always written? | Notes |
|---|---|---|
| `launchTime` | optional | Unix ms from `launch_time` |
| `publicationDateText` | optional | As Folio sent it |
| `publicationDateTime` | optional | Parsed publication, Unix ms |
| `catalogLaunchTime` | **yes** | `launchTime ?? publicationDateTime ?? 0` — every row is in the time index |
| `isComingSoon` | yes (default false) | from `is_coming_soon` |
| `edition` | yes | `standard` \| `limited` \| `signed` \| `bundle` |
| `isBundle` | yes | `edition === "bundle"` |
| `titleKey` | yes | Family key (see IA) |
| `authorName` | optional | Display |
| `searchText` | yes | `` `${name} ${authorName ?? ""}` `` at write |
| `seasonKey` | yes | Display: `2026-fall` or `undated` |
| `seasonSortKey` | **yes** | Orderable: dated = `YYYY-MM` of season start (Spring=`YYYY-03`, Summer=`YYYY-06`, Fall=`YYYY-09`, Winter label YYYY+1 = `(YYYY)-12` for December). Undated = `0000-00` (last when desc) |
| `heroImageUrl` | optional | Processed hero else Folio `image` |
| `familyHasLimited` | yes (default false) | Denormalized when titleKey/edition changes; patch siblings via `by_titleKey` |
| `familyHasSigned` | yes (default false) | Same |

`seasonKey` `2026-fall` is **not** used as a sort/index for infinite scroll.

Inference (name, case-insensitive):

- `(limited edition)` / `limited edition` → `limited`
- `(signed edition)` / `signed edition` → `signed`
- Ends with `Collection` and no launch/publication → `bundle`
- Else `standard`

Publication parse: `DD/MM/YYYY` and `DD/MM/YY`. Invalid → leave publication empty; do not fail the product.

Indexes:

- Keep `by_external_id`, `by_isActive`
- `by_titleKey` (`titleKey`)
- `by_isActive_isBundle_seasonSortKey` (`isActive`, `isBundle`, `seasonSortKey`)
- `by_isActive_edition_seasonSortKey` (`isActive`, `edition`, `seasonSortKey`)
- `by_isActive_catalogLaunchTime` (`isActive`, `catalogLaunchTime`)
- Search index `search_title_author`: `searchField: searchText`, `filterFields: ["isActive", "edition", "isBundle"]`

### New table: `folioSocietyOwnership`

| Field | Purpose |
|---|---|
| `userId` | Server-set only |
| `productId` | Folio external id (`v.number()`), not `v.id("folioSocietyReleases")` |
| `status` | `owned` \| `want` |
| `updatedAt` | Unix ms |

One logical row per user + edition. Want → owned **replaces** status. Clear → delete.

Indexes: `by_user_product` (`userId`, `productId`); `by_user_status` (`userId`, `status`). Convex indexes are **not unique** — enforce one row in the mutation.

**Auth (honest for this app):** `requireAuth` is a no-op; Next.js middleware is the login gate. Do **not** put `userId` in mutation args. Server writes `userId = "folio-owner"`. Do not claim row-level auth until `ctx.auth` exists. `setOwnership` rejects if `by_external_id` misses.

### Catalog query (custom cursor)

Do **not** use Convex `.paginate()` as the catalog API. Do **not** `.collect()` all releases.

```
cursor: null | { beforeSeasonSortKey: string }  // exclusive; next page is older
pageSizeSeasons: 1–3, default 1
now: number  // required
```

Returns: `{ seasons: [...], continueCursor, isDone, bookCount }` plus `returns` validator. `bookCount` = cards on this page.

**Default browse** (no search, no shelf): `by_isActive_isBundle_seasonSortKey` with `isActive=true`, `isBundle=false`, `seasonSortKey` desc from cursor. Return complete seasons until `pageSizeSeasons`.

**LE / Signed:** `by_isActive_edition_seasonSortKey`.

**Coming:** `by_isActive_catalogLaunchTime` where `catalogLaunchTime > now`, union rows with `isComingSoon` (do not scan all active).

**Owned and/or want:** start from `folioSocietyOwnership` `by_user_status` (bounded shelf). Point-get each product via `by_external_id`. Filter remaining predicates in TS; group by `seasonSortKey`; paginate seasons **in memory on that set**. Never start from all releases.

**Search:** `.withSearchIndex("search_title_author")` → hard cap (e.g. 64) → season-group → same cursor rules. Do not ship search as an unindexed collect.

**Grid attach:** no per-card image or family queries. Hero + family flags are denormalized on the release. Switcher: `getFamilyByTitleKey` on expand only. Gallery: existing `getActiveImagesByProduct` on expand only.

All new public functions: `args` + `returns` validators.

### Sync

- Load API **verbosity 3**. Cap Folio request size (e.g. 50 ids per HTTP call). Do not build the entire startId–endId list as one URL.
- Persist catalog fields on create/update (`internalMutation`).
- Replace `getAllReleases` collect with `by_external_id` lookups for IDs in the current batch.
- Stop scheduling `api.folioSocietyDetails.enrichDetails`. If still scheduled, `internalAction` only.
- `getReleases` `.collect()`+slice is **not** the catalog API; the new page must not call it.

### Backfill (v1, required)

```
public mutation startFolioCatalogBackfill
  → ctx.scheduler.runAfter(0, internal.folioSocietyBackfill.runBatch, { cursor })
internalAction runBatch: verbosity-3 for ≤25 external IDs
internalMutation applyBatch: patch catalog fields
```

Persist `backfillCursorExternalId` + `backfillStatus: idle|running|done|error` on `folioSocietyConfig`. Next batch: `scheduler.runAfter(0, internal....)` only. Never `api.*`. Never `getAllReleases` / `getAllDetails`. ID source: `by_external_id` pages or config range pages, not table collect.

UI: settings shows **Dates filling in**. Catalog stays up; undated until dates land.

### Ownership mutation

`setOwnership({ productId, status: "owned" | "want" | null })` — null clears. `returns: v.null()`. Optimistic on the card; toast **Couldn’t save.**; revert.

## Components (shadcn)

- `Sheet` — mobile filters; settings
- `Button`, `Input`, `Badge`, `Skeleton`
- Rail micro-labels match `LibraryFilters` (uppercase tracking)

Colocated (kebab-case), main export first, skeletons after:

- `folio-catalog-page.tsx`
- `folio-filters.tsx`
- `folio-season-section.tsx`
- `folio-book-card.tsx`
- `folio-settings-sheet.tsx`

Remove from browse: `StatsSection` 3-up, always-visible `ConfigSection`, per-row Process Images / View.

## Error handling

| Case | Behavior |
|---|---|
| Sync / backfill fail | Toast; last good catalog |
| Verbosity 3 omits dates | Undated until a later pass |
| Missing cover | Stone + initial |
| Missing author | Omit the line |
| Invalid publication string | Skip parse |
| Ownership write fail | Toast; revert |
| Unauthenticated | Existing route gate |

No full-page spinner over the catalog while backfill runs.

## Testing

- `edition` / `titleKey` / `isBundle` inference
- `seasonSortKey` order (Fall 2026 > Spring 2026 > Undated); Dec→Winter label/sort
- `launch_time` wins over `publication_date`
- Publication parse `15/09/2026` and `05/05/26`
- Catalog: no unbounded collect; bundles excluded by default; owned path starts from ownership table
- Custom cursor never returns a partial season
- Filter URL serialize/parse
- Ownership replace (want → owned) and clear; one row per user+product
- TitleKey: no author → no join on title alone

## Success criteria

- `/folio-society` is a seasonal cover grid with a Library-style filter rail
- Verbosity 3 fields on sync + backfill; catalog does not join details
- Expand is a full-width row break, not cell grow
- Owned/want per edition; filters not views
- Bundles hidden until toggled
- Infinite scroll = older complete seasons
- Settings holds sync / enrich / range / images
- IDs, SKUs, first-seen, Process Images gone from browse

## Follow-ons (not this plan)

- Bulk mark by author
- Folio CMS season pages as source of truth
- Spine / bookshelf view mode
- Cross-season “put this family in one place”
- `/books` integration
- Real `ctx.auth` userId on ownership

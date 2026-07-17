# RYM Associate Link Selection Speed Design

## Goal

Make selecting a candidate in the RYM associate drawer feel immediate on both surfaces:

- `/albums/all` — `AlbumRymAssociateDrawer` → `associateSpotifyAlbumWithRymScrape`
- For Later — `ForLaterRymAssociateDrawer` → `associateForLaterAlbumWithRymScrape`

The pain is specifically **after clicking a scrape row**, not while searching the list.

## Current State

Both drawers share `searchUnmappedRymScrapes` and nearly identical picker UI. On row click, the parent awaits a Convex mutation with no in-drawer loading affordance; the drawer stays open until the mutation resolves.

### Album library associate path

`associateSpotifyAlbumWithRymScrape` (`convex/spotify.ts`):

1. Loads album + scrape
2. Calls `linkRymScrapeToSpotifyAlbum`
3. Patches `spotifyAlbums.rymNotOnSite`
4. Calls `refreshAlbumLibraryProjectionsForAlbum` **again**

`linkRymScrapeToSpotifyAlbum` (`convex/_utils/albumMatching.ts`) already calls `refreshAlbumLibraryProjectionsForAlbum` after writing the junction row. The associate mutation therefore rebuilds every `albumLibraryItems` projection for that album **twice** per manual link.

Each full projection rebuild (`buildAlbumLibraryProjectionForAlbum`) reloads user listen state, latest RYM link, scrape, full RYM taxonomy (N+1 genre/descriptor lookups), and Rob ranking membership — even though a manual link only changes RYM-derived fields.

### For Later associate path

`associateForLaterAlbumWithRymScrape` (`convex/forLaterAlbums.ts`):

1. Loads item + scrape; checks `isRymScrapeMappedElsewhere` (indexed — fine)
2. Calls `linkRymScrapeToSpotifyAlbum` (full album-library projection refresh for the album)
3. Patches `forLaterAlbumItems` RYM fields
4. Calls `syncForLaterItemFilterProjection`, which:
   - Re-resolves RYM context via queries even though the scrape was just linked
   - Reloads scrape taxonomy via `loadTagsForScrape`
   - Collects **all** `rateYourMusicGenreRelationships` via `loadRymGenreParentKeysByChild`
   - Rewrites genre/descriptor/duration facet rows

### UI

`ScrapePickerRow` fires `onAssociate` with no pending state. Users get no feedback until the drawer closes on success.

## Approaches Considered

### A. Backend lean path only

Remove redundant work on the hot path and add a focused RYM-only projection update for manual links. Keep drawer open until success.

**Pros:** Fixes root cause; projections stay synchronous and consistent.  
**Cons:** Click still waits on mutation round-trip before the drawer closes.

### B. Optimistic UI only

Close drawer immediately on click; toast on completion/failure.

**Pros:** Feels fast with minimal backend change.  
**Cons:** Does not reduce mutation latency; list may briefly show stale RYM state unless locally overlaid.

### C. Deferred projection via scheduler

Write junction + minimal patches synchronously; schedule heavy projection refresh.

**Pros:** Fastest mutation path.  
**Cons:** Filters and library rows can be wrong until the job runs; adds eventual-consistency complexity for a single-user app.

**Recommendation:** **A + B**. Keep the backend lean path, and make the click feel instant with optimistic close + row overlay (same local-Map pattern as concerts / rankings).

## Scope

### In scope

- Remove duplicate album-library projection refresh on manual album-library associate
- Add a RYM-slice projection helper that patches only RYM-derived fields on `albumLibraryItems` for manual links (reuse loaded scrape + taxonomy once per album)
- Optimize For Later manual associate to avoid re-querying context and reloading genre hierarchy when scrape is already known
- Optimistic associate UX: close drawer immediately on click; overlay linked RYM state on the list row; fire mutation in background; toast + rollback on failure
- Source/unit tests guarding the hot-path shape

### Out of scope

- Speeding up `searchUnmappedRymScrapes` (search-time `collectMappedRymScrapes` full scans)
- Merging the two drawer components into one file
- Changing matching/backfill ingestion paths
- Deferred/async projection refresh
- Optimistic taxonomy (genres/descriptors) — those arrive via Convex reactivity after the mutation

## Design

### 1. RYM-slice album library projection

Add `patchAlbumLibraryRymFieldsForAlbum` in `convex/_utils/albumLibraryProjection.ts`:

```ts
type AlbumLibraryRymPatchInput = {
  albumId: Id<"spotifyAlbums">;
  scrape: Doc<"rateYourMusicScrapes">;
  linkMethod: "manual" | "spotify_id" | "title_artist";
  linkedAt: number;
};
```

Behavior:

- Load taxonomy for `scrape._id` once via existing `loadRymTaxonomyForScrape` (private helper already in file)
- Query `albumLibraryItems` by `by_albumId`
- For each row, **patch only** RYM-derived fields:
  - `rymStatus`, `rymScrapeId`, `rymLinkMethod`, `rymUrl`, `rymLinkedAt`
  - `primaryGenres`, `secondaryGenres`, `descriptors`
  - `updatedAt` = max(existing `updatedAt`, `linkedAt`, scrape `updatedAt`)
- Do **not** re-read `userAlbums`, `robRankingAlbums`, or recompute listen fields

Add optional flag to `linkRymScrapeToSpotifyAlbum`:

```ts
refreshMode?: "full" | "rym-slice" | "none"; // default "full" for existing callers
```

- Manual associate mutations pass `refreshMode: "rym-slice"`
- Ingestion/backfill paths keep default `full` (or explicit `full`)

Remove the trailing `refreshAlbumLibraryProjectionsForAlbum` call from `associateSpotifyAlbumWithRymScrape`.

### 2. For Later associate fast path

Add `syncForLaterRymLinkFilterProjection` (or optional args on `syncForLaterItemFilterProjection`) that accepts:

- `item` (already loaded)
- `scrape` (already loaded)
- `tags` from `loadTagsForScrape` (loaded once in mutation)
- `parentKeysByChild` (loaded once per mutation via `loadRymGenreParentKeysByChild`)

The fast path:

- Skips `resolveRymContextForAlbum` re-query
- Skips second scrape/taxonomy load
- Still updates filter fields + genre/descriptor/duration facets (taxonomy changed)
- Uses `Date.now()` from mutation `now` for `updatedAt`

`associateForLaterAlbumWithRymScrape` orchestration:

1. Validate item + scrape + mapped-elsewhere check
2. `loadTagsForScrape(ctx, scrapeId)` once
3. `parentKeysByChild = await loadRymGenreParentKeysByChild(ctx)` once
4. `linkRymScrapeToSpotifyAlbum(..., refreshMode: "rym-slice")`
5. Patch `forLaterAlbumItems`
6. Fast-path filter projection sync with preloaded inputs

### 3. Optimistic associate UX

Match the existing local-Map optimistic pattern (`event-search-card`, rankings views).

**Click sequence (both surfaces):**

1. Capture scrape summary from the picker row (`scrapeId`, `rymUrl`, titles)
2. Close the drawer immediately
3. Write an optimistic overlay for that album/row:
   - Album library: `{ rymStatus: "linked", rymUrl }` keyed by `spotifyAlbums` id
   - For Later: `{ rymStatus: "matched", rymUrl }` keyed by `forLaterAlbumItems` id; clear optimistic `rymNotOnSite` if present
4. Fire the mutation without awaiting for UI close
5. On success: toast; leave overlay until Convex query data reflects the link, then clear that key
6. On failure: remove overlay; toast error; user can reopen the drawer and retry

**`onAssociate` signature change:** pass scrape summary, not only id:

```ts
type RymAssociateSelection = {
  scrapeId: Id<"rateYourMusicScrapes">;
  rymUrl: string;
};
```

**Guard:** ignore a second click while a mutation for the same album is in flight (drawer already closed; parent tracks `associatingAlbumKey`).

**What is not optimistic:** genres / descriptors / filter facets. Those update when the lean mutation finishes and reactive queries refresh. Linked status + RYM URL is enough for the row chrome (link button → linked affordance).

Album library: overlay + apply in `AllAlbumsView` when mapping rows for display.  
For Later: overlay in `useForLaterRymAssociateDrawer` (or page) and merge onto row data before render.

### 4. Safety / correctness

- Manual link semantics unchanged: same junction table writes, same `method: "manual"`, same mapped-elsewhere guard on For Later
- Album library still allows one scrape on multiple albums (existing behavior)
- RYM-slice patch is only used when scrape document is already loaded in the associate mutation
- If an album has no `albumLibraryItems` row yet, rym-slice patch is a no-op (same as today)
- Optimistic overlay never writes to Convex; failure always rolls back local state

## Success Criteria

- Clicking a scrape row closes the drawer immediately and shows linked RYM chrome on the row (optimistic)
- Failed associate rolls back the overlay and toasts an error
- Manual associate mutations avoid duplicate `refreshAlbumLibraryProjectionsForAlbum` on album library path
- Manual associate uses RYM-slice projection (one taxonomy load per album, not full projection rebuild per user row)
- For Later manual associate loads genre hierarchy once per mutation, not inside a blind full resync
- Existing source tests updated; new tests cover duplicate-refresh removal and rym-slice helper behavior

## Testing

- **Source test:** `associateSpotifyAlbumWithRymScrape` body contains exactly one album-library refresh entry point (`rym-slice` via link helper, not a second `refreshAlbumLibraryProjectionsForAlbum`)
- **Unit test:** `patchAlbumLibraryRymFieldsForAlbum` patches only RYM fields (test via extracted pure builder if needed, or source-level assertions on field list)
- **Source test:** `associateForLaterAlbumWithRymScrape` passes preloaded context into fast-path sync (no bare `syncForLaterItemFilterProjection(ctx, itemId)` as the only call)

Manual verification:

1. Open RYM associate on `/albums/all`; click a scrape — drawer closes instantly; row shows linked/URL; toast on success; taxonomy fills in shortly after
2. Force a failure (e.g. invalid scrape in test) — overlay rolls back; error toast
3. Same happy path on For Later row

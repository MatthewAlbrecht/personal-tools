# Album Library Query Model + For-Later Membership Design

## Goal

Make `albumLibraryItems` the per-user query surface for album membership and filterable scalars, so smart playlists (and later browse UIs) stop resolving RYM enrichment via live scrapes or stale for-later fields.

Immediate product fix: **For Later smart playlist genre matching matches For Later list results** (e.g. ambient americana include/either).

Longer product goal: slice/dice albums with stable pagination (`page_size` new items per fetch, no post-filter), including RYM tags and future AI multi-value enrichments.

Related:

- Idea: `docs/ideas/2026-07-15-centralize-singular-album-model.md`
- Enrichment: `docs/superpowers/specs/2026-07-17-ai-album-research-enrichment-design.md`
- Library projection: `docs/superpowers/specs/2026-07-04-albums-all-pagination-design.md`
- Smart playlists: `docs/superpowers/specs/2026-07-10-smart-playlist-recipes-design.md`

## Background

Canonical album identity is already `spotifyAlbums`. Enrichment hangs off the album:

- RYM match SoT: `rateYourMusicSpotifyAlbumLinks` → scrapes → genres/descriptors
- AI enrichment: `albumEnrichments` + `albumCoverDescriptorFacets` / `albumOccasionFacets`

`forLaterAlbumItems` is membership/queue state, but it also caches `rymScrapeId` and `filterGenreKeysSorted`. Smart playlist for-later matching required `item.rymScrapeId` and skipped albums whose genres only existed via Spotify↔RYM links (already projected onto `albumLibraryItems`). For Later list filtering used denormalized keys, so the same genre showed matches there and zero in playlist preview.

`albumLibraryItems` already denormalizes RYM `primaryGenres` / `secondaryGenres` and `appearsInRobRankings`. It does **not** yet denormalize for-later membership.

Arrays on a document are not an indexed “contains tag X” query in Convex. Multi-value filter axes need facet / inverted-index tables. For Later already uses `forLaterAlbumGenreFacets` for that pattern; AI enrichment already created cover/occasion facet tables (product filters explicitly deferred).

## Goals & Non-Goals

### In scope

- Add `appearsInForLater` (and supporting index) on `albumLibraryItems`
- Keep that flag in sync from for-later upsert / deactivate / soft-delete paths
- Backfill existing library rows
- Drive smart playlist **forLater** source from library rows with `appearsInForLater === true`, matching genres from library `primaryGenres` / `secondaryGenres` (same path as rankings)
- Document the three-layer query model for future filters (scalars on library, multi-value on facets)
- Define how AI cover/occasion facets grow into user-scoped list filters later

### Out of scope (this change)

- Rewriting For Later UI to read only from library (queue table remains source of queue workflow fields)
- Removing `forLaterAlbumItems.rymScrapeId` / `filterGenreKeysSorted` / for-later facet tables
- Building new UI filters for cover descriptors / occasions
- Migrating every for-later list query onto library in one pass
- Solving arbitrary AND of two multi-value tags with perfect pagination in phase 1
- Replacing smart playlist recipe evaluation with a single compound index for all clause shapes

## Approaches considered

### 1. Library membership flag + library genres for smart playlists (chosen)

Denorm `appearsInForLater` onto `albumLibraryItems`. Smart playlist forLater queries that projection and uses denormalized RYM genre tags. Facet-index browse for AI/RYM tags is a phased follow-on using the same model.

**Pros:** Fixes the bug with the correct SoT; matches rankings path; aligns with singular album model; small enough to ship.  
**Cons:** Complex smart playlist recipes still evaluate clauses in memory over the for-later candidate set (acceptable at personal scale; not the paginated browse path).

### 2. Live scrape resolve via links only

Shared `albumId → rateYourMusicSpotifyAlbumLinks → scrape` helper in smart playlists.

**Pros:** Minimal schema change.  
**Cons:** Wrong long-term model; N+1 reads; diverges from library projection; doesn’t establish for-later-on-library.

### 3. Full facet migration in one PR

Move all for-later genre/descriptor pagination and smart playlists onto new library-scoped facet tables immediately.

**Pros:** Pure indexed query story.  
**Cons:** Large migration; blocks the playlist bug fix; high risk.

## Architecture

### Three layers

```
spotifyAlbums                    ← identity
albumEnrichments                 ← 1:1 prose / non-list enrichment
rateYourMusicSpotifyAlbumLinks   ← RYM match SoT
        ↓ write funnel
albumLibraryItems                ← per-user scalars + denorm RYM tag arrays for display/recipes
        ↓
facet tables                     ← multi-value inverted indexes for paginated filters
  (existing for-later facets; AI cover/occasion facets; future library-scoped facets)
```

**Rule:** New enrichment field → ask “is this a filter axis?”

| Kind | Store | Query |
|------|--------|--------|
| Narrative / rare | `albumEnrichments` only | Details join |
| Single-value filter/sort | Denorm onto `albumLibraryItems` + compound index | `.withIndex` + `.paginate` |
| Multi-value filter | Facet table; copy needed scalars onto facet rows | Facet index + `.paginate` |

Do **not** grow `albumLibraryItems` with every AI prose field. Do **not** treat arrays on the library row as the pagination strategy.

### `appearsInForLater`

Add to `albumLibraryItems`:

```ts
appearsInForLater: boolean
```

**True when** the user has a `forLaterAlbumItems` row for that `albumId` with:

- `isActive === true`
- `markedAsSingle !== true`
- `removedFromForLater !== true`

Same membership definition smart playlists already use when scanning for-later items.

Index (mirror Rob rankings):

```ts
.index("by_userId_appearsInForLater_createdAt", [
  "userId",
  "appearsInForLater",
  "createdAt",
])
```

Optionally add `appearsInForLater` to the album library search index `filterFields` when search+for-later is needed (follow-on if unused in phase 1).

### Projection build

`buildAlbumLibraryProjectionForAlbum` loads for-later membership and sets `appearsInForLater`. Prefer an indexed lookup (`by_userId_albumId` on for-later items), then apply the active/not-single/not-removed predicate.

### Sync funnel

Every mutation that changes for-later membership visibility must refresh the library projection for that `(userId, albumId)`:

- Upsert / reactivate for-later item (already calls `upsertAlbumLibraryProjection`)
- Mark inactive / removed from playlist sync
- `setForLaterAlbumMarkedAsSingle`
- `setForLaterAlbumRemovedFromForLater`

RYM link writes already refresh library RYM fields; that path stays. Genre SoT for recipes remains whatever the library row currently holds after those refreshes.

### Backfill

`appearsInForLater` is a required boolean on `albumLibraryItems`. Ship schema + projection build, then run an internal backfill that re-upserts projections for existing library rows (at minimum every row that has or had a for-later item) before relying on the new index in production. Rows not yet backfilled must not be queried with the assumption the field is present — backfill completes as part of phase 1 rollout.

### Smart playlist forLater matching (phase 1)

Replace “scan `forLaterAlbumItems` + live scrape genre load” with:

1. Load `albumLibraryItems` where `userId` + `appearsInForLater === true` (indexed).
2. Apply scalar filters from the library row where possible (`releaseYear`, `rating`, descriptors from library `descriptors`).
3. Genre clauses: `primaryGenres` / `secondaryGenres` on the library row, expand ancestors with existing `buildFilterGenreKeysSortedWithAncestors`, then `albumMatchesGenreClauses` — **identical to rankings**.
4. Duration: continue reading `spotifyAlbums.totalDurationMs` (denorm onto library is phase 3).
5. `addedWindow`: phase 1 joins `forLaterAlbumItems` by `(userId, albumId)` **only** for `playlistAddedAt` / `firstSeenAt` / `createdAt`. Do not denorm `forLaterAddedAt` in phase 1 (phase 3).

**Explicit non-goal for phase 1:** expressing every genre include/exclude/role recipe as a pure index query. Candidate set is “in for later”; clause evaluation stays in memory (personal-scale).

**Note:** Any interim smart-playlist scrape-link fallback (`resolveRymScrapeIdForAlbum`) is superseded by this library path and should be removed when phase 1 lands.

### Facet query model (phase 2 — specify now, implement later)

For paginated lists that must always return `page_size` hits:

- Start from an index whose equality prefix includes every required predicate.
- Multi-value axes use facet rows that **copy** user-scoped scalars needed for that list, e.g. conceptually:

```ts
// Future library-scoped genre facet (illustrative)
userId, albumId, genreKey, role,
appearsInForLater, releaseYear, durationBucketKey, sortAt
```

- Write **ancestor genre keys** into facets at sync time (not at read time).
- Primary vs secondary = `role` on the facet row (or equivalent).
- AI cover/occasion facets today are album-global (`by_coverDescriptorKey_albumId`). When product filters ship, either:
  - add user-scoped facet rows that copy `appearsInForLater` / sort fields, or
  - introduce library-scoped facet tables fed from enrichment saves + membership refreshes.

AND of two independent multi-value tags requires posting-list intersection or denormalized pair keys — do not fake it with post-filter pagination.

### Relation to existing for-later facets

`forLaterAlbumGenreFacets` remains valid for the current For Later UI until a dedicated migration moves that UI onto library-scoped facets. This design does not require deleting them in phase 1.

## Data flow (phase 1)

```
for-later membership change
        ↓
upsertAlbumLibraryProjection
        ↓
albumLibraryItems.appearsInForLater (+ existing RYM denorm)
        ↓
smartPlaylists.resolveForLaterMatches
  → index appearsInForLater
  → genre match on primaryGenres/secondaryGenres
```

## Testing

- Source/unit: projection sets `appearsInForLater` true/false for active vs soft-deleted for-later membership.
- Source: soft-delete / mark-as-single mutations call library projection refresh.
- Source: smart playlist forLater genre matching uses library genres / `appearsInForLater`, does not require `forLaterAlbumItems.rymScrapeId` or live `rateYourMusicReleaseGenres` load for the forLater path.
- Manual: recipe “For Later · ambient americana · include · either” preview count aligns with For Later filtered by that genre.

## Success criteria

- Smart playlist forLater genre preview matches For Later list for the same genre include/either case that currently shows 0 vs N.
- Library rows for albums in the active for-later queue have `appearsInForLater: true`; soft-deleted / inactive do not.
- Rankings smart playlist path unchanged.
- Spec documents the three-layer model so AI multi-value filters extend facets without stuffing arrays onto library rows.
- Phase 2 facet pagination rules are explicit enough to implement without re-litigating Convex index constraints.

## Phasing

| Phase | Deliver |
|-------|---------|
| **1** (this work) | `appearsInForLater` + sync/backfill + smart playlist forLater reads library genres/membership |
| **2** (follow-on) | Library-scoped facets for RYM genres/descriptors with copied scalars; migrate For Later list queries as needed |
| **3** (follow-on) | User-scoped / membership-aware AI cover & occasion list filters; denorm additional scalars (`forLaterAddedAt`, duration) onto library if still joined |

## Open decisions resolved in this spec

- **Genre SoT for smart playlists:** library denorm, not live scrape / not `item.rymScrapeId`.
- **For-later membership on library:** yes, `appearsInForLater`.
- **Arrays on library vs facets:** arrays OK for recipe evaluation and display; facets required for paginated multi-value browse.
- **Scope of this PR-sized change:** phase 1 only; phases 2–3 specified as direction.

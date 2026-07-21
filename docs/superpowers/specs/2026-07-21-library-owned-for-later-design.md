# Library-Owned For Later Design

## Goal

Make `albumLibraryItems` the single per-user album browsing model, including For Later membership, dismissal, timestamps, and filtering. Reduce `forLaterAlbumItems` from a competing browse projection to temporary migration storage, then remove it in a later cleanup.

This migration is the prerequisite for `2026-07-21-occasion-filters-design.md`.

## Model

### Global album facts

`spotifyAlbums` remains the canonical album identity.

Album-global enrichment remains separate:

- `rateYourMusicSpotifyAlbumLinks` and RYM scrape tables
- RYM genres and descriptors
- `albumEnrichments`
- `albumOccasionFacets`
- `albumCoverDescriptorFacets`

These tables own enrichment facts. Filterable values are copied onto library rows.

### Per-user album

`albumLibraryItems` becomes the canonical per-user album row and the only browse/filter projection.

Add:

```ts
forLater: v.optional(
	v.object({
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		playlistAddedAt: v.optional(v.number()),
		dismissedAt: v.optional(v.number()),
	}),
),
isActiveForLater: v.boolean(),
```

During rollout, `isActiveForLater` is optional until every existing row is backfilled.

Active membership is:

```ts
forLater !== undefined &&
forLater.dismissedAt === undefined
```

`isActiveForLater` is a materialized index key for the primary For Later browse scope. It is never accepted from a client and never patched independently.

Add an index equivalent to:

```ts
.index("by_userId_isActiveForLater_createdAt", [
	"userId",
	"isActiveForLater",
	"createdAt",
])
```

Keep `appearsInForLater` temporarily for compatibility, then remove it after all readers use `isActiveForLater`.

## State semantics

For Later is an append-only ingestion queue, not a mirror of current Spotify playlist contents:

- First observation sets `firstSeenAt`.
- Every successful source observation updates `lastSeenAt`.
- Spotify playlist metadata populates `playlistAddedAt` when available.
- User soft delete sets `dismissedAt`.
- User restore clears `dismissedAt`.
- Reobserving an album in Spotify does not clear `dismissedAt`.
- Albums missing from a later Spotify sync are ignored and remain in For Later until explicitly dismissed.

Do not create source-removal state. The app intentionally remembers every album observed in the source playlist.

`markedAsSingle` is not For Later membership state. Album type belongs to the global album identity or an explicit album-level override and must not survive as a For Later browse flag.

During migration, existing `markedAsSingle` rows become dismissed to preserve their current hidden behavior. Future single handling uses global album type.

## Write ownership

Create one plain TypeScript helper that accepts existing For Later state plus an event and returns:

```ts
{
	forLater: LibraryForLaterState;
	isActiveForLater: boolean;
}
```

All mutations that observe playlist membership, dismiss, or restore call this helper and patch both fields atomically.

The helper is the sole owner of the materialized boolean. No mutation may accept `isActiveForLater` as an argument.

During migration, the same mutation may mirror writes one-way to `forLaterAlbumItems` for rollback. Do not build bidirectional synchronization.

## Read model

After cutover, the For Later list starts from:

```text
albumLibraryItems
  → userId + isActiveForLater index
  → filterWith(all flexible predicates)
  → hydrate only details not already projected
  → paginate matching rows
```

All Albums, For Later, and Rankings become scopes over `albumLibraryItems`:

- All Albums: user membership
- For Later: `isActiveForLater`
- Rankings: existing Rankings membership

The existing `maximumRowsRead`, `pageStatus`, and `splitCursor` behavior remains.

For Later UI actions use the library row's `albumId` and user identity. They no longer require a `forLaterAlbumItems` ID.

## Migration

### Phase 1: widen and centralize

1. Add optional `forLater` and `isActiveForLater`.
2. Add the new index.
3. Introduce the single state-transition helper.
4. Route current For Later writes through it.
5. Continue writing legacy rows one-way for rollback.

### Phase 2: backfill and verify

Backfill library rows in bounded batches:

1. Query legacy For Later rows by user.
2. Reconcile duplicate legacy rows deterministically.
3. Find or create the matching `(userId, albumId)` library row.
4. Copy timestamps, source presence, and dismissal.
5. Derive `isActiveForLater`.

Verify:

- active counts per user match the legacy definition;
- dismissed albums remain dismissed;
- legacy `markedAsSingle` rows become dismissed;
- timestamps match sampled legacy rows;
- every migrated library row has a materialized boolean.

### Phase 3: read cutover

1. Switch For Later list, options, counts, recommendations, and row actions to library rows.
2. Switch smart-playlist For Later sourcing to `isActiveForLater`.
3. Keep one-way legacy writes for a short rollback window.
4. Compare active counts and sampled results.

### Phase 4: write cutover and cleanup

1. Stop legacy writes.
2. Make library state canonical.
3. Remove legacy readers.
4. Remove For Later-specific filter projection and facet maintenance.
5. Remove `forLaterAlbumItems` and its indexes in a later schema deploy.
6. Make `isActiveForLater` required.
7. Remove `appearsInForLater`.

Cleanup is a separate implementation plan and occurs only after production verification.

## Failure handling

- Spotify sync never marks unseen albums absent.
- Remove the unused legacy source-removal mutation and helper instead of carrying that behavior forward.
- Backfill is idempotent and cursor-based.
- Missing legacy rows do not erase valid library state.
- Duplicate legacy rows are logged and resolved deterministically.
- Projection refreshes patch only changed fields to avoid unnecessary reactive invalidation.
- Migration verification failure blocks read cutover.

## Testing

Test the state helper first:

- first observation;
- repeated observation;
- dismissal;
- restore;
- reobservation while dismissed;
- materialized boolean always matches derived state.

Add migration tests for duplicate reconciliation, missing timestamps, idempotency, and active-count parity.

Add read-path tests proving For Later uses `albumLibraryItems`, preserves matching-item pagination, and does not require a legacy row ID.

## Out of scope

- Multiple source playlists
- Append-only membership history
- Per-track membership
- Occasion filter UI and recipe fields
- Removing the legacy table in the same deploy as read cutover
- Moving album-global enrichment ownership into library rows

If multiple independently queryable sources appear later, introduce a membership table keyed by `(userId, albumId, sourceId)` and retain a summarized library projection.

## Success criteria

- `albumLibraryItems` directly represents For Later presence, dismissal, and timestamps.
- For Later browsing and filtering query only library rows.
- Soft-deleted albums remain understood by the library row.
- Spotify absence never removes an album from the app's append-only For Later queue.
- Smart-playlist For Later sourcing uses the same active membership definition.
- Legacy storage can be disabled without changing visible results.

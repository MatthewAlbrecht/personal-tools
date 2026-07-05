# Albums All Pagination and Projection — Product/Technical Spec

## Overview

`/albums/all` currently calls `api.spotify.listAlbumLibraryRows` and receives the full album library in one Convex query. The client then filters and sorts all rows locally. This is too large for production as the library grows because each row is hydrated from multiple sources: `spotifyAlbums`, `userAlbums`, RYM links/scrapes/taxonomy, and Rob's ranking tables.

The fix is to add a denormalized album-library projection table and paginate over that table. This moves expensive row assembly out of the hot read path and gives `/albums/all` bounded query size.

## Goals

- Replace the unbounded `/albums/all` query with cursor pagination.
- Preserve the current filters: search, RYM status, Rob ranking status, listen status, album type, release year.
- Preserve the current sorts: recent and artist name.
- Keep row rendering behavior and album actions unchanged.
- Make the production query size bounded even when the total album library is large.
- Provide a path to exact counts from projection data without rehydrating every row.

## Non-Goals

- Redesigning the `/albums/all` UI.
- Adding new filters or sort modes.
- Changing album rating/listen/RYM association behavior.
- Solving every possible compound-index combination in the first pass.
- Removing the existing `listAlbumLibraryRows` query immediately if other code still needs it.

## Current Behavior

`src/app/albums/all/page.tsx` fetches:

```typescript
useQuery(api.spotify.listAlbumLibraryRows, userId ? { userId } : "skip")
```

`src/app/albums/_components/all-albums-view.tsx` then:

1. Parses URL-backed filter state.
2. Extracts available years from the full result set.
3. Filters all rows in memory with `rowMatchesAlbumLibraryFilters`.
4. Sorts the filtered array by recent or artist.
5. Renders every matching row.

The backend query in `convex/spotify.ts`:

- loads all `spotifyAlbums`;
- loads all `userAlbums` for the user;
- loads all Rob ranking years and ranking entries for the user;
- loads all RYM album links;
- loads scrapes and taxonomy for linked albums;
- returns every row.

## Proposed Design

### Projection Table

Add `albumLibraryItems` to `convex/schema.ts`, one row per `(userId, albumId)`.

Fields:

```typescript
userId: string;
albumId: Id<"spotifyAlbums">;
spotifyAlbumId: string;

name: string;
artistName: string;
artistSortKey: string;
albumSortKey: string;
imageUrl?: string;
releaseDate?: string;
releaseYear?: number;
totalTracks: number;
albumType: "album" | "single";
createdAt: number;
updatedAt: number;

listenCount: number;
firstListenedAt?: number;
lastListenedAt?: number;
rating?: number;
filterHasListened: boolean;

rymStatus: "linked" | "unlinked";
rymNotOnSite?: boolean;
rymScrapeId?: Id<"rateYourMusicScrapes">;
rymLinkMethod?: "spotify_id" | "title_artist" | "manual";
rymUrl?: string;
rymLinkedAt?: number;

appearsInRobRankings: boolean;
robRankingYears: number[];

primaryGenres: Array<{ key: string; label: string }>;
secondaryGenres: Array<{ key: string; label: string }>;
descriptors: Array<{ key: string; label: string }>;

searchText: string;
```

Indexes:

```typescript
.index("by_userId_albumId", ["userId", "albumId"])
.index("by_userId_createdAt", ["userId", "createdAt"])
.index("by_userId_artistSortKey_albumSortKey", [
  "userId",
  "artistSortKey",
  "albumSortKey",
])
.index("by_userId_releaseYear_createdAt", ["userId", "releaseYear", "createdAt"])
.index("by_userId_filterHasListened_createdAt", [
  "userId",
  "filterHasListened",
  "createdAt",
])
.index("by_userId_rymStatus_createdAt", ["userId", "rymStatus", "createdAt"])
.index("by_userId_albumType_createdAt", ["userId", "albumType", "createdAt"])
.index("by_userId_appearsInRobRankings_createdAt", [
  "userId",
  "appearsInRobRankings",
  "createdAt",
])
```

The first implementation can use the recent index as a fallback and post-filter within bounded scans, matching the existing For Later pagination pattern. The more specific indexes let common single-filter cases avoid broad scans.

### Projection Maintenance

Create helper functions in `convex/_utils/albumLibraryProjection.ts`:

- `normalizeAlbumLibrarySearchText(rowParts)`
- `buildAlbumLibraryProjectionForAlbum(ctx, { userId, albumId })`
- `upsertAlbumLibraryProjection(ctx, { userId, albumId })`
- `deleteAlbumLibraryProjection(ctx, { userId, albumId })`

The helper should assemble the row once and write it to `albumLibraryItems`.

Update projection rows from the source-of-truth write paths that affect fields shown or filtered by `/albums/all`:

| Source change | Existing write path | Projection action |
|---|---|---|
| Spotify album display/sort fields change | `spotify.upsertAlbum` | Refresh all projection rows for that `albumId`, because `name`, `artistName`, image, release year, total tracks, album type, and sort/search keys may change. |
| RYM not-on-site flag changes | `spotify.setSpotifyAlbumRymNotOnSite` | Refresh all projection rows for that `albumId`. |
| RYM link is inserted or updated | `linkRymScrapeToSpotifyAlbum` in `convex/_utils/albumMatching.ts` | Refresh all projection rows for that `albumId`. Put the hook here rather than only in UI mutations, because manual association, automatic matching, For Later matching, and scrape-to-album matching all funnel through this helper. |
| User records an album listen | `spotify.recordAlbumListen`, `spotify.addManualAlbumListen` | Refresh the projection row for that `(userId, albumId)` after the `userAlbums` upsert. |
| User deletes an album listen | `spotify.deleteAlbumListen` | Refresh the projection row for that `(userId, albumId)` after the `userAlbums` update/delete. |
| User updates rating | `spotify.updateAlbumRating` | Refresh the projection row for that `(userId, albumId)` after patching `userAlbums`. |
| Spotify album is added to Rob's rankings | `robRankings.addAlbumToYear`, `robRankings.replaceYearFromAlbums` | Refresh affected `(userId, albumId)` rows so `appearsInRobRankings` and `robRankingYears` update. |
| Spotify album is removed from Rob's rankings | `robRankings.removeAlbumFromYear`, `robRankings.replaceYearFromAlbums` deleting old entries | Refresh affected `(userId, albumId)` rows so `appearsInRobRankings` and `robRankingYears` update. |
| Ranking entry is converted from Spotify-linked to manual | `robRankings.updateRankingAlbumManual` | Refresh the old `(userId, albumId)` row before/after clearing `albumId`, because that album may no longer appear in rankings. |

These ranking changes do **not** need projection refreshes because the current album library only stores whether an album appears and the list of ranking years, not positions or publish state:

- `robRankings.setYearPublished`
- `robRankings.updateAlbumPosition`
- `robRankings.batchUpdatePositions`
- `robRankings.setRankingArtistNames`
- `robRankings.addManualAlbumToYear` unless a future version links manual entries to `spotifyAlbums`.

Add a backfill mutation/action that scans existing albums for a user and creates projection rows in batches.

### Paginated Query

Add a new query in `convex/spotify.ts`:

```typescript
export const listAlbumLibraryRowsPaginated = query({
  args: {
    userId: v.string(),
    filters: albumLibraryFiltersValidator,
    sortBy: v.union(v.literal("recent"), v.literal("artist")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(albumLibraryRowValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const query =
      args.sortBy === "artist"
        ? ctx.db
            .query("albumLibraryItems")
            .withIndex("by_userId_artistSortKey_albumSortKey", (q) =>
              q.eq("userId", args.userId),
            )
        : ctx.db
            .query("albumLibraryItems")
            .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
            .order("desc");

    const batch = await query.paginate(args.paginationOpts);

    return {
      ...batch,
      page: batch.page.filter((row) =>
        rowMatchesAlbumLibraryProjectionFilters(row, args.filters),
      ),
    };
  },
});
```

Filtering rules stay equivalent to `rowMatchesAlbumLibraryFilters`:

- `releaseYear`
- `rymStatus`
- `albumType`
- `appearsInRobRankings`
- `filterHasListened`
- `searchText.includes(search)`

Sorting:

- `recent`: `createdAt` descending.
- `artist`: use `by_userId_artistSortKey_albumSortKey` in ascending index order. `artistSortKey` and `albumSortKey` should be lowercased/trimmed sort keys derived from `artistName` and `name`.

### Counts

First pass should not block pagination on exact counts.

Recommended UX:

- Show `Showing N loaded`.
- Show `Load more` while status is `CanLoadMore`.

Once projection is in place, add a separate count query if needed:

```typescript
export const countAlbumLibraryRows = query({
  args: { userId: v.string(), filters: albumLibraryFiltersValidator },
  returns: v.number(),
});
```

That count should scan `albumLibraryItems` only, never rehydrate from source tables. This is acceptable as a follow-up because the projection table is much cheaper to scan than the current joined query.

### Frontend

`src/app/albums/all/page.tsx` should use `usePaginatedQuery` instead of `useQuery`.

`AllAlbumsView` should receive:

```typescript
albums: AlbumLibraryRowData[];
isLoading: boolean;
canLoadMore: boolean;
isLoadingMore: boolean;
onLoadMore: () => void;
```

Filtering and sorting should move out of `AllAlbumsView` and into query args. The component should keep URL parsing/serialization, render controls, render results, and show a `Load more` button.

Available years should come from a small query over `albumLibraryItems` for that user, not from the full rows array.

## Data Flow

```text
source tables
  spotifyAlbums
  userAlbums
  rateYourMusicSpotifyAlbumLinks
  rateYourMusicScrapes
  rateYourMusicReleaseGenres
  rateYourMusicReleaseDescriptors
  robRankingYears / robRankingAlbums
        |
        v
albumLibraryItems projection
        |
        v
listAlbumLibraryRowsPaginated
        |
        v
/albums/all usePaginatedQuery
```

## Error Handling

- If projection row build cannot find the album, delete any stale projection row.
- If RYM scrape/taxonomy is missing, keep the row with empty taxonomy and `rymStatus` based on link presence.
- If projection backfill is incomplete, the page may show fewer rows until backfill catches up; surface this only in developer/admin context.
- Keep existing user-facing mutation toasts unchanged.

## Testing

Add focused tests for:

- projection search text normalization;
- filter predicate parity with `rowMatchesAlbumLibraryFilters`;
- sort key generation for artist/name;
- source-level or unit coverage that `/albums/all` uses `usePaginatedQuery`;
- source-level coverage that the backend query uses `paginationOptsValidator`.

Manual verification:

- Load `/albums/all` with no filters and confirm initial page is bounded.
- Apply each filter and confirm rows match previous behavior.
- Switch sort modes and confirm order.
- Use `Load more` repeatedly.
- Confirm album actions still work on paginated rows.

## Rollout

1. Add schema and projection helpers.
2. Add backfill function and run it in development.
3. Add paginated query and available-years query.
4. Switch `/albums/all` to `usePaginatedQuery`.
5. Keep old `listAlbumLibraryRows` temporarily for rollback.
6. Verify in production, then remove old query later if unused.

## Success Criteria

- `/albums/all` no longer fetches the full album library in one request.
- Query response size is bounded by page size.
- Existing filters and sort controls still work.
- The page can load more results without resetting filters.
- `pnpm typecheck` passes.
- Focused tests pass.

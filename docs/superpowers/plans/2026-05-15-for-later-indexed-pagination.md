# For Later indexed pagination & querying

## Implemented

- **Scalar facets**: compound indexes on `forLaterAlbumItems` + indexed pagination when `forLaterFiltersAllowIndexedScan` (no genre/descriptor/search).
- **Denormalized projection**: `filterGenreKeysSorted`, `filterDescriptorKeysSorted`, scalar booleans/year, `**filterSearchText`** (album title + artist) kept in sync via `syncForLaterItemFilterProjection`.
- `**projectionMatchesFilters**`: genre/descriptor ALL/ANY among selected tags; core facets (search/year/listened/RYM) always AND — uses projection fields before hydrate.
- **Text search**: Convex **full-text search** index `search_forLaterAlbumItems` on `filterSearchText`, with optional equality narrowing on userId + scalar projection fields in the search filter expression. List loads use **one `.paginate()`** against that stream; taxonomy facets still enforced per doc via projection + `rowMatchesFilters` after hydrate.
- **Genre facet table** `forLaterAlbumGenreFacets`: one row per `(itemId, genreKey)`, index `by_userId_genreKey_lastSeenAt`. Sync after projection patch.
- **Descriptor facet table** `forLaterAlbumDescriptorFacets`: one row per `(itemId, descriptorKey)`, index `by_userId_descriptorKey_lastSeenAt`. Sync after projection patch.
- **Single-stream facet pagination**: When exactly one facet dimension narrows (one genre key for ALL or ANY, or one descriptor key when the genre facet branch does not apply), **one** `.paginate()` on that facet index.
- **Legacy playlist pagination**: `by_userId_lastSeenAt` + overscan (`forLaterPostFilterScanSize`) when facet pagination cannot apply — including **genre/descriptor ANY with multiple keys**, because Convex allows **only one `.paginate()` per query function** (no multi-stream union inside `listForLaterAlbumRows`).

## Tradeoffs (explicit)

- **Search results are relevance-ordered by Convex**, not `lastSeenAt` playlist order; each returned page is still `sortForLaterRows` among rows in that page only.
- **Multi-key ANY** cannot use merged facet pagination in the same Convex query as `usePaginatedQuery`; overscan on the playlist stream applies instead.
- **Stale projection**: hydrate + `rowMatchesFilters` remains authoritative if projection or facet rows lag.

## Ops

Re-run filter projection backfill so projection fields, `**filterSearchText`, genre facet rows, and descriptor facet rows** are populated for existing items (header **Backfill filter fields** or `pnpm backfill:for-later-projection`).
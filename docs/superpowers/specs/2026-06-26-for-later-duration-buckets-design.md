# For Later Duration Bucket Fan-Out — Design Spec

## Problem

Duration list filters use `durationMinMinutes` / `durationMaxMinutes` applied **after** indexed pagination via `projectionMatchesFilters` / `rowMatchesFilters`. Sparse matches make “Load more” advance the cursor without adding visible rows — the same class of bug fixed for genre/descriptor facets.

Recommendation wizard uses coarse `short` / `medium` / `long` tiers without per-bucket counts from the active backlog.

## Goals

1. Fix duration-filter pagination (“load more adds nothing”).
2. Fan out **seven minute buckets** with counts (list filters + recommendation wizard).
3. Mirror genre/descriptor facet-table pattern for indexed duration-bucket pagination.

## Non-Goals

- Changing genre/descriptor pagination behavior.
- Bulk destructive backfill (projection sync / existing backfill script only).
- Removing custom min/max duration inputs (kept alongside bucket pills).

## Bucket Model

Canonical keys (half-open minute ranges on `filterDurationMs`):

| Key | Range (minutes) |
|-----|-----------------|
| `under_20` | [0, 20) |
| `20_30` | [20, 30) |
| `30_40` | [30, 40) |
| `40_50` | [40, 50) |
| `50_60` | [50, 60) |
| `60_70` | [60, 70) |
| `70_plus` | [70, ∞) |

## Data Model

### `forLaterAlbumItems`

- `filterDurationBucketKey?: string` — computed from `filterDurationMs` in `syncForLaterItemFilterProjection`.

### `forLaterAlbumDurationFacets`

One row per `(itemId, durationBucketKey)` when duration is known:

- `userId`, `itemId`, `durationBucketKey`, `lastSeenAt`
- Index: `by_userId_durationBucketKey_lastSeenAt`
- Index: `by_itemId` (sync replace)

## Filter State

- URL param: `durationBucket` (explicit bucket key).
- Legacy: `durationMin` / `durationMax` still supported for custom ranges.
- When `durationBucket` is set, bucket match takes precedence over min/max in predicates.
- `forLaterFiltersAllowIndexedScan` → `false` when bucket or min/max duration active.
- `forLaterFiltersAllowDurationFacetPagination` → `true` when `durationBucket` set (no search).

## Pagination

In `loadForLaterAlbumRows`, after genre/descriptor facet branches:

- Paginate `forLaterAlbumDurationFacets` on `by_userId_durationBucketKey_lastSeenAt`.
- Use `forLaterPostFilterScanSize(requested)` + `hydrateMatchingRowsFromFacetItemRefs` for co-filters.

## Recommendation Wizard

- Replace `durationTier` (`short`/`medium`/`long`) with `durationBucket` (bucket keys + `any`).
- `listForLaterRecommendationOptions` returns `durations: RecommendationOption[]` with counts from active backlog.
- UI shows static bucket labels + counts like genre step; legacy `durationTier` accepted in stored answers only.

## Backfill

Existing items receive `filterDurationBucketKey` and facet rows on next projection sync or `pnpm backfill:for-later-projection`.

## Verification

- Unit tests: bucket assignment, facet eligibility, bucket matching, recommendation counts.
- Manual: filter by a bucket with >30 matches → load more adds rows until exhausted.

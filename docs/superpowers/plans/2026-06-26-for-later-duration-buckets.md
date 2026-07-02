# For Later Duration Bucket Fan-Out — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-26-for-later-duration-buckets-design.md`

## Task 1: Duration bucket helpers (TDD)

- [x] Add `convex/_utils/forLaterDurationBuckets.ts` — keys, labels, `durationMsToBucketKey`, `durationBucketMatches`, `buildDurationBucketCounts`
- [x] Add `convex/_utils/forLaterDurationBuckets.test.ts`
- Verify: `node --import tsx --test convex/_utils/forLaterDurationBuckets.test.ts`

## Task 2: Schema + projection sync

- [x] `filterDurationBucketKey` on `forLaterAlbumItems`
- [x] `forLaterAlbumDurationFacets` table + indexes
- [x] `syncForLaterAlbumDurationFacets` in `convex/forLaterAlbums.ts`
- [x] Patch in `syncForLaterItemFilterProjection`

## Task 3: Filter predicates + pagination eligibility

- [x] Add `durationBucketKey` to `ForLaterUiFilters` / validators / normalize
- [x] Update `durationMsMatchesForLaterFilter` / projection + row predicates for bucket
- [x] `forLaterFiltersAllowDurationFacetPagination`; extend `forLaterFiltersAllowIndexedScan`
- [x] Duration facet branch in `loadForLaterAlbumRows`
- [x] Tests in `forLaterAlbumsUi.test.ts`, `forLaterProjectionPredicate.test.ts`

## Task 4: List filter UI + URL state

- [x] `durationBucket` in `filter-state.ts`, `types.ts`
- [x] Replace preset pills with 7 buckets + Any; optional counts query
- [x] `listForLaterDurationBucketCounts` query

## Task 5: Recommendation wizard

- [x] Replace `durationTier` → `durationBucket` in types, validators, matching
- [x] Extend `listForLaterRecommendationOptions` with `durations`
- [x] Update drawer UI + tests

## Task 6: Verify

- [x] `node --import tsx --test convex/_utils/forLater*.test.ts src/app/for-later-albums/_utils/*.test.ts`
- [x] `pnpm typecheck`

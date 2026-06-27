# For Later Duration Bucket Fan-Out — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-26-for-later-duration-buckets-design.md`

## Task 1: Duration bucket helpers (TDD)

- [ ] Add `convex/_utils/forLaterDurationBuckets.ts` — keys, labels, `durationMsToBucketKey`, `durationBucketMatches`, `buildDurationBucketCounts`
- [ ] Add `convex/_utils/forLaterDurationBuckets.test.ts`
- Verify: `node --import tsx --test convex/_utils/forLaterDurationBuckets.test.ts`

## Task 2: Schema + projection sync

- [ ] `filterDurationBucketKey` on `forLaterAlbumItems`
- [ ] `forLaterAlbumDurationFacets` table + indexes
- [ ] `syncForLaterAlbumDurationFacets` in `convex/forLaterAlbums.ts`
- [ ] Patch in `syncForLaterItemFilterProjection`

## Task 3: Filter predicates + pagination eligibility

- [ ] Add `durationBucketKey` to `ForLaterUiFilters` / validators / normalize
- [ ] Update `durationMsMatchesForLaterFilter` / projection + row predicates for bucket
- [ ] `forLaterFiltersAllowDurationFacetPagination`; extend `forLaterFiltersAllowIndexedScan`
- [ ] Duration facet branch in `loadForLaterAlbumRows`
- [ ] Tests in `forLaterAlbumsUi.test.ts`, `forLaterProjectionPredicate.test.ts`

## Task 4: List filter UI + URL state

- [ ] `durationBucket` in `filter-state.ts`, `types.ts`
- [ ] Replace preset pills with 7 buckets + Any; optional counts query
- [ ] `listForLaterDurationBucketCounts` query

## Task 5: Recommendation wizard

- [ ] Replace `durationTier` → `durationBucket` in types, validators, matching
- [ ] Extend `listForLaterRecommendationOptions` with `durations`
- [ ] Update drawer UI + tests

## Task 6: Verify

- [ ] `node --import tsx --test convex/_utils/forLater*.test.ts src/app/for-later-albums/_utils/*.test.ts`
- [ ] `pnpm typecheck`

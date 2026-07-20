# For Later Filter-Before-Paginate Design

## Goal

Make For Later filtering simple and correct: express all selected predicates in the Convex query pipeline before pagination so each visible page contains the requested number of matching albums when enough matches remain.

Performance is secondary to predictable behavior at the current personal-library scale. Specialized facet and compound-index strategies remain available for later optimization, but they do not drive the primary list query.

This is Phase 2 of the album library query-model work described in `2026-07-19-album-library-for-later-query-model-design.md`.

## Current problem

The For Later list chooses among several query strategies:

- scalar compound indexes;
- genre, descriptor, and duration facet tables;
- broad paginated scans followed by TypeScript filtering and slicing.

The last pattern can paginate a fixed number of candidates and then discard nonmatches. A request for 25 matching albums can therefore return a short page even when more matches exist beyond the scanned candidates. The strategy branches also make combinations of filters harder to reason about and test.

## Chosen approach

Use one ordered candidate stream from `forLaterAlbumItems`:

1. Select the active user's rows with the existing index that preserves current `lastSeenAt` ordering.
2. Wrap that index scan with `convex-helpers/server/stream`.
3. Apply all predicates with `filterWith()` before pagination.
4. Paginate the filtered stream.
5. Hydrate only the matching rows returned in the page.

`filterWith()` runs as TypeScript in the hosted Convex function, not in Next.js, Vercel, or the browser. Candidate documents are materialized in the Convex runtime and count toward rows and bytes read, but no filtering occurs client-side.

Do not use `convex-helpers/server/filter` for this path: its `.paginate()` filters the returned page after pagination. `server/stream` is required because its `filterWith()` predicate is applied before pagination.

## Query pipeline

```text
forLaterAlbumItems ordered by lastSeenAt
  → Convex-hosted filterWith predicate
      (search + scalars + multi-value fields)
  → paginate matching stream
  → hydrate returned matches
```

### Unified projection predicate

Reuse `projectionMatchesFilters` against the denormalized projection fields on `forLaterAlbumItems`. It covers:

- `filterReleaseYear >= yearMin`
- `filterReleaseYear <= yearMax`
- listened state
- RYM state
- marked-as-single exclusion
- removed-from-For-Later exclusion
- duration buckets and ranges
- search against `filterSearchText`
- genre membership;
- descriptor membership;
- genre `any` / `all`;
- descriptor `any` / `all`;
- combinations of these predicates.

Nonmatching documents count toward rows and bytes scanned, but they do not consume positions in the returned page. One predicate avoids separate paths whose semantics can drift.

### Ordering

Preserve the current user-visible ordering by scanning the existing user-scoped `lastSeenAt` index in descending order. Do not switch to a year-ordered or facet-ordered stream when filters are selected.

## Pagination contract

`page_size` describes matching albums, not raw candidates.

- Filtering occurs before `.paginate()`.
- Convex scans past nonmatches to fill the requested page.
- The continuation cursor advances through the underlying ordered stream.
- End-of-stream may legitimately return fewer than `page_size` items.
- Reactive updates may also affect the exact count, consistent with Convex pagination semantics.

Use a generous `maximumRowsRead` to bound one Convex execution. Return `pageStatus` and `splitCursor` from the stream pagination result alongside `page`, `isDone`, and `continueCursor`. When the limit is reached, Convex marks the result `SplitRequired`; `usePaginatedQuery` can split and continue the bounded page instead of treating it as the end.

This separates two guarantees:

1. Each Convex execution is bounded.
2. Each visible UI page is filled by continuing the same filtered stream when necessary.

No code may paginate candidates and then discard results without continuing the scan.

## Facet tables

Keep the existing For Later genre, descriptor, and duration facet tables and their synchronization code intact. The primary For Later list query will not select them.

This provides:

- a low-risk rollback path;
- retained data for future performance measurements;
- no schema deletion or backfill migration in Phase 2.

Facet tables may be reintroduced for a specific proven bottleneck. That optimization must preserve the same filter semantics, ordering, and matching-item pagination contract.

## Scope

### In scope

- Replace For Later list strategy branching with the unified filtered stream.
- Support scalar and multi-value filter combinations before pagination.
- Preserve current filter semantics, URL state, sort order, and UI.
- Bound sparse scans and continue them when needed.
- Retain existing facets without using them in the primary list path.

### Out of scope

- Migrating the For Later UI from `forLaterAlbumItems` to `albumLibraryItems`.
- Removing facet schemas, facet writes, or existing facet data.
- Changing smart playlist resolution.
- Adding new filters or changing current filter semantics.
- Creating compound indexes for every filter combination.
- Filtering albums in the browser.

## Failure and limit behavior

- Do not use unbounded `.collect()`.
- Do not treat a bounded partial scan as the end of the result set.
- Do not hide query-limit failures by returning an empty terminal page.
- Carry the continuation cursor forward when more candidates remain.
- Keep time-dependent values out of Convex queries; pass any required current timestamp as an argument.

If a filter is so sparse that repeated bounded scans materially hurt the experience, measure that path and add a targeted index or facet optimization later.

## Testing

Add behavioral coverage for:

- inclusive minimum and maximum year bounds;
- open-ended year bounds;
- listened and RYM scalar states;
- genre `any` and `all`;
- descriptor `any` and `all`;
- combined scalar, genre, and descriptor predicates;
- marked-as-single and removed-item exclusions;
- stable descending ordering;
- cursor continuity without duplicates;
- sparse matches beyond the first `page_size` candidates;
- continuation after `maximumRowsRead` produces a filled visible page;
- true end-of-stream may return a short page.

Add a regression assertion that the primary list path does not paginate and then filter or slice the returned page.

## Success criteria

- A For Later request returns up to `page_size` matching albums, not merely matches found inside `page_size` candidates.
- Year ranges and arbitrary supported filter combinations execute entirely within Convex.
- No browser-side filtering is required.
- Sparse scans continue correctly across bounded executions.
- Existing facets remain synchronized but unused by the primary list query.
- Existing sort order and filter behavior remain unchanged.

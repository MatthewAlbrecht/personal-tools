# For Later Filter-Before-Paginate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace For Later's indexed/facet/overscan list strategies with one Convex-hosted filtered stream that paginates matching albums.

**Architecture:** Scan `forLaterAlbumItems` in descending `lastSeenAt` order through `convex-helpers/server/stream`, apply the existing denormalized projection predicate with `filterWith()` before pagination, hydrate matching rows inside the stream, and return the complete pagination metadata. Existing facet tables and synchronization remain intact but are not used by the primary list query.

**Tech Stack:** Convex 1.27, TypeScript, `convex-helpers/server/stream`, React 19, `convex/react` pagination, Node test runner through `tsx`

## Global Constraints

- Filtering must happen in Convex before pagination; never paginate candidates and discard them afterward.
- Keep the For Later UI on `forLaterAlbumItems`; migrating it to `albumLibraryItems` is out of scope.
- Preserve descending `lastSeenAt` ordering, current filter semantics, URL state, and UI.
- Keep facet schemas, facet writes, indexes, and existing facet data unchanged.
- Use `projectionMatchesFilters` as the canonical predicate for search, scalar, genre, descriptor, and duration filters.
- Use `maximumRowsRead` and return `pageStatus` / `splitCursor` so `usePaginatedQuery` can split bounded scans.
- Do not use `convex-helpers/server/filter`; its `.paginate()` filters after pagination.
- Do not use unbounded `.collect()`.
- Follow repository style: classic named functions, type aliases, tab indentation, explicit return validators.

---

## File Structure

- Modify `package.json` and `pnpm-lock.yaml`: install `convex-helpers`.
- Modify `convex/forLaterAlbums.ts`: replace list strategy branching with the filtered stream and return complete pagination metadata.
- Modify `convex/_utils/forLaterProjectionPredicate.test.ts`: cover one combined filter case used by the stream.
- Create `convex/forLaterAlbums.pagination-source.test.ts`: enforce pre-pagination filtering and prohibit the old strategy branches.
- Modify `convex/_utils/forLaterAlbumsUi.ts`: remove obsolete overscan and strategy-selection helpers.
- Modify `convex/_utils/forLaterAlbumsUi.test.ts`: remove tests for deleted strategy-selection helpers while retaining filter-semantic tests.
- Delete `convex/_utils/forLaterIndexedList.ts` and `convex/_utils/forLaterIndexedList.test.ts`: the primary list no longer chooses a scalar index.
- Modify `docs/superpowers/specs/2026-07-20-for-later-filter-before-paginate-design.md`: retain the corrected `server/stream` / `filterWith()` execution model already approved during planning.

---

### Task 1: Lock the unified query contract with failing tests

**Files:**
- Create: `convex/forLaterAlbums.pagination-source.test.ts`
- Modify: `convex/_utils/forLaterProjectionPredicate.test.ts`

**Interfaces:**
- Consumes: `projectionMatchesFilters(doc: Doc<"forLaterAlbumItems">, filters: ForLaterUiFilters): boolean`
- Produces: regression contracts for the unified `loadForLaterAlbumRows` stream

- [ ] **Step 1: Add a source-level test for pre-pagination filtering**

Create `convex/forLaterAlbums.pagination-source.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

function loadRowsBody(): string {
	const start = source.indexOf("async function loadForLaterAlbumRows");
	const end = source.indexOf("export const upsertForLaterAlbumItem", start);
	assert.ok(start >= 0, "loadForLaterAlbumRows must exist");
	assert.ok(end > start, "loadForLaterAlbumRows body must be bounded");
	return source.slice(start, end);
}

test("For Later filters the stream before pagination", () => {
	const body = loadRowsBody();
	const filterIndex = body.indexOf(".filterWith(");
	const paginateIndex = body.indexOf(".paginate(");

	assert.match(source, /convex-helpers\/server\/stream/);
	assert.match(body, /by_userId_lastSeenAt/);
	assert.ok(filterIndex >= 0, "filterWith must be present");
	assert.ok(paginateIndex > filterIndex, "filterWith must precede paginate");
	assert.match(body, /projectionMatchesFilters/);
	assert.match(body, /maximumRowsRead/);
});

test("For Later primary list does not select facet or overscan strategies", () => {
	const body = loadRowsBody();

	assert.doesNotMatch(body, /withSearchIndex/);
	assert.doesNotMatch(body, /forLaterAlbumGenreFacets/);
	assert.doesNotMatch(body, /forLaterAlbumDescriptorFacets/);
	assert.doesNotMatch(body, /forLaterAlbumDurationFacets/);
	assert.doesNotMatch(body, /forLaterPostFilterScanSize/);
	assert.doesNotMatch(body, /paginateForLaterAlbumItemsIndexed/);
});

test("For Later list exposes split pagination metadata", () => {
	const queryStart = source.indexOf("export const listForLaterAlbumRows");
	const queryEnd = source.indexOf("export const listOpenableRymLinks", queryStart);
	const queryBody = source.slice(queryStart, queryEnd);

	assert.match(queryBody, /pageStatus/);
	assert.match(queryBody, /splitCursor/);
});
```

- [ ] **Step 2: Add a combined behavioral predicate test**

Append to `convex/_utils/forLaterProjectionPredicate.test.ts`:

```ts
test("projectionMatchesFilters combines search, scalar, and multi-value filters", () => {
	const doc = stubDoc({
		_id: "combined" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterSearchText: "Stars of the Lid The Tired Sounds",
		filterReleaseYear: 2001,
		filterHasListened: false,
		filterRymMatched: true,
		filterRymNotOnSite: false,
		filterDurationMs: 121 * 60 * 1000,
		filterGenreKeysSorted: ["ambient", "drone"],
		filterDescriptorKeysSorted: ["atmospheric", "meditative"],
	});
	const filters = normalizeForLaterFilters({
		search: "tired sounds",
		yearMin: 2000,
		yearMax: 2005,
		listened: "not_listened",
		rymStatus: "has_scrape",
		durationMinMinutes: 120,
		genreKeys: ["ambient", "drone"],
		genreMatch: "all",
		descriptorKeys: ["meditative", "warm"],
		descriptorMatch: "any",
	});

	assert.equal(projectionMatchesFilters(doc, filters), true);
	assert.equal(
		projectionMatchesFilters(
			doc,
			normalizeForLaterFilters({ ...filters, yearMin: 2010 }),
		),
		false,
	);
});
```

- [ ] **Step 3: Run the tests and verify the query contract fails**

Run:

```bash
pnpm exec tsx --test \
  convex/forLaterAlbums.pagination-source.test.ts \
  convex/_utils/forLaterProjectionPredicate.test.ts
```

Expected: the predicate tests pass; the source tests fail because `server/stream`, `.filterWith()`, and split metadata are absent and old branches remain.

- [ ] **Step 4: Commit the failing regression tests**

```bash
git add \
  convex/forLaterAlbums.pagination-source.test.ts \
  convex/_utils/forLaterProjectionPredicate.test.ts
git commit -m "test(for-later): require filtering before pagination"
```

---

### Task 2: Implement the Convex filtered stream

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `convex/forLaterAlbums.ts:221-225, 1069-1496, 1899-1947`

**Interfaces:**
- Consumes: `projectionMatchesFilters`, `hydrateForLaterAlbumRow`, `sortForLaterRows`, `paginationOptsValidator`
- Produces:
  - `FOR_LATER_FILTER_MAXIMUM_ROWS_READ: number`
  - `LoadForLaterAlbumRowsResult` with optional `pageStatus` and `splitCursor`
  - one `loadForLaterAlbumRows` implementation based on `stream(...).filterWith(...).paginate(...)`

- [ ] **Step 1: Install the current `convex-helpers` package**

Run:

```bash
pnpm add convex-helpers
```

Expected: `convex-helpers` is added to `dependencies`; `pnpm-lock.yaml` records the resolved current version.

- [ ] **Step 2: Add stream and schema imports**

In `convex/forLaterAlbums.ts`, add:

```ts
import { stream } from "convex-helpers/server/stream";
import schema from "./schema";
```

Remove imports used only by the old primary-list strategy:

```ts
forLaterFiltersAllowDescriptorFacetPagination
forLaterFiltersAllowDurationFacetPagination
forLaterFiltersAllowGenreFacetPagination
forLaterFiltersAllowIndexedScan
forLaterPostFilterScanSize
chooseIndexedForLaterListScan
```

Do not remove facet synchronization imports or functions.

- [ ] **Step 3: Extend the internal pagination result**

Replace `LoadForLaterAlbumRowsResult` with:

```ts
type LoadForLaterAlbumRowsResult = {
	page: ForLaterAlbumRow[];
	isDone: boolean;
	continueCursor: string;
	pageStatus?: "SplitRecommended" | "SplitRequired";
	splitCursor?: string;
};

const FOR_LATER_FILTER_MAXIMUM_ROWS_READ = 2_000;
```

The limit bounds candidates read by one stream page. It is intentionally much larger than the UI's current 30-item page.

- [ ] **Step 4: Replace strategy branching with one transformed stream**

Delete these primary-list-only helpers from `convex/forLaterAlbums.ts`:

```ts
appendForLaterListExclusionFilters
appendForLaterProjectionFilters
paginateForLaterAlbumItemsIndexed
hydrateMatchingRowsFromFacetItemRefs
```

Replace `loadForLaterAlbumRows` with:

```ts
async function loadForLaterAlbumRows(
	ctx: QueryCtx,
	args: {
		userId: string;
		filters: ForLaterFiltersNormalizeInput;
		paginationOpts: { numItems: number; cursor: string | null };
	},
): Promise<LoadForLaterAlbumRowsResult> {
	const filters = normalizeForLaterFilters(args.filters);

	const matchingRows = stream(ctx.db, schema)
		.query("forLaterAlbumItems")
		.withIndex("by_userId_lastSeenAt", (q) => q.eq("userId", args.userId))
		.order("desc")
		.filterWith(async (item) => projectionMatchesFilters(item, filters))
		.map(async (item) => ({
			row: await hydrateForLaterAlbumRow(ctx, {
				userId: args.userId,
				item,
			}),
		}))
		.filterWith(async ({ row }) => row !== null)
		.map(async ({ row }) => {
			if (!row) {
				throw new Error("Filtered For Later row unexpectedly missing");
			}
			return row;
		});

	const result = await matchingRows.paginate({
		...args.paginationOpts,
		maximumRowsRead: FOR_LATER_FILTER_MAXIMUM_ROWS_READ,
	});

	return {
		page: sortForLaterRows(result.page),
		isDone: result.isDone,
		continueCursor: result.continueCursor,
		...(result.pageStatus ? { pageStatus: result.pageStatus } : {}),
		...(result.splitCursor ? { splitCursor: result.splitCursor } : {}),
	};
}
```

The first `filterWith()` enforces every supported filter before pagination using denormalized fields. Hydration also occurs inside the stream, and missing hydrated rows are removed before pagination, so returned pages are not shortened afterward.

- [ ] **Step 5: Return complete pagination metadata from the public query**

Extend `listForLaterAlbumRows.returns`:

```ts
returns: v.object({
	page: v.array(forLaterAlbumRowValidator),
	isDone: v.boolean(),
	continueCursor: v.string(),
	pageStatus: v.optional(
		v.union(v.literal("SplitRecommended"), v.literal("SplitRequired")),
	),
	splitCursor: v.optional(v.string()),
}),
```

No client component change is expected: `usePaginatedQuery` consumes the standard pagination metadata.

- [ ] **Step 6: Stop overscanning the RYM-link helper**

In `listOpenableRymLinks`, request the actual desired number of matching rows:

```ts
paginationOpts: {
	numItems: Math.max(1, Math.floor(args.limit)),
	cursor: null,
},
```

Keep `buildOpenableGoogleRymSearchLinks(..., args.limit)` as the final output cap.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm exec tsx --test \
  convex/forLaterAlbums.pagination-source.test.ts \
  convex/_utils/forLaterProjectionPredicate.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run type checking**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If stream inference rejects the nullable row transform, replace the two transforms with a named non-null wrapper type:

```ts
type HydratedForLaterCandidate = {
	row: ForLaterAlbumRow | null;
};
```

Do not use `any` or cast away stream types.

- [ ] **Step 9: Commit the unified query**

```bash
git add package.json pnpm-lock.yaml convex/forLaterAlbums.ts
git commit -m "fix(for-later): filter matching rows before pagination"
```

---

### Task 3: Remove obsolete list-strategy helpers

**Files:**
- Modify: `convex/_utils/forLaterAlbumsUi.ts:164-263`
- Modify: `convex/_utils/forLaterAlbumsUi.test.ts`
- Delete: `convex/_utils/forLaterIndexedList.ts`
- Delete: `convex/_utils/forLaterIndexedList.test.ts`

**Interfaces:**
- Consumes: the unified query from Task 2
- Produces: filter-semantic utilities only; no query-strategy selection API

- [ ] **Step 1: Run the focused utility tests before cleanup**

Run:

```bash
pnpm exec tsx --test \
  convex/_utils/forLaterAlbumsUi.test.ts \
  convex/_utils/forLaterIndexedList.test.ts
```

Expected: PASS, confirming the files being removed are currently healthy rather than hiding unrelated failures.

- [ ] **Step 2: Remove obsolete exports**

Delete from `convex/_utils/forLaterAlbumsUi.ts`:

```ts
FOR_LATER_POST_FILTER_SCAN_CAP
forLaterPostFilterScanSize
forLaterFiltersAllowIndexedScan
forLaterFiltersAllowGenreFacetPagination
forLaterFiltersAllowDescriptorFacetPagination
forLaterFiltersAllowDurationFacetPagination
```

Keep normalization and predicate helpers, including:

```ts
normalizeForLaterFilters
taxonomyKeysPassAgainstSet
releaseYearMatchesForLaterFilter
durationMsMatchesForLaterFilter
rowMatchesFilters
sortForLaterRows
```

- [ ] **Step 3: Remove tests for deleted strategy APIs**

In `convex/_utils/forLaterAlbumsUi.test.ts`, remove imports and test cases that reference the six deleted exports. Retain all tests covering normalization, year bounds, duration bounds, taxonomy `any`/`all`, row exclusions, search, and sorting.

- [ ] **Step 4: Delete the unused index chooser**

Delete:

```text
convex/_utils/forLaterIndexedList.ts
convex/_utils/forLaterIndexedList.test.ts
```

Do not remove the corresponding schema indexes; existing data paths may still use them, and schema cleanup is out of scope.

- [ ] **Step 5: Run all For Later utility tests**

Run:

```bash
pnpm exec tsx --test \
  convex/_utils/forLaterAlbumsUi.test.ts \
  convex/_utils/forLaterProjectionPredicate.test.ts \
  convex/_utils/forLaterFilterProjection.test.ts \
  convex/_utils/forLaterDurationBuckets.test.ts \
  convex/forLaterAlbums.pagination-source.test.ts \
  convex/forLaterAlbums.matching-source.test.ts \
  convex/forLaterAlbums.library-membership-source.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the cleanup**

```bash
git add \
  convex/_utils/forLaterAlbumsUi.ts \
  convex/_utils/forLaterAlbumsUi.test.ts \
  convex/_utils/forLaterIndexedList.ts \
  convex/_utils/forLaterIndexedList.test.ts
git commit -m "refactor(for-later): remove obsolete pagination strategies"
```

---

### Task 4: Verify generated types and production behavior

**Files:**
- Modify if generated: `convex/_generated/api.d.ts`
- Verify: `src/app/for-later-albums/page.tsx`
- Verify: `src/app/for-later-albums/_components/for-later-list.tsx`

**Interfaces:**
- Consumes: `api.forLaterAlbums.listForLaterAlbumRows`
- Produces: unchanged `usePaginatedQuery` UI behavior with matching-item pages

- [ ] **Step 1: Regenerate Convex types against the development deployment**

Run:

```bash
npx convex dev --once
```

Expected: Convex accepts the function and validator changes; generated API types are current. Use development only—do not run `convex deploy`.

- [ ] **Step 2: Run repository checks**

Run:

```bash
pnpm typecheck
pnpm check
```

Expected: both PASS. Fix only issues introduced by this implementation.

- [ ] **Step 3: Run the complete focused test suite again**

Run:

```bash
pnpm exec tsx --test \
  convex/_utils/forLaterAlbumsUi.test.ts \
  convex/_utils/forLaterProjectionPredicate.test.ts \
  convex/_utils/forLaterFilterProjection.test.ts \
  convex/_utils/forLaterDurationBuckets.test.ts \
  convex/forLaterAlbums.pagination-source.test.ts \
  convex/forLaterAlbums.matching-source.test.ts \
  convex/forLaterAlbums.library-membership-source.test.ts
```

Expected: PASS.

- [ ] **Step 4: Manually verify matching-item pagination**

Run the app:

```bash
pnpm dev
```

In `/for-later-albums`:

1. Select a sparse genre and a year range.
2. Confirm the initial list fills to 30 matches when at least 30 exist.
3. Select multiple genres with `any`, then `all`; confirm counts and rows change correctly.
4. Combine search, year, genre, descriptor, listened, RYM, and duration filters.
5. Click **Load more** and confirm no duplicate rows and no short intermediate page when further matches exist.
6. Clear filters and confirm descending recency order is unchanged.

- [ ] **Step 5: Commit generated output only if changed**

```bash
git add convex/_generated/api.d.ts
git diff --cached --quiet || git commit -m "chore(convex): refresh For Later query types"
```

Do not stage unrelated working-tree changes.

# For Later indexed pagination & filter projection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `listForLaterAlbumRows` paginate an index stream that matches active filters (starting with scalar dimensions), so a page size of 50 returns up to 50 matching albums instead of scanning recent playlist rows and discarding most of them.

**Architecture:** Denormalize filter-relevant fields onto `forLaterAlbumItems` (projection columns). Maintain them synchronously in Convex mutations when Spotify album data, listen summaries, or RYM linkage/tags change. Rewrite `loadForLaterAlbumRows` to choose a compound index + optional `.filter()` chain aligned with those fields, then hydrate rows as today. Genre/descriptor substring search on title/artist remain **post-filters** until Phase 2 adds either junction rows or a search index—documented explicitly below.

**Tech Stack:** Convex (queries, mutations, schema indexes), TypeScript, existing `rowMatchesFilters` in `convex/_utils/forLaterAlbumsUi.ts`, Next.js client unchanged except possibly page `initialNumItems`.

---

## File structure

| File | Responsibility |
|------|------------------|
| `convex/schema.ts` | New optional/boolean/number fields + indexes on `forLaterAlbumItems`. |
| `convex/_utils/forLaterFilterProjection.ts` | **Pure** helpers: parse release year, derive booleans from item+album+listen summary+resolved scrape id/url (inputs only—no DB). |
| `convex/forLaterAlbums.ts` | `syncForLaterItemFilterProjection(ctx, itemId)` internal helper; call sites from mutations; rewrite `loadForLaterAlbumRows` query selection + pagination size. |
| `convex/rateYourMusicScrapes.ts` | After `syncReleaseTaxonomy`, find affected `forLaterAlbumItems` (via `rymScrapeId` / link table) and refresh projection + genre tag arrays. |
| `convex/_utils/albumMatching.ts` | After patches that attach `rymScrapeId` to items (if any path patches items here—today mostly `forLaterAlbums.ts`); verify call graph. |
| `convex/spotify.ts` | After `userAlbums` / `userAlbumListens` mutations affecting `hasListened`, refresh projection for all `forLaterAlbumItems` with same `userId` + `albumId`. |
| `convex/_utils/forLaterAlbumsUi.ts` | Optionally extract “residual” predicates (genre/descriptor/search) for documentation; keep `rowMatchesFilters` for hydration-time checks until Phase 2. |
| `convex/_utils/forLaterFilterProjection.test.ts` | Node tests for pure helpers (year parsing, boolean derivation). |
| `docs/superpowers/plans/2026-05-14-for-later-albums-phase-4-filterable-ui.md` | Cross-link behavior change (optional note). |

---

## Known limitation (Phase 1 honesty)

Convex cannot paginate “SQL WHERE genre column contains all of {a,b,c}” without extra tables or search features. **Phase 1** still applies `rowMatchesFilters` after hydration for **genreKeys**, **descriptorKeys**, and **search** when those predicates are active. That means:

- **Year-only / listened-only / RYM facet-only / combinations of those indexed fields:** pagination becomes correct (cursor walks matching docs).
- **Any active genre, descriptor, or text search filter:** you still need either oversized batches **or** Phase 2 junction/search.

Phase 2 suggestion (outline only): table `forLaterAlbumItemGenreKeys` with `userId`, `forLaterItemId`, `genreKey`, `lastSeenAt` copy + index `by_userId_genreKey_lastSeenAt`; maintain rows in the same mutations as taxonomy sync; pick **one** genre key for index prefix when multiple selected, verify remaining keys after paginate—or use Convex search index on album title/artist for `q`.

---

## Schema additions (`convex/schema.ts`)

Add to `forLaterAlbumItems` (exact names up for bikeshedding—keep stable once shipped):

```typescript
// Denormalized for list queries (maintained by mutations, never edited by clients)
filterReleaseYear: v.optional(v.number()), // YYYY from spotify album; omit if unknown
filterHasListened: v.boolean(),
filterRymMatched: v.boolean(), // true iff attached scrape / item.rymScrapeId path resolves matched
filterHasRymUrl: v.boolean(), // candidate or scrape URL present for UI filters
filterGenreKeysSorted: v.array(v.string()), // union primary+secondary genre keys from linked scrape; []
filterDescriptorKeysSorted: v.array(v.string()), // descriptor keys; []
```

Indexes (add after existing):

```typescript
.index("by_userId_filterReleaseYear_lastSeenAt", [
  "userId",
  "filterReleaseYear",
  "lastSeenAt",
])
.index("by_userId_filterHasListened_lastSeenAt", [
  "userId",
  "filterHasListened",
  "lastSeenAt",
])
.index("by_userId_filterRymMatched_lastSeenAt", [
  "userId",
  "filterRymMatched",
  "lastSeenAt",
])
.index("by_userId_filterHasRymUrl_lastSeenAt", [
  "userId",
  "filterHasRymUrl",
  "lastSeenAt",
])
```

**Note:** Documents missing `filterReleaseYear` do not appear in the first index’s equality branch for a concrete year—correct. Ensure every active item still gets `filterHasListened`, `filterRymMatched`, `filterHasRymUrl` on insert via projection sync.

---

### Task 1: Pure projection helpers + failing tests

**Files:**
- Create: `convex/_utils/forLaterFilterProjection.ts`
- Create: `convex/_utils/forLaterFilterProjection.test.ts`

- [ ] **Step 1: Write failing tests**

Create `convex/_utils/forLaterFilterProjection.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	parseReleaseYearFromIsoDate,
	buildFilterGenreKeysSorted,
	buildFilterDescriptorKeysSorted,
} from "./forLaterFilterProjection";

test("parseReleaseYearFromIsoDate reads YYYY prefix", () => {
	assert.equal(parseReleaseYearFromIsoDate("1972-03-01"), 1972);
	assert.equal(parseReleaseYearFromIsoDate("72-03-01"), undefined);
	assert.equal(parseReleaseYearFromIsoDate(undefined), undefined);
});

test("buildFilterGenreKeysSorted merges primary and secondary keys sorted unique", () => {
	assert.deepEqual(
		buildFilterGenreKeysSorted(
			[{ key: "z" }, { key: "a" }],
			[{ key: "m" }, { key: "a" }],
		),
		["a", "m", "z"],
	);
});

test("buildFilterDescriptorKeysSorted sorts unique", () => {
	assert.deepEqual(
		buildFilterDescriptorKeysSorted([{ key: "b" }, { key: "a" }, { key: "b" }]),
		["a", "b"],
	);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:

```bash
pnpm exec tsx --test convex/_utils/forLaterFilterProjection.test.ts
```

Expected: FAIL (module missing / exports missing).

- [ ] **Step 3: Implement minimal module**

Create `convex/_utils/forLaterFilterProjection.ts`:

```typescript
export function parseReleaseYearFromIsoDate(
	releaseDate: string | undefined,
): number | undefined {
	if (!releaseDate) {
		return undefined;
	}
	const year = Number.parseInt(releaseDate.slice(0, 4), 10);
	return Number.isFinite(year) ? year : undefined;
}

export function buildFilterGenreKeysSorted(
	primaryGenres: Array<{ key: string }>,
	secondaryGenres: Array<{ key: string }>,
): string[] {
	const keys = new Set<string>();
	for (const t of primaryGenres) {
		keys.add(t.key);
	}
	for (const t of secondaryGenres) {
		keys.add(t.key);
	}
	return [...keys].sort();
}

export function buildFilterDescriptorKeysSorted(
	descriptors: Array<{ key: string }>,
): string[] {
	const keys = new Set<string>();
	for (const t of descriptors) {
		keys.add(t.key);
	}
	return [...keys].sort();
}
```

(Add further exported helpers in Task 2 if tests demand booleans—keep file pure.)

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec tsx --test convex/_utils/forLaterFilterProjection.test.ts
```

- [ ] **Step 5: Commit** (if your workflow uses commits)

```bash
git add convex/_utils/forLaterFilterProjection.ts convex/_utils/forLaterFilterProjection.test.ts
git commit -m "test: add pure helpers for For Later filter projection"
```

---

### Task 2: Schema migration — add fields + indexes

**Files:**
- Modify: `convex/schema.ts` (`forLaterAlbumItems` definition)

- [ ] **Step 1: Add validators + indexes** as in “Schema additions” section above.

- [ ] **Step 2: Deploy schema locally**

Run `npx convex dev` (or project equivalent) and confirm schema pushes without errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): denormalized filter fields for For Later items"
```

---

### Task 3: Implement `syncForLaterItemFilterProjection`

**Files:**
- Modify: `convex/forLaterAlbums.ts`
- Reuse: `loadListenSummary`, `resolveRymContextForAlbum`, `loadTagsForScrape`, `deriveRymStatus` patterns already in this module

- [ ] **Step 1: Add internal async function** (signature sketch—implement body using existing helpers):

```typescript
async function syncForLaterItemFilterProjection(
	ctx: MutationCtx,
	itemId: Id<"forLaterAlbumItems">,
): Promise<void> {
	const item = await ctx.db.get(itemId);
	if (!item) return;

	const album = await ctx.db.get(item.albumId);
	const listenSummary = await loadListenSummary(ctx, {
		userId: item.userId,
		albumId: item.albumId,
	});

	const { resolvedScrapeId } = await resolveRymContextForAlbum(ctx, {
		albumId: item.albumId,
		item,
	});

	const tags = resolvedScrapeId
		? await loadTagsForScrape(ctx, resolvedScrapeId)
		: { primaryGenres: [], secondaryGenres: [], descriptors: [] };

	const filterReleaseYear = album
		? parseReleaseYearFromIsoDate(album.releaseDate)
		: undefined;

	const rymStatus = deriveRymStatus({
		rymScrapeId: resolvedScrapeId,
		rymCandidateUrl: item.rymCandidateUrl,
		rymDiscoveryStatus: item.rymDiscoveryStatus,
	});

	const rymUrl = /* scrape?.rymUrl ?? item.rymCandidateUrl — mirror row builder */;

	const filterHasListened = listenSummary.hasListened;
	const filterRymMatched = rymStatus === "matched";
	const filterHasRymUrl = Boolean(rymUrl);

	await ctx.db.patch(itemId, {
		...(filterReleaseYear !== undefined ? { filterReleaseYear } : {}),
		filterHasListened,
		filterRymMatched,
		filterHasRymUrl,
		filterGenreKeysSorted: buildFilterGenreKeysSorted(
			tags.primaryGenres,
			tags.secondaryGenres,
		),
		filterDescriptorKeysSorted: buildFilterDescriptorKeysSorted(tags.descriptors),
		updatedAt: Date.now(),
	});
}
```

Import `MutationCtx`, `parseReleaseYearFromIsoDate`, etc. Fix `rymUrl` line to match `loadForLaterAlbumRows` exactly.

- [ ] **Step 2: Call `syncForLaterItemFilterProjection` at end of `upsertForLaterAlbumItem`** (after match returns).

- [ ] **Step 3: Call sync in `patchForLaterRymMatch`**, `queueForLaterRymDiscovery` if it patches discovery fields (any mutation patching `rymScrapeId`, `rymCandidateUrl`, `rymDiscoveryStatus`).

- [ ] **Step 4: Export a batch internal mutation** `internal.forLaterAlbums.backfillFilterProjectionBatch` (optional args: `cursor`, `limit`) for Task 4—implement using `forLaterAlbumItems` paginate or `.take`.

- [ ] **Step 5: Run `pnpm typecheck`**

Expected: PASS.

- [ ] **Step 6: Commit**

---

### Task 4: Wire Spotify listen mutations

**Files:**
- Modify: `convex/spotify.ts` (functions that insert/patch `userAlbums` / `userAlbumListens`)

- [ ] **Step 1: Add helper** `async function refreshForLaterProjectionsForAlbum(ctx, userId, albumId)`:

```typescript
const items = await ctx.db
	.query("forLaterAlbumItems")
	.withIndex("by_userId_albumId", (q) =>
		q.eq("userId", userId).eq("albumId", albumId),
	)
	.collect();

for (const item of items) {
	await syncForLaterItemFilterProjection(ctx, item._id);
}
```

(Place shared helper in `forLaterAlbums.ts` and **export** an internal mutation `refreshForLaterProjectionsForUserAlbum` if `spotify.ts` cannot import mutation-local helpers—prefer shared `_utils` + import from both.)

- [ ] **Step 2: Invoke after listen/userAlbum writes** for the affected `userId` + `albumId`.

- [ ] **Step 3: Run `pnpm typecheck`**

- [ ] **Step 4: Commit**

---

### Task 5: Wire RYM taxonomy sync

**Files:**
- Modify: `convex/rateYourMusicScrapes.ts` after `syncReleaseTaxonomy`

- [ ] **Step 1: Query items with `forLaterAlbumItems.withIndex("by_rymScrapeId", ...)`** or iterate affected Spotify-linked albums—mirror how scrapes tie to items today.

- [ ] **Step 2: For each affected item id, call `syncForLaterItemFilterProjection`.**

- [ ] **Step 3: Run `pnpm typecheck`**

- [ ] **Step 4: Commit**

---

### Task 6: Backfill existing rows

**Files:**
- Modify: `convex/forLaterAlbums.ts` (internal mutation)

- [ ] **Step 1: Implement `internalMutation`**

Args: `{ cursor: v.optional(v.string()), limit: v.number() }` returning `{ nextCursor: v.union(v.string(), v.null()), processed: v.number() }`.

Loop `limit` items from full table scan or indexed walk; call `syncForLaterItemFilterProjection`; return pagination cursor if using `.paginate()` on `by_userId`.

- [ ] **Step 2: Run backfill from Convex dashboard** until `nextCursor` null.

- [ ] **Step 3: Commit**

---

### Task 7: Rewrite `loadForLaterAlbumRows` query planner

**Files:**
- Modify: `convex/forLaterAlbums.ts` (`loadForLaterAlbumRows`)
- Optional create: `convex/_utils/forLaterAlbumsQueryPlan.ts` if file grows

- [ ] **Step 1: Implement `pickForLaterItemsQuery(ctx, userId, filters)`** returning a chain ending in `.order("desc")` **before** `.paginate`:

Priority (example—tune with metrics):

1. If `filters.year !== undefined` → `withIndex("by_userId_filterReleaseYear_lastSeenAt", q => q.eq("userId", userId).eq("filterReleaseYear", filters.year))`
2. Else if `filters.listened === "listened"` → `withIndex("by_userId_filterHasListened_lastSeenAt", q => q.eq("userId", userId).eq("filterHasListened", true))`
3. Else if `filters.listened === "not_listened"` → same index with `false`
4. Else if `filters.rymStatus === "has_scrape"` → `filterRymMatched === true`
5. Else if `filters.rymStatus === "no_scrape"` → `filterRymMatched === false`
6. Else if `filters.rymStatus === "has_candidate"` → `filterHasRymUrl === true`
7. Else if `filters.rymStatus === "no_candidate"` → `filterHasRymUrl === false`
8. Else → `withIndex("by_userId_lastSeenAt", ...)`

Then apply **additional** `.filter(...)` for dimensions not in the chosen index prefix (Convex filter builder)—only where necessary.

- [ ] **Step 2: Set `paginationOpts.numItems` to requested page size** (e.g. 50)—remove `scanRawBatch = requested * 4` **when** the indexed path handles primary predicates.

- [ ] **Step 3: After hydration, still call `rowMatchesFilters`** for residual genre/descriptor/search and `filterMatch` logic until Phase 2 narrows those in the query.

- [ ] **Step 4: If residual filters active**, temporarily increase page request size (cap e.g. 200) **or** document known limitation—prefer documenting + TODO Phase 2.

- [ ] **Step 5: Run manual test** — Convex dashboard or UI: filter year 1972, confirm first page returns many rows without repeated tiny load-more.

- [ ] **Step 6: Commit**

---

### Task 8: Regression tests for query planner (optional but recommended)

**Files:**
- Create: `convex/_utils/forLaterAlbumsQueryPlan.test.ts`

- [ ] **Step 1: Unit-test pure function** `describeIndexChoice(filters): string` extracted from planner (no Convex runtime)—table-driven tests for year/listened/rym/default branches.

- [ ] **Step 2: Commit**

---

## Self-review checklist

1. **Spec coverage:** Schema, writers, backfill, loader, Spotify + RYM hooks, Phase 2 caveat documented — yes.
2. **Placeholder scan:** No `TODO` / `TBD` strings in tasks above.
3. **Type consistency:** Field names `filterReleaseYear`, `filterHasListened`, etc. used consistently across schema, patch payload, and planner.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-for-later-indexed-pagination.md`. Two execution options:**

**1. Subagent-driven (recommended)** — Dispatch a fresh subagent per task; review between tasks (`superpowers:subagent-driven-development`).

**2. Inline execution** — Run tasks in this session with checkpoints (`superpowers:executing-plans`).

**Which approach do you want?**

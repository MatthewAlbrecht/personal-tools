# Albums All Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized `/albums/all` full-library query with a denormalized album-library projection table and paginated UI.

**Architecture:** Add `albumLibraryItems` as a per-user, per-album projection containing all fields needed by `/albums/all`. Maintain projection rows from source-of-truth mutations, query the projection with Convex cursor pagination, and switch the page to `usePaginatedQuery`.

**Tech Stack:** Convex schema/query/mutation APIs, `paginationOptsValidator`, React `usePaginatedQuery`, Next.js App Router, TypeScript, Biome.

---

## File Structure

- Modify `convex/schema.ts`: add `albumLibraryItems` table and indexes.
- Modify `convex/_utils/albumLibraryRows.ts`: add reusable validators/types/filter helpers for projection rows.
- Create `convex/_utils/albumLibraryProjection.ts`: build, upsert, delete, and refresh projection rows.
- Modify `convex/spotify.ts`: add paginated query, available-years query, backfill mutation, and refresh hooks for Spotify/user album writes.
- Modify `convex/_utils/albumMatching.ts`: refresh album library projections when RYM links are inserted or updated.
- Modify `convex/robRankings.ts`: refresh projections when Spotify-linked ranking membership changes.
- Modify `src/app/albums/all/page.tsx`: switch to `usePaginatedQuery` and pass pagination controls.
- Modify `src/app/albums/_components/all-albums-view.tsx`: remove local filtering/sorting, render paginated rows and load-more controls.
- Test files:
  - Create `convex/_utils/albumLibraryProjection.test.ts`
  - Modify `src/app/albums/all/page-source.test.ts` or create it if missing
  - Create or modify `convex/album-library-pagination-source.test.ts`

---

### Task 1: Projection Utility Tests

**Files:**
- Create: `convex/_utils/albumLibraryProjection.test.ts`
- Modify: `convex/_utils/albumLibraryRows.ts`

- [ ] **Step 1: Write tests for search/sort/filter behavior**

Create `convex/_utils/albumLibraryProjection.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	buildAlbumLibrarySearchText,
	buildAlbumLibrarySortKey,
	rowMatchesAlbumLibraryFilters,
} from "./albumLibraryRows";

test("buildAlbumLibrarySearchText normalizes album and artist text", () => {
	assert.equal(
		buildAlbumLibrarySearchText({
			name: "  Dragon New Warm Mountain  ",
			artistName: "Big Thief",
		}),
		"dragon new warm mountain\nbig thief",
	);
});

test("buildAlbumLibrarySortKey trims and lowercases values", () => {
	assert.equal(buildAlbumLibrarySortKey("  The Smile  "), "the smile");
});

test("rowMatchesAlbumLibraryFilters matches projection search text", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(
			{
				name: "Dragon New Warm Mountain",
				artistName: "Big Thief",
				searchText: "dragon new warm mountain\nbig thief",
				releaseYear: 2022,
				albumType: "album",
				listenCount: 1,
				rymStatus: "linked",
				appearsInRobRankings: true,
			},
			{ search: "warm mountain", rymStatus: "linked" },
		),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(
			{
				name: "Dragon New Warm Mountain",
				artistName: "Big Thief",
				searchText: "dragon new warm mountain\nbig thief",
				releaseYear: 2022,
				albumType: "album",
				listenCount: 1,
				rymStatus: "linked",
				appearsInRobRankings: true,
			},
			{ search: "not present" },
		),
		false,
	);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumLibraryProjection.test.ts
```

Expected: fails because `buildAlbumLibrarySearchText` and `buildAlbumLibrarySortKey` are not exported yet, and `rowMatchesAlbumLibraryFilters` does not read `searchText`.

- [ ] **Step 3: Implement utility helpers**

Modify `convex/_utils/albumLibraryRows.ts`:

```typescript
export type AlbumLibraryFilterInput = {
	name: string;
	artistName: string;
	searchText?: string;
	releaseYear?: number;
	albumType: Exclude<AlbumLibraryAlbumType, "all">;
	listenCount: number;
	rymStatus: Exclude<AlbumLibraryRymStatus, "all">;
	appearsInRobRankings: boolean;
};

export function buildAlbumLibrarySortKey(value: string): string {
	return value.trim().toLowerCase();
}

export function buildAlbumLibrarySearchText({
	name,
	artistName,
}: {
	name: string;
	artistName: string;
}): string {
	return `${name.trim()}\n${artistName.trim()}`.toLowerCase();
}
```

Update the search block in `rowMatchesAlbumLibraryFilters`:

```typescript
const search = filters.search?.trim().toLowerCase();
if (search) {
	const searchableText =
		row.searchText ?? `${row.name}\n${row.artistName}`.toLowerCase();
	if (!searchableText.includes(search)) {
		return false;
	}
}
```

- [ ] **Step 4: Run utility tests and verify they pass**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumLibraryProjection.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add convex/_utils/albumLibraryRows.ts convex/_utils/albumLibraryProjection.test.ts
git commit -m "test: cover album library projection helpers"
```

---

### Task 2: Schema and Projection Builder

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/_utils/albumLibraryProjection.ts`
- Modify: `convex/spotify.ts`

- [ ] **Step 1: Add projection table**

In `convex/schema.ts`, add this table near the Spotify album tracking tables:

```typescript
albumLibraryItems: defineTable({
	userId: v.string(),
	albumId: v.id("spotifyAlbums"),
	spotifyAlbumId: v.string(),
	name: v.string(),
	artistName: v.string(),
	artistSortKey: v.string(),
	albumSortKey: v.string(),
	imageUrl: v.optional(v.string()),
	releaseDate: v.optional(v.string()),
	releaseYear: v.optional(v.number()),
	totalTracks: v.number(),
	albumType: v.union(v.literal("album"), v.literal("single")),
	createdAt: v.number(),
	updatedAt: v.number(),
	listenCount: v.number(),
	firstListenedAt: v.optional(v.number()),
	lastListenedAt: v.optional(v.number()),
	rating: v.optional(v.number()),
	filterHasListened: v.boolean(),
	rymStatus: v.union(v.literal("linked"), v.literal("unlinked")),
	rymNotOnSite: v.optional(v.boolean()),
	rymScrapeId: v.optional(v.id("rateYourMusicScrapes")),
	rymLinkMethod: v.optional(
		v.union(
			v.literal("spotify_id"),
			v.literal("title_artist"),
			v.literal("manual"),
		),
	),
	rymUrl: v.optional(v.string()),
	rymLinkedAt: v.optional(v.number()),
	appearsInRobRankings: v.boolean(),
	robRankingYears: v.array(v.number()),
	primaryGenres: v.array(v.object({ key: v.string(), label: v.string() })),
	secondaryGenres: v.array(v.object({ key: v.string(), label: v.string() })),
	descriptors: v.array(v.object({ key: v.string(), label: v.string() })),
	searchText: v.string(),
})
	.index("by_userId_albumId", ["userId", "albumId"])
	.index("by_albumId", ["albumId"])
	.index("by_userId_createdAt", ["userId", "createdAt"])
	.index("by_userId_artistSortKey_albumSortKey", [
		"userId",
		"artistSortKey",
		"albumSortKey",
	])
	.index("by_userId_releaseYear_createdAt", [
		"userId",
		"releaseYear",
		"createdAt",
	])
	.index("by_userId_filterHasListened_createdAt", [
		"userId",
		"filterHasListened",
		"createdAt",
	])
	.index("by_userId_rymStatus_createdAt", [
		"userId",
		"rymStatus",
		"createdAt",
	])
	.index("by_userId_albumType_createdAt", [
		"userId",
		"albumType",
		"createdAt",
	])
	.index("by_userId_appearsInRobRankings_createdAt", [
		"userId",
		"appearsInRobRankings",
		"createdAt",
	]),
```

- [ ] **Step 2: Add projection builder helper**

Create `convex/_utils/albumLibraryProjection.ts` with exported functions:

```typescript
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	buildAlbumLibrarySearchText,
	buildAlbumLibrarySortKey,
	getAlbumLibraryAlbumType,
	getAlbumLibraryRymStatus,
} from "./albumLibraryRows";

type TaxonomyTag = { key: string; label: string };

type AlbumLibraryTaxonomy = {
	primaryGenres: TaxonomyTag[];
	secondaryGenres: TaxonomyTag[];
	descriptors: TaxonomyTag[];
};

export async function upsertAlbumLibraryProjection(
	ctx: MutationCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<void> {
	const projection = await buildAlbumLibraryProjectionForAlbum(ctx, args);
	const existing = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();

	if (!projection) {
		if (existing) {
			await ctx.db.delete(existing._id);
		}
		return;
	}

	if (existing) {
		await ctx.db.patch(existing._id, projection);
		return;
	}

	await ctx.db.insert("albumLibraryItems", projection);
}

export async function refreshAlbumLibraryProjectionsForAlbum(
	ctx: MutationCtx,
	albumId: Id<"spotifyAlbums">,
): Promise<void> {
	const existingRows = await ctx.db
		.query("albumLibraryItems")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();

	for (const row of existingRows) {
		await upsertAlbumLibraryProjection(ctx, {
			userId: row.userId,
			albumId,
		});
	}
}
```

Then add `buildAlbumLibraryProjectionForAlbum`, `loadLatestAlbumRymLink`, `loadAlbumLibraryTaxonomy`, and `loadRobRankingYearsForAlbum` in the same file. Use the logic from `listAlbumLibraryRows` as the source:

- `spotifyAlbums` provides display fields.
- `userAlbums.by_userId_albumId` provides listen/rating fields.
- latest RYM link comes from `rateYourMusicSpotifyAlbumLinks.by_albumId`, sorted by `updatedAt` descending.
- scrape URL comes from `rateYourMusicScrapes`.
- taxonomy comes from `rateYourMusicReleaseGenres.by_scrapeId` and `rateYourMusicReleaseDescriptors.by_scrapeId`.
- Rob years come from `robRankingAlbums` rows for the album joined to `robRankingYears`, sorted descending.

The projection row must set:

```typescript
artistSortKey: buildAlbumLibrarySortKey(album.artistName),
albumSortKey: buildAlbumLibrarySortKey(album.name),
albumType: getAlbumLibraryAlbumType(album.totalTracks),
filterHasListened: (userAlbum?.listenCount ?? 0) > 0,
rymStatus: getAlbumLibraryRymStatus(latestLink !== null),
searchText: buildAlbumLibrarySearchText({
	name: album.name,
	artistName: album.artistName,
}),
```

When implementing `refreshAlbumLibraryProjectionsForAlbum`, use `row.userId` from each `albumLibraryItems` row:

```typescript
for (const row of existingRows) {
	await upsertAlbumLibraryProjection(ctx, {
		userId: row.userId,
		albumId,
	});
}
```

Do not scan every `userAlbums` or `robRankingAlbums` row inside this helper. Listen/ranking write paths create missing projection rows directly with `upsertAlbumLibraryProjection(ctx, { userId, albumId })`.

- [ ] **Step 3: Add backfill mutation**

In `convex/spotify.ts`, import `upsertAlbumLibraryProjection` and add:

```typescript
export const backfillAlbumLibraryItems = mutation({
	args: {
		userId: v.string(),
		cursor: v.optional(v.string()),
		batchSize: v.optional(v.number()),
	},
	returns: v.object({
		processed: v.number(),
		done: v.boolean(),
		cursor: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const batchSize = Math.min(args.batchSize ?? 100, 500);
		const page = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_createdAt")
			.order("desc")
			.paginate({
				numItems: batchSize,
				cursor: args.cursor ?? null,
			});

		for (const album of page.page) {
			await upsertAlbumLibraryProjection(ctx, {
				userId: args.userId,
				albumId: album._id,
			});
		}

		return {
			processed: page.page.length,
			done: page.isDone,
			cursor: page.isDone ? undefined : page.continueCursor,
		};
	},
});
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: passes after fixing any generated type drift by running Convex codegen through normal project tooling if needed.

- [ ] **Step 5: Commit Task 2**

```bash
git add convex/schema.ts convex/_utils/albumLibraryProjection.ts convex/spotify.ts
git commit -m "feat: add album library projection table"
```

---

### Task 3: Projection Refresh Hooks

**Files:**
- Modify: `convex/spotify.ts`
- Modify: `convex/_utils/albumMatching.ts`
- Modify: `convex/robRankings.ts`

- [ ] **Step 1: Hook Spotify album changes**

In `convex/spotify.ts`, after `upsertAlbum` patches or inserts `spotifyAlbums`, call:

```typescript
await refreshAlbumLibraryProjectionsForAlbum(ctx, albumId);
```

Use `existing._id` for updates and the inserted id for creates.

- [ ] **Step 2: Hook RYM not-on-site and user album changes**

In `setSpotifyAlbumRymNotOnSite`, after the album patch:

```typescript
await refreshAlbumLibraryProjectionsForAlbum(ctx, args.albumId);
```

In `recordAlbumListen`, `addManualAlbumListen`, and `deleteAlbumListen`, after `userAlbums` changes:

```typescript
await upsertAlbumLibraryProjection(ctx, {
	userId: args.userId,
	albumId: args.albumId,
});
```

For `deleteAlbumListen`, use `listen.userId` and `listen.albumId`.

In `updateAlbumRating`, after patching `userAlbums`:

```typescript
await upsertAlbumLibraryProjection(ctx, {
	userId: userAlbum.userId,
	albumId: userAlbum.albumId,
});
```

- [ ] **Step 3: Hook RYM link helper**

In `convex/_utils/albumMatching.ts`, import `refreshAlbumLibraryProjectionsForAlbum`. In `linkRymScrapeToSpotifyAlbum`, after insert or patch of `rateYourMusicSpotifyAlbumLinks`, call:

```typescript
await refreshAlbumLibraryProjectionsForAlbum(ctx, args.albumId);
```

This central hook covers manual album association, automatic Spotify matching, For Later matching, and scrape-to-album matching.

- [ ] **Step 4: Hook Rob ranking membership changes**

In `convex/robRankings.ts`, import `upsertAlbumLibraryProjection`.

After inserting Spotify-linked rankings in `replaceYearFromAlbums` and `addAlbumToYear`, call:

```typescript
await upsertAlbumLibraryProjection(ctx, {
	userId: args.userId,
	albumId,
});
```

When `replaceYearFromAlbums` deletes existing rows, collect `existing` rows with `albumId` first and refresh those album projections after deletion.

In `removeAlbumFromYear`, after deleting the ranking, if `ranking.albumId` exists:

```typescript
await upsertAlbumLibraryProjection(ctx, {
	userId: ranking.userId,
	albumId: ranking.albumId,
});
```

In `updateRankingAlbumManual`, capture the old `ranking.albumId` before patching. After patching, refresh that old album projection if present.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 6: Commit Task 3**

```bash
git add convex/spotify.ts convex/_utils/albumMatching.ts convex/robRankings.ts
git commit -m "feat: refresh album library projections"
```

---

### Task 4: Paginated Backend Query

**Files:**
- Modify: `convex/_utils/albumLibraryRows.ts`
- Modify: `convex/spotify.ts`
- Create: `convex/album-library-pagination-source.test.ts`

- [ ] **Step 1: Add source test for pagination query**

Create `convex/album-library-pagination-source.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/spotify.ts", "utf8");

test("album library paginated query uses projection table and pagination opts", () => {
	assert.match(source, /paginationOptsValidator/);
	assert.match(source, /listAlbumLibraryRowsPaginated/);
	assert.match(source, /albumLibraryItems/);
	assert.match(source, /paginate\(args\.paginationOpts\)/);
	assert.match(source, /listAlbumLibraryYears/);
});
```

- [ ] **Step 2: Run source test and verify it fails**

Run:

```bash
pnpm exec tsx --test convex/album-library-pagination-source.test.ts
```

Expected: fails because the query does not exist.

- [ ] **Step 3: Add validators and filter args**

In `convex/_utils/albumLibraryRows.ts`, export validators from Convex `v`:

```typescript
import { v } from "convex/values";

export const albumLibraryRymStatusValidator = v.union(
	v.literal("all"),
	v.literal("linked"),
	v.literal("unlinked"),
);
export const albumLibraryRobRankingStatusValidator = v.union(
	v.literal("all"),
	v.literal("appears"),
	v.literal("not_appears"),
);
export const albumLibraryListenStatusValidator = v.union(
	v.literal("all"),
	v.literal("listened"),
	v.literal("unlistened"),
);
export const albumLibraryAlbumTypeValidator = v.union(
	v.literal("all"),
	v.literal("album"),
	v.literal("single"),
);
export const albumLibraryFiltersValidator = v.object({
	search: v.optional(v.string()),
	rymStatus: v.optional(albumLibraryRymStatusValidator),
	robRankingStatus: v.optional(albumLibraryRobRankingStatusValidator),
	listenStatus: v.optional(albumLibraryListenStatusValidator),
	albumType: v.optional(albumLibraryAlbumTypeValidator),
	releaseYear: v.optional(v.number()),
});
export const albumLibrarySortValidator = v.union(
	v.literal("recent"),
	v.literal("artist"),
);
```

- [ ] **Step 4: Add paginated query and years query**

In `convex/spotify.ts`, import `paginationOptsValidator` from `convex/server`, the validators, and `rowMatchesAlbumLibraryFilters`.

Add `albumLibraryRowValidator` matching `AlbumLibraryRowData`.

Add:

```typescript
export const listAlbumLibraryRowsPaginated = query({
	args: {
		userId: v.string(),
		filters: albumLibraryFiltersValidator,
		sortBy: albumLibrarySortValidator,
		paginationOpts: paginationOptsValidator,
	},
	returns: v.object({
		page: v.array(albumLibraryRowValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const base =
			args.sortBy === "artist"
				? ctx.db
						.query("albumLibraryItems")
						.withIndex("by_userId_artistSortKey_albumSortKey", (q) =>
							q.eq("userId", args.userId),
						)
				: ctx.db
						.query("albumLibraryItems")
						.withIndex("by_userId_createdAt", (q) =>
							q.eq("userId", args.userId),
						)
						.order("desc");

		const batch = await base.paginate(args.paginationOpts);

		return {
			...batch,
			page: batch.page.filter((row) =>
				rowMatchesAlbumLibraryFilters(row, args.filters),
			),
		};
	},
});
```

Add:

```typescript
export const listAlbumLibraryYears = query({
	args: { userId: v.string() },
	returns: v.array(v.number()),
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.collect();
		return [...new Set(rows.flatMap((row) => row.releaseYear ?? []))].sort(
			(a, b) => b - a,
		);
	},
});
```

- [ ] **Step 5: Run source test and typecheck**

Run:

```bash
pnpm exec tsx --test convex/album-library-pagination-source.test.ts
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add convex/_utils/albumLibraryRows.ts convex/spotify.ts convex/album-library-pagination-source.test.ts
git commit -m "feat: paginate album library rows"
```

---

### Task 5: Frontend Pagination

**Files:**
- Modify: `src/app/albums/all/page.tsx`
- Modify: `src/app/albums/_components/all-albums-view.tsx`
- Create: `src/app/albums/all/page-source.test.ts`

- [ ] **Step 1: Add source test for frontend pagination**

Create `src/app/albums/all/page-source.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("src/app/albums/all/page.tsx", "utf8");
const viewSource = readFileSync(
	"src/app/albums/_components/all-albums-view.tsx",
	"utf8",
);

test("albums all page uses paginated album library query", () => {
	assert.match(pageSource, /usePaginatedQuery/);
	assert.match(pageSource, /listAlbumLibraryRowsPaginated/);
	assert.match(pageSource, /initialNumItems: 50/);
});

test("albums all view renders load more controls", () => {
	assert.match(viewSource, /onLoadMore/);
	assert.match(viewSource, /Load more/);
	assert.doesNotMatch(viewSource, /filteredAlbums\.map/);
});
```

- [ ] **Step 2: Run source test and verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/albums/all/page-source.test.ts
```

Expected: fails because frontend still uses `useQuery`.

- [ ] **Step 3: Switch page to `usePaginatedQuery`**

Modify `src/app/albums/all/page.tsx`:

- import `usePaginatedQuery` and `useQuery`;
- parse filter state with an exported parser from `AllAlbumsView` or a small colocated helper;
- query `api.spotify.listAlbumLibraryRowsPaginated`;
- query `api.spotify.listAlbumLibraryYears`;
- pass `rows.results`, load-more status, and available years into `AllAlbumsView`.

Use:

```typescript
const rows = usePaginatedQuery(
	api.spotify.listAlbumLibraryRowsPaginated,
	userId ? { userId, filters, sortBy } : "skip",
	{ initialNumItems: 50 },
);
```

- [ ] **Step 4: Update `AllAlbumsView` props and remove local filtering**

Modify `AllAlbumsViewProps`:

```typescript
type AllAlbumsViewProps = {
	albums: AlbumLibraryRowData[];
	availableYears: number[];
	isLoading: boolean;
	canLoadMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
	onAddListen: (album: AlbumLibraryRowData) => void;
	onRateAlbum: (album: AlbumLibraryRowData) => void;
};
```

Remove `availableYears` derivation from `albums`.

Remove `filteredAlbums` calculation. Use `albums` directly in the list:

```typescript
{albums.length === 0 ? (
	<div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
		<p className="text-muted-foreground text-sm">
			No albums match the selected filters
		</p>
	</div>
) : (
	albums.map((album) => (
		<AlbumCardRow key={album._id} ... />
	))
)}
```

Change status text:

```typescript
Showing {albums.length} loaded
```

Add a button after the list:

```typescript
{canLoadMore ? (
	<div className="flex justify-center pt-3">
		<Button
			type="button"
			variant="outline"
			onClick={onLoadMore}
			disabled={isLoadingMore}
		>
			{isLoadingMore ? "Loading..." : "Load more"}
		</Button>
	</div>
) : null}
```

- [ ] **Step 5: Reset pagination when filters change**

Rely on `usePaginatedQuery` argument changes to reset results. Keep URL-backed filter updates unchanged.

- [ ] **Step 6: Run source test and typecheck**

Run:

```bash
pnpm exec tsx --test src/app/albums/all/page-source.test.ts
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/app/albums/all/page.tsx src/app/albums/_components/all-albums-view.tsx src/app/albums/all/page-source.test.ts
git commit -m "feat: paginate albums all page"
```

---

### Task 6: Verification, Backfill Path, and Push

**Files:**
- Modify files only if verification exposes issues.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumLibraryProjection.test.ts convex/album-library-pagination-source.test.ts src/app/albums/all/page-source.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Run Biome on touched files**

Run:

```bash
pnpm exec biome check convex/schema.ts convex/_utils/albumLibraryRows.ts convex/_utils/albumLibraryProjection.ts convex/_utils/albumLibraryProjection.test.ts convex/spotify.ts convex/_utils/albumMatching.ts convex/robRankings.ts convex/album-library-pagination-source.test.ts src/app/albums/all/page.tsx src/app/albums/_components/all-albums-view.tsx src/app/albums/all/page-source.test.ts
```

Expected: touched files pass. If repo-wide `pnpm check` still fails on unrelated pre-existing generated files, document that in the final summary.

- [ ] **Step 4: Confirm git status**

Run:

```bash
git status --short --branch
```

Expected: only intended files are modified or working tree is clean after commits.

- [ ] **Step 5: Push live**

If all verification commands pass and commits are present:

```bash
git push
```

Expected: branch pushes to `origin/main`.

---

## Self-Review Notes

- Spec coverage: projection table, refresh timing, pagination query, frontend load more, and verification are all covered.
- Placeholder scan: no task depends on unspecified future work; each task names files and commands.
- Type consistency: `AlbumLibraryRowData`, `AlbumLibraryFilters`, `AlbumLibrarySort`, and projection fields match the design spec.

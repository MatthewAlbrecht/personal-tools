# For Later Albums Phase 4 Filterable UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 4 `/for-later-albums` UI so the user can filter the For Later backlog, inspect listened and RYM status, sync manually, find RYM links, and open capped batches of RYM links.

**Architecture:** Add a focused Convex read layer for UI rows, keeping Phase 1-3 write/sync/discovery behavior intact. The client route owns URL-backed filter state, uses Convex pagination for the main list, and delegates display to small colocated components. RYM taxonomy stays normalized in existing RYM tables; the UI query joins scrape tags and listen status into display rows.

**Tech Stack:** Next.js 15 App Router, React 19 client components, Convex queries with pagination, shadcn/ui, Tailwind CSS v4, node:test for pure helpers, Biome, TypeScript.

---

## File Structure

- Create `convex/_utils/forLaterAlbumsUi.ts`: pure helpers for UI filter normalization, row sorting, RYM status derivation, and capped RYM link extraction.
- Create `convex/_utils/forLaterAlbumsUi.test.ts`: node:test coverage for helper behavior before Convex query wiring.
- Modify `convex/schema.ts`: add Phase 4 indexes to existing Phase 1-3 For Later tables so filtered pagination can start from efficient user-scoped scans.
- Modify `convex/forLaterAlbums.ts`: add Phase 4 read queries: `getForLaterUiSummary`, `listForLaterAlbumRows`, and `listOpenableRymLinks`.
- Create `src/app/for-later-albums/_utils/types.ts`: shared client-side TypeScript types for filters and row props.
- Create `src/app/for-later-albums/_utils/filter-state.ts`: URL query-string parsing and serialization for repeatable filtered views.
- Create `src/app/for-later-albums/_utils/filter-state.test.ts`: node:test coverage for URL state round-trips and defaults.
- Create `src/app/for-later-albums/_components/for-later-header.tsx`: title, playlist name, last sync status, Sync now, Find RYM links, and Open RYM links controls.
- Create `src/app/for-later-albums/_components/for-later-filters.tsx`: filter controls for genre, descriptor, title, artist, year, listened status, RYM scrape status, and playlist active state.
- Create `src/app/for-later-albums/_components/for-later-list.tsx`: paginated list, empty states, loading state, and load-more button.
- Create `src/app/for-later-albums/_components/for-later-row.tsx`: album row/card displaying album metadata, listened status, RYM status, tags, match method, and row-level RYM actions.
- Create `src/app/for-later-albums/_components/open-rym-links-button.tsx`: capped multi-open behavior using a direct click handler.
- Create `src/app/for-later-albums/page.tsx`: client route that wires auth, Spotify connection, URL state, Convex queries, and component composition.

Do not edit `docs/for-later-albums-prd.md`.

---

## Assumptions From Completed Phases

Phase 4 assumes these Phase 1-3 files and contracts already exist:

- `convex/forLaterAlbums.ts` exists and already contains write helpers for sync runs, item upserts, removals, RYM matching, and AI discovery status updates.
- `src/app/api/for-later-albums/sync/route.ts` accepts `POST` with `X-Access-Token` and JSON body `{ "userId": string }`, then writes `forLaterSyncRuns`.
- `src/app/api/for-later-albums/find-rym-links/route.ts` accepts `POST` with JSON body `{ "userId": string, "forLaterAlbumItemIds": string[] }`, then updates discovery fields on `forLaterAlbumItems`.
- `forLaterAlbumItems` has at least the fields from the PRD: `userId`, `albumId`, `spotifyAlbumId`, `playlistAddedAt`, `firstSeenAt`, `lastSeenAt`, `removedAt`, `isActive`, `rymDiscoveryStatus`, `rymCandidateUrl`, `rymCandidateConfidence`, `rymDiscoveryReason`, `rymDiscoveryUpdatedAt`, `rymScrapeId`, `rymMatchMethod`, `rymMatchedAt`, `createdAt`, and `updatedAt`.
- RYM taxonomy is stored in `rateYourMusicReleaseGenres`, `rateYourMusicReleaseDescriptors`, `rateYourMusicGenres`, and `rateYourMusicDescriptors`.
- Listen status is derived from `userAlbums` and `userAlbumListens`; For Later items are not stored as listens.

---

## Task 1: Add Convex UI Helper Tests

**Files:**

- Create: `convex/_utils/forLaterAlbumsUi.test.ts`
- **Step 1: Create failing helper tests**

Create `convex/_utils/forLaterAlbumsUi.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	buildOpenableRymLinks,
	deriveRymStatus,
	normalizeForLaterFilters,
	sortForLaterRows,
} from "./forLaterAlbumsUi";

test("normalizeForLaterFilters applies Phase 4 defaults", () => {
	const filters = normalizeForLaterFilters({});

	assert.deepEqual(filters, {
		genreKey: undefined,
		genreRole: "either",
		descriptorKey: undefined,
		title: undefined,
		artist: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		playlist: "active",
	});
});

test("deriveRymStatus prefers matched scrapes over candidate status", () => {
	assert.equal(
		deriveRymStatus({
			rymScrapeId: "scrape_1",
			rymCandidateUrl: "https://rateyourmusic.com/release/album/a/b",
			rymDiscoveryStatus: "found",
		}),
		"matched",
	);
});

test("deriveRymStatus reports candidate when no scrape is matched", () => {
	assert.equal(
		deriveRymStatus({
			rymScrapeId: undefined,
			rymCandidateUrl: "https://rateyourmusic.com/release/album/a/b",
			rymDiscoveryStatus: "found",
		}),
		"candidate",
	);
});

test("sortForLaterRows orders lastSeenAt, playlistAddedAt, then createdAt descending", () => {
	const rows = [
		{ id: "old", lastSeenAt: 10, playlistAddedAt: 100, createdAt: 1000 },
		{ id: "new-created", lastSeenAt: 20, playlistAddedAt: 200, createdAt: 3000 },
		{ id: "new-playlist", lastSeenAt: 20, playlistAddedAt: 300, createdAt: 2000 },
	];

	assert.deepEqual(
		sortForLaterRows(rows).map((row) => row.id),
		["new-playlist", "new-created", "old"],
	);
});

test("buildOpenableRymLinks caps candidate and matched URLs in row order", () => {
	const links = buildOpenableRymLinks(
		[
			{ id: "a", rymUrl: "https://rateyourmusic.com/release/album/a/a" },
			{ id: "b", rymUrl: undefined },
			{ id: "c", rymUrl: "https://rateyourmusic.com/release/ep/c/c" },
		],
		1,
	);

	assert.deepEqual(links, [
		{ id: "a", url: "https://rateyourmusic.com/release/album/a/a" },
	]);
});
```

- **Step 2: Run the tests and confirm failure**

Run:

```bash
node --test convex/_utils/forLaterAlbumsUi.test.ts
```

Expected: FAIL with a module/export error because `convex/_utils/forLaterAlbumsUi.ts` has not been created.

---

## Task 2: Implement Convex UI Helpers

**Files:**

- Create: `convex/_utils/forLaterAlbumsUi.ts`
- **Step 1: Create the helper module**

Create `convex/_utils/forLaterAlbumsUi.ts`:

```typescript
export type ForLaterListenedFilter = "all" | "listened" | "not_listened";
export type ForLaterRymFilter =
	| "all"
	| "has_scrape"
	| "no_scrape"
	| "has_candidate"
	| "no_candidate";
export type ForLaterPlaylistFilter = "active" | "removed" | "all";
export type ForLaterGenreRoleFilter = "primary" | "secondary" | "either";
export type ForLaterDerivedRymStatus =
	| "matched"
	| "candidate"
	| "searching"
	| "not_found"
	| "failed"
	| "not_started";

export type ForLaterUiFilters = {
	genreKey?: string;
	genreRole: ForLaterGenreRoleFilter;
	descriptorKey?: string;
	title?: string;
	artist?: string;
	year?: number;
	listened: ForLaterListenedFilter;
	rymStatus: ForLaterRymFilter;
	playlist: ForLaterPlaylistFilter;
};

export function normalizeForLaterFilters(
	input: Partial<ForLaterUiFilters>,
): ForLaterUiFilters {
	return {
		genreKey: normalizeOptionalString(input.genreKey),
		genreRole: input.genreRole ?? "either",
		descriptorKey: normalizeOptionalString(input.descriptorKey),
		title: normalizeOptionalString(input.title),
		artist: normalizeOptionalString(input.artist),
		year: input.year,
		listened: input.listened ?? "all",
		rymStatus: input.rymStatus ?? "all",
		playlist: input.playlist ?? "active",
	};
}

export function deriveRymStatus(args: {
	rymScrapeId?: unknown;
	rymCandidateUrl?: string;
	rymDiscoveryStatus:
		| "not_started"
		| "queued"
		| "searching"
		| "found"
		| "not_found"
		| "failed";
}): ForLaterDerivedRymStatus {
	if (args.rymScrapeId) {
		return "matched";
	}
	if (args.rymCandidateUrl || args.rymDiscoveryStatus === "found") {
		return "candidate";
	}
	if (
		args.rymDiscoveryStatus === "queued" ||
		args.rymDiscoveryStatus === "searching"
	) {
		return "searching";
	}
	if (args.rymDiscoveryStatus === "not_found") {
		return "not_found";
	}
	if (args.rymDiscoveryStatus === "failed") {
		return "failed";
	}
	return "not_started";
}

export function sortForLaterRows<T extends {
	lastSeenAt: number;
	playlistAddedAt?: number;
	createdAt: number;
}>(rows: T[]): T[] {
	return [...rows].sort((a, b) => {
		const lastSeenDiff = b.lastSeenAt - a.lastSeenAt;
		if (lastSeenDiff !== 0) return lastSeenDiff;

		const playlistDiff = (b.playlistAddedAt ?? 0) - (a.playlistAddedAt ?? 0);
		if (playlistDiff !== 0) return playlistDiff;

		return b.createdAt - a.createdAt;
	});
}

export function buildOpenableRymLinks(
	rows: Array<{ id: string; rymUrl?: string }>,
	limit: number,
): Array<{ id: string; url: string }> {
	const cappedLimit = Math.min(Math.max(limit, 1), 20);
	const links: Array<{ id: string; url: string }> = [];

	for (const row of rows) {
		if (!row.rymUrl) {
			continue;
		}
		links.push({ id: row.id, url: row.rymUrl });
		if (links.length >= cappedLimit) {
			break;
		}
	}

	return links;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}
```

- **Step 2: Run helper tests and confirm pass**

Run:

```bash
node --test convex/_utils/forLaterAlbumsUi.test.ts
```

Expected: PASS, with all four tests successful.

---

## Task 3: Add Phase 4 Schema Indexes

**Files:**

- Modify: `convex/schema.ts`
- **Step 1: Add UI-focused indexes to `forLaterAlbumItems`**

In the existing `forLaterAlbumItems` table definition, keep every Phase 1-3 field and existing index, then add these indexes to the chain:

```typescript
.index("by_userId_isActive_lastSeenAt", ["userId", "isActive", "lastSeenAt"])
.index("by_userId_rymScrapeId", ["userId", "rymScrapeId"])
.index("by_userId_rymDiscoveryStatus", ["userId", "rymDiscoveryStatus"])
```

The completed index chain should include the earlier indexes plus these Phase 4 additions.

- **Step 2: Generate Convex types**

Run:

```bash
npx convex codegen
```

Expected: exits 0 and updates `convex/_generated/api.d.ts` / `convex/_generated/dataModel.d.ts` if the generated files need changes.

---

## Task 4: Add Convex UI Query Return Types

**Files:**

- Modify: `convex/forLaterAlbums.ts`
- **Step 1: Add Phase 4 imports**

At the top of `convex/forLaterAlbums.ts`, add imports alongside existing imports:

```typescript
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
	buildOpenableRymLinks,
	deriveRymStatus,
	normalizeForLaterFilters,
	sortForLaterRows,
	type ForLaterUiFilters,
} from "./_utils/forLaterAlbumsUi";
```

- **Step 2: Add validators and shared types**

Add these near the top-level validators in `convex/forLaterAlbums.ts`:

```typescript
const listenedFilterValidator = v.union(
	v.literal("all"),
	v.literal("listened"),
	v.literal("not_listened"),
);

const rymFilterValidator = v.union(
	v.literal("all"),
	v.literal("has_scrape"),
	v.literal("no_scrape"),
	v.literal("has_candidate"),
	v.literal("no_candidate"),
);

const playlistFilterValidator = v.union(
	v.literal("active"),
	v.literal("removed"),
	v.literal("all"),
);

const genreRoleFilterValidator = v.union(
	v.literal("primary"),
	v.literal("secondary"),
	v.literal("either"),
);

const forLaterFiltersValidator = v.object({
	genreKey: v.optional(v.string()),
	genreRole: v.optional(genreRoleFilterValidator),
	descriptorKey: v.optional(v.string()),
	title: v.optional(v.string()),
	artist: v.optional(v.string()),
	year: v.optional(v.number()),
	listened: v.optional(listenedFilterValidator),
	rymStatus: v.optional(rymFilterValidator),
	playlist: v.optional(playlistFilterValidator),
});

const tagValidator = v.object({
	key: v.string(),
	label: v.string(),
});

const forLaterAlbumRowValidator = v.object({
	id: v.string(),
	albumItemId: v.id("forLaterAlbumItems"),
	albumId: v.id("spotifyAlbums"),
	spotifyAlbumId: v.string(),
	name: v.string(),
	artistName: v.string(),
	imageUrl: v.optional(v.string()),
	releaseDate: v.optional(v.string()),
	releaseYear: v.optional(v.number()),
	playlistAddedAt: v.optional(v.number()),
	firstSeenAt: v.number(),
	lastSeenAt: v.number(),
	removedAt: v.optional(v.number()),
	isActive: v.boolean(),
	hasListened: v.boolean(),
	listenCount: v.number(),
	lastListenedAt: v.optional(v.number()),
	rymStatus: v.union(
		v.literal("matched"),
		v.literal("candidate"),
		v.literal("searching"),
		v.literal("not_found"),
		v.literal("failed"),
		v.literal("not_started"),
	),
	rymUrl: v.optional(v.string()),
	rymCandidateConfidence: v.optional(
		v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
	),
	rymDiscoveryReason: v.optional(v.string()),
	rymMatchMethod: v.optional(
		v.union(
			v.literal("spotify_id"),
			v.literal("title_artist"),
			v.literal("manual"),
		),
	),
	primaryGenres: v.array(tagValidator),
	secondaryGenres: v.array(tagValidator),
	descriptors: v.array(tagValidator),
});

type ForLaterAlbumRow = {
	id: string;
	albumItemId: Id<"forLaterAlbumItems">;
	albumId: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	releaseYear?: number;
	playlistAddedAt?: number;
	firstSeenAt: number;
	lastSeenAt: number;
	removedAt?: number;
	isActive: boolean;
	hasListened: boolean;
	listenCount: number;
	lastListenedAt?: number;
	rymStatus:
		| "matched"
		| "candidate"
		| "searching"
		| "not_found"
		| "failed"
		| "not_started";
	rymUrl?: string;
	rymCandidateConfidence?: "high" | "medium" | "low";
	rymDiscoveryReason?: string;
	rymMatchMethod?: "spotify_id" | "title_artist" | "manual";
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
};

type LoadForLaterAlbumRowsResult = {
	page: ForLaterAlbumRow[];
	isDone: boolean;
	continueCursor: string | null;
};
```

---

## Task 5: Add Convex UI Query Helpers

**Files:**

- Modify: `convex/forLaterAlbums.ts`
- **Step 1: Add local helper functions**

Add these helper functions below existing Phase 1-3 helpers and above exported queries:

```typescript
async function loadTagsForScrape(
	ctx: QueryCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<{
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
}> {
	const genreLinks = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();
	const descriptorLinks = await ctx.db
		.query("rateYourMusicReleaseDescriptors")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const primaryGenres: Array<{ key: string; label: string }> = [];
	const secondaryGenres: Array<{ key: string; label: string }> = [];
	const descriptors: Array<{ key: string; label: string }> = [];

	for (const link of genreLinks) {
		const genre = await ctx.db.get(link.genreId);
		if (!genre) continue;
		const tag = { key: genre.key, label: genre.label };
		if (link.role === "primary") {
			primaryGenres.push(tag);
		} else {
			secondaryGenres.push(tag);
		}
	}

	for (const link of descriptorLinks) {
		const descriptor = await ctx.db.get(link.descriptorId);
		if (descriptor) {
			descriptors.push({ key: descriptor.key, label: descriptor.label });
		}
	}

	return { primaryGenres, secondaryGenres, descriptors };
}

async function loadListenSummary(
	ctx: QueryCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums"> },
): Promise<{ hasListened: boolean; listenCount: number; lastListenedAt?: number }> {
	const userAlbum = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();

	if (!userAlbum) {
		return { hasListened: false, listenCount: 0 };
	}

	const listens = await ctx.db
		.query("userAlbumListens")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.collect();

	const lastListenedAt = listens.reduce<number | undefined>((latest, listen) => {
		if (latest === undefined || listen.listenedAt > latest) {
			return listen.listenedAt;
		}
		return latest;
	}, userAlbum.lastListenedAt);

	return {
		hasListened: true,
		listenCount: userAlbum.listenCount,
		...(lastListenedAt ? { lastListenedAt } : {}),
	};
}

function rowMatchesFilters(
	row: {
		name: string;
		artistName: string;
		releaseYear?: number;
		hasListened: boolean;
		rymStatus: string;
		rymUrl?: string;
		isActive: boolean;
		primaryGenres: Array<{ key: string }>;
		secondaryGenres: Array<{ key: string }>;
		descriptors: Array<{ key: string }>;
	},
	filters: ForLaterUiFilters,
): boolean {
	if (filters.playlist === "active" && !row.isActive) return false;
	if (filters.playlist === "removed" && row.isActive) return false;

	if (filters.listened === "listened" && !row.hasListened) return false;
	if (filters.listened === "not_listened" && row.hasListened) return false;

	if (filters.rymStatus === "has_scrape" && row.rymStatus !== "matched") return false;
	if (filters.rymStatus === "no_scrape" && row.rymStatus === "matched") return false;
	if (filters.rymStatus === "has_candidate" && !row.rymUrl) return false;
	if (filters.rymStatus === "no_candidate" && row.rymUrl) return false;

	if (filters.year !== undefined && row.releaseYear !== filters.year) return false;
	if (
		filters.title &&
		!row.name.toLowerCase().includes(filters.title.toLowerCase())
	) {
		return false;
	}
	if (
		filters.artist &&
		!row.artistName.toLowerCase().includes(filters.artist.toLowerCase())
	) {
		return false;
	}

	if (filters.genreKey) {
		const primaryMatch = row.primaryGenres.some((tag) => tag.key === filters.genreKey);
		const secondaryMatch = row.secondaryGenres.some((tag) => tag.key === filters.genreKey);
		if (filters.genreRole === "primary" && !primaryMatch) return false;
		if (filters.genreRole === "secondary" && !secondaryMatch) return false;
		if (filters.genreRole === "either" && !primaryMatch && !secondaryMatch) return false;
	}

	if (
		filters.descriptorKey &&
		!row.descriptors.some((tag) => tag.key === filters.descriptorKey)
	) {
		return false;
	}

	return true;
}
```

---

## Task 6: Add Convex Summary And Paginated Row Queries

**Files:**

- Modify: `convex/forLaterAlbums.ts`
- **Step 1: Add `getForLaterUiSummary`**

Add this exported query:

```typescript
export const getForLaterUiSummary = query({
	args: { userId: v.string() },
	returns: v.object({
		activeCount: v.number(),
		removedCount: v.number(),
		lastSync: v.union(
			v.null(),
			v.object({
				status: v.union(v.literal("success"), v.literal("failed")),
				completedAt: v.number(),
				error: v.optional(v.string()),
				spotifyPlaylistId: v.string(),
			}),
		),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const activeRows = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
		const removedRows = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", false),
			)
			.collect();
		const lastSync = await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();

		return {
			activeCount: activeRows.length,
			removedCount: removedRows.length,
			lastSync: lastSync
				? {
						status: lastSync.status,
						completedAt: lastSync.completedAt,
						...(lastSync.error ? { error: lastSync.error } : {}),
						spotifyPlaylistId: lastSync.spotifyPlaylistId,
					}
				: null,
		};
	},
});
```

- **Step 2: Add the shared paginated row loader**

Add this private helper below `getForLaterUiSummary`:

```typescript
async function loadForLaterAlbumRows(
	ctx: QueryCtx,
	args: {
		userId: string;
		filters: Partial<ForLaterUiFilters>;
		paginationOpts: { numItems: number; cursor: string | null };
	},
): Promise<LoadForLaterAlbumRowsResult> {
	const filters = normalizeForLaterFilters(args.filters);
	const targetItems = args.paginationOpts.numItems;
	const scanSize = Math.min(Math.max(targetItems * 4, 25), 100);
	const page: ForLaterAlbumRow[] = [];
	let cursor = args.paginationOpts.cursor;
	let isDone = false;

	while (page.length < targetItems && !isDone) {
		const result = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_lastSeenAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.paginate({ numItems: scanSize, cursor });

		cursor = result.continueCursor;
		isDone = result.isDone;

		for (const item of result.page) {
			const album = await ctx.db.get(item.albumId);
			if (!album) continue;

			const scrape = item.rymScrapeId ? await ctx.db.get(item.rymScrapeId) : null;
			const tags = item.rymScrapeId
				? await loadTagsForScrape(ctx, item.rymScrapeId)
				: { primaryGenres: [], secondaryGenres: [], descriptors: [] };
			const listenSummary = await loadListenSummary(ctx, {
				userId: args.userId,
				albumId: item.albumId,
			});
			const parsedYear = album.releaseDate
				? Number.parseInt(album.releaseDate.slice(0, 4), 10)
				: Number.NaN;
			const rymStatus = deriveRymStatus({
				rymScrapeId: item.rymScrapeId,
				rymCandidateUrl: item.rymCandidateUrl,
				rymDiscoveryStatus: item.rymDiscoveryStatus,
			});
			const rymUrl = scrape?.rymUrl ?? item.rymCandidateUrl;

			const row: ForLaterAlbumRow = {
				id: String(item._id),
				albumItemId: item._id,
				albumId: item.albumId,
				spotifyAlbumId: item.spotifyAlbumId,
				name: album.name,
				artistName: album.artistName,
				...(album.imageUrl ? { imageUrl: album.imageUrl } : {}),
				...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
				...(Number.isFinite(parsedYear) ? { releaseYear: parsedYear } : {}),
				...(item.playlistAddedAt ? { playlistAddedAt: item.playlistAddedAt } : {}),
				firstSeenAt: item.firstSeenAt,
				lastSeenAt: item.lastSeenAt,
				...(item.removedAt ? { removedAt: item.removedAt } : {}),
				isActive: item.isActive,
				...listenSummary,
				rymStatus,
				...(rymUrl ? { rymUrl } : {}),
				...(item.rymCandidateConfidence
					? { rymCandidateConfidence: item.rymCandidateConfidence }
					: {}),
				...(item.rymDiscoveryReason
					? { rymDiscoveryReason: item.rymDiscoveryReason }
					: {}),
				...(item.rymMatchMethod ? { rymMatchMethod: item.rymMatchMethod } : {}),
				...tags,
			};

			if (rowMatchesFilters(row, filters)) {
				page.push(row);
			}
			if (page.length >= targetItems) {
				break;
			}
		}
	}

	return {
		page: sortForLaterRows(page),
		isDone,
		continueCursor: cursor,
	};
}
```

- **Step 3: Add `listForLaterAlbumRows`**

Add this exported query below the private loader:

```typescript
export const listForLaterAlbumRows = query({
	args: {
		userId: v.string(),
		filters: forLaterFiltersValidator,
		paginationOpts: paginationOptsValidator,
	},
	returns: v.object({
		page: v.array(forLaterAlbumRowValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await loadForLaterAlbumRows(ctx, args);
	},
});
```

- **Step 4: Add `listOpenableRymLinks`**

Add this exported query:

```typescript
export const listOpenableRymLinks = query({
	args: {
		userId: v.string(),
		filters: forLaterFiltersValidator,
		limit: v.number(),
	},
	returns: v.array(
		v.object({
			id: v.string(),
			url: v.string(),
		}),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const rows = await loadForLaterAlbumRows(ctx, {
			userId: args.userId,
			filters: args.filters,
			paginationOpts: { numItems: Math.min(Math.max(args.limit * 4, 25), 100), cursor: null },
		});

		return buildOpenableRymLinks(
			rows.page.map((row) => ({ id: row.id, rymUrl: row.rymUrl })),
			args.limit,
		);
	},
});
```

- **Step 5: Verify types after query additions**

Run:

```bash
npx convex codegen && pnpm typecheck
```

Expected: both commands exit 0. If `returns` validators expose a type mismatch, fix the returned object shape rather than removing validators.

---

## Task 7: Add URL Filter State Tests

**Files:**

- Create: `src/app/for-later-albums/_utils/filter-state.test.ts`
- **Step 1: Create failing URL state tests**

Create `src/app/for-later-albums/_utils/filter-state.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { parseForLaterFilters, serializeForLaterFilters } from "./filter-state";

test("parseForLaterFilters returns Phase 4 defaults for an empty query", () => {
	assert.deepEqual(parseForLaterFilters(new URLSearchParams()), {
		genreKey: undefined,
		genreRole: "either",
		descriptorKey: undefined,
		title: undefined,
		artist: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		playlist: "active",
	});
});

test("parseForLaterFilters reads all supported filters", () => {
	const params = new URLSearchParams(
		"genre=slowcore&genreRole=primary&descriptor=melancholic&title=blue&artist=joni&year=1971&listened=not_listened&rymStatus=has_candidate&playlist=all",
	);

	assert.deepEqual(parseForLaterFilters(params), {
		genreKey: "slowcore",
		genreRole: "primary",
		descriptorKey: "melancholic",
		title: "blue",
		artist: "joni",
		year: 1971,
		listened: "not_listened",
		rymStatus: "has_candidate",
		playlist: "all",
	});
});

test("serializeForLaterFilters omits default values", () => {
	const params = serializeForLaterFilters({
		genreKey: undefined,
		genreRole: "either",
		descriptorKey: undefined,
		title: undefined,
		artist: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		playlist: "active",
	});

	assert.equal(params.toString(), "");
});
```

- **Step 2: Run the tests and confirm failure**

Run:

```bash
node --test src/app/for-later-albums/_utils/filter-state.test.ts
```

Expected: FAIL with a module/export error because `filter-state.ts` has not been created.

---

## Task 8: Implement URL Filter State Utilities

**Files:**

- Create: `src/app/for-later-albums/_utils/types.ts`
- Create: `src/app/for-later-albums/_utils/filter-state.ts`
- **Step 1: Create shared client types**

Create `src/app/for-later-albums/_utils/types.ts`:

```typescript
import type { Id } from "../../../../convex/_generated/dataModel";

export type ForLaterListenedFilter = "all" | "listened" | "not_listened";
export type ForLaterRymFilter =
	| "all"
	| "has_scrape"
	| "no_scrape"
	| "has_candidate"
	| "no_candidate";
export type ForLaterPlaylistFilter = "active" | "removed" | "all";
export type ForLaterGenreRoleFilter = "primary" | "secondary" | "either";

export type ForLaterFilters = {
	genreKey?: string;
	genreRole: ForLaterGenreRoleFilter;
	descriptorKey?: string;
	title?: string;
	artist?: string;
	year?: number;
	listened: ForLaterListenedFilter;
	rymStatus: ForLaterRymFilter;
	playlist: ForLaterPlaylistFilter;
};

export type ForLaterAlbumRowData = {
	id: string;
	albumItemId: Id<"forLaterAlbumItems">;
	albumId: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	releaseYear?: number;
	playlistAddedAt?: number;
	firstSeenAt: number;
	lastSeenAt: number;
	removedAt?: number;
	isActive: boolean;
	hasListened: boolean;
	listenCount: number;
	lastListenedAt?: number;
	rymStatus:
		| "matched"
		| "candidate"
		| "searching"
		| "not_found"
		| "failed"
		| "not_started";
	rymUrl?: string;
	rymCandidateConfidence?: "high" | "medium" | "low";
	rymDiscoveryReason?: string;
	rymMatchMethod?: "spotify_id" | "title_artist" | "manual";
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
};
```

- **Step 2: Create URL parsing and serialization**

Create `src/app/for-later-albums/_utils/filter-state.ts`:

```typescript
import type {
	ForLaterFilters,
	ForLaterGenreRoleFilter,
	ForLaterListenedFilter,
	ForLaterPlaylistFilter,
	ForLaterRymFilter,
} from "./types";

const LISTENED_VALUES = new Set<ForLaterListenedFilter>([
	"all",
	"listened",
	"not_listened",
]);
const RYM_VALUES = new Set<ForLaterRymFilter>([
	"all",
	"has_scrape",
	"no_scrape",
	"has_candidate",
	"no_candidate",
]);
const PLAYLIST_VALUES = new Set<ForLaterPlaylistFilter>([
	"active",
	"removed",
	"all",
]);
const GENRE_ROLE_VALUES = new Set<ForLaterGenreRoleFilter>([
	"primary",
	"secondary",
	"either",
]);

export function parseForLaterFilters(params: URLSearchParams): ForLaterFilters {
	const year = params.get("year");
	return {
		genreKey: optionalString(params.get("genre")),
		genreRole: parseEnum(params.get("genreRole"), GENRE_ROLE_VALUES, "either"),
		descriptorKey: optionalString(params.get("descriptor")),
		title: optionalString(params.get("title")),
		artist: optionalString(params.get("artist")),
		year: year && /^\d{4}$/.test(year) ? Number.parseInt(year, 10) : undefined,
		listened: parseEnum(params.get("listened"), LISTENED_VALUES, "all"),
		rymStatus: parseEnum(params.get("rymStatus"), RYM_VALUES, "all"),
		playlist: parseEnum(params.get("playlist"), PLAYLIST_VALUES, "active"),
	};
}

export function serializeForLaterFilters(filters: ForLaterFilters): URLSearchParams {
	const params = new URLSearchParams();
	setIfPresent(params, "genre", filters.genreKey);
	setIfNotDefault(params, "genreRole", filters.genreRole, "either");
	setIfPresent(params, "descriptor", filters.descriptorKey);
	setIfPresent(params, "title", filters.title);
	setIfPresent(params, "artist", filters.artist);
	if (filters.year !== undefined) {
		params.set("year", String(filters.year));
	}
	setIfNotDefault(params, "listened", filters.listened, "all");
	setIfNotDefault(params, "rymStatus", filters.rymStatus, "all");
	setIfNotDefault(params, "playlist", filters.playlist, "active");
	return params;
}

function optionalString(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseEnum<T extends string>(
	value: string | null,
	allowed: Set<T>,
	fallback: T,
): T {
	if (value && allowed.has(value as T)) {
		return value as T;
	}
	return fallback;
}

function setIfPresent(params: URLSearchParams, key: string, value: string | undefined): void {
	if (value?.trim()) {
		params.set(key, value.trim());
	}
}

function setIfNotDefault<T extends string>(
	params: URLSearchParams,
	key: string,
	value: T,
	defaultValue: T,
): void {
	if (value !== defaultValue) {
		params.set(key, value);
	}
}
```

- **Step 3: Run URL state tests**

Run:

```bash
node --test src/app/for-later-albums/_utils/filter-state.test.ts
```

Expected: PASS, with all three tests successful.

---

## Task 9: Create The Route Shell

**Files:**

- Create: `src/app/for-later-albums/page.tsx`
- **Step 1: Create the client route**

Create `src/app/for-later-albums/page.tsx`:

```tsx
"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Disc3 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LoginPrompt } from "~/components/login-prompt";
import { useSpotifyAuth } from "~/lib/hooks/use-spotify-auth";
import { api } from "../../../convex/_generated/api";
import { ForLaterFilters } from "./_components/for-later-filters";
import { ForLaterHeader } from "./_components/for-later-header";
import { ForLaterList } from "./_components/for-later-list";
import { parseForLaterFilters, serializeForLaterFilters } from "./_utils/filter-state";
import type { ForLaterFilters as ForLaterFiltersState } from "./_utils/types";

export default function ForLaterAlbumsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { userId, isLoading, isConnected, getValidAccessToken, connection } =
		useSpotifyAuth();
	const [batchSize, setBatchSize] = useState<5 | 10 | 20>(10);

	const filters = useMemo(
		() => parseForLaterFilters(searchParams),
		[searchParams],
	);

	const summary = useQuery(
		api.forLaterAlbums.getForLaterUiSummary,
		userId ? { userId } : "skip",
	);
	const rows = usePaginatedQuery(
		api.forLaterAlbums.listForLaterAlbumRows,
		userId ? { userId, filters } : "skip",
		{ initialNumItems: 25 },
	);
	const openableLinks = useQuery(
		api.forLaterAlbums.listOpenableRymLinks,
		userId ? { userId, filters, limit: batchSize } : "skip",
	);

	function updateFilters(nextFilters: ForLaterFiltersState): void {
		const nextParams = serializeForLaterFilters(nextFilters);
		const query = nextParams.toString();
		router.replace(query ? `/for-later-albums?${query}` : "/for-later-albums");
	}

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-6xl p-6">
				<div className="flex h-[50vh] items-center justify-center">
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={Disc3}
				message="Please log in to view For Later Albums"
				redirectPath="/for-later-albums"
			/>
		);
	}

	return (
		<div className="container mx-auto max-w-6xl p-6">
			<div className="space-y-6">
				<ForLaterHeader
					userId={userId}
					playlistName="For Later Albums"
					spotifyDisplayName={connection?.displayName}
					isConnected={isConnected}
					getValidAccessToken={getValidAccessToken}
					summary={summary}
					visibleRows={rows.results}
					openableLinks={openableLinks ?? []}
					batchSize={batchSize}
					onBatchSizeChange={setBatchSize}
				/>
				<ForLaterFilters filters={filters} onChange={updateFilters} />
				<ForLaterList
					rows={rows.results}
					isLoading={rows.status === "LoadingFirstPage"}
					isLoadingMore={rows.status === "LoadingMore"}
					canLoadMore={rows.status === "CanLoadMore"}
					onLoadMore={() => rows.loadMore(25)}
				/>
			</div>
		</div>
	);
}
```

- **Step 2: Run typecheck and confirm expected missing components**

Run:

```bash
pnpm typecheck
```

Expected: FAIL with missing module errors for the `_components` files that are created in the next tasks.

---

## Task 10: Create Header Controls

**Files:**

- Create: `src/app/for-later-albums/_components/for-later-header.tsx`
- Create: `src/app/for-later-albums/_components/open-rym-links-button.tsx`
- **Step 1: Create multi-open button**

Create `src/app/for-later-albums/_components/open-rym-links-button.tsx`:

```tsx
"use client";

import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";

export function OpenRymLinksButton({
	links,
	disabled,
}: {
	links: Array<{ id: string; url: string }>;
	disabled?: boolean;
}) {
	function handleOpen(): void {
		if (links.length === 0) {
			toast.message("No RYM links in the current filter");
			return;
		}

		for (const link of links) {
			window.open(link.url, "_blank", "noopener,noreferrer");
		}

		toast.success(`Opened ${links.length} RYM link${links.length === 1 ? "" : "s"}`);
	}

	return (
		<Button
			type="button"
			variant="outline"
			onClick={handleOpen}
			disabled={disabled || links.length === 0}
		>
			<ExternalLink className="h-4 w-4" />
			Open {links.length} RYM link{links.length === 1 ? "" : "s"}
		</Button>
	);
}
```

- **Step 2: Create header component**

Create `src/app/for-later-albums/_components/for-later-header.tsx`:

```tsx
"use client";

import { RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import type { ForLaterAlbumRowData } from "../_utils/types";
import { OpenRymLinksButton } from "./open-rym-links-button";

type ForLaterSummary = {
	activeCount: number;
	removedCount: number;
	lastSync: {
		status: "success" | "failed";
		completedAt: number;
		error?: string;
		spotifyPlaylistId: string;
	} | null;
};

export function ForLaterHeader({
	userId,
	playlistName,
	spotifyDisplayName,
	isConnected,
	getValidAccessToken,
	summary,
	visibleRows,
	openableLinks,
	batchSize,
	onBatchSizeChange,
}: {
	userId: string;
	playlistName: string;
	spotifyDisplayName?: string;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
	summary?: ForLaterSummary;
	visibleRows: ForLaterAlbumRowData[];
	openableLinks: Array<{ id: string; url: string }>;
	batchSize: 5 | 10 | 20;
	onBatchSizeChange: (size: 5 | 10 | 20) => void;
}) {
	const [isSyncing, setIsSyncing] = useState(false);
	const [isFinding, setIsFinding] = useState(false);

	async function handleSyncNow(): Promise<void> {
		setIsSyncing(true);
		try {
			const accessToken = await getValidAccessToken();
			if (!accessToken) {
				toast.error("Connect Spotify before syncing");
				return;
			}
			const response = await fetch("/api/for-later-albums/sync", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Access-Token": accessToken,
				},
				body: JSON.stringify({ userId }),
			});
			if (!response.ok) {
				throw new Error("Sync failed");
			}
			toast.success("For Later Albums synced");
		} catch (error) {
			console.error("For Later sync failed:", error);
			toast.error("Could not sync For Later Albums");
		} finally {
			setIsSyncing(false);
		}
	}

	async function handleFindRymLinks(): Promise<void> {
		const ids = visibleRows
			.filter(
				(row) =>
					row.rymStatus !== "matched" &&
					row.rymStatus !== "searching" &&
					!row.rymUrl,
			)
			.slice(0, 10)
			.map((row) => row.albumItemId);

		if (ids.length === 0) {
			toast.message("No visible unmatched albums need RYM discovery");
			return;
		}

		setIsFinding(true);
		try {
			const response = await fetch("/api/for-later-albums/find-rym-links", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId, forLaterAlbumItemIds: ids }),
			});
			if (!response.ok) {
				throw new Error("RYM link discovery failed");
			}
			toast.success(`Started RYM discovery for ${ids.length} album${ids.length === 1 ? "" : "s"}`);
		} catch (error) {
			console.error("RYM discovery failed:", error);
			toast.error("Could not start RYM discovery");
		} finally {
			setIsFinding(false);
		}
	}

	return (
		<header className="space-y-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<h1 className="font-bold text-3xl">For Later Albums</h1>
					<p className="mt-2 text-muted-foreground">
						{playlistName}
						{spotifyDisplayName ? ` · ${spotifyDisplayName}` : ""}
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						{summary
							? `${summary.activeCount} active · ${summary.removedCount} removed`
							: "Loading backlog summary..."}
					</p>
					{summary?.lastSync ? (
						<p className="mt-1 text-muted-foreground text-sm">
							Last sync {formatDateTime(summary.lastSync.completedAt)}
							{summary.lastSync.status === "failed" && summary.lastSync.error
								? ` · Failed: ${summary.lastSync.error}`
								: ""}
						</p>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<select
						value={batchSize}
						onChange={(event) =>
							onBatchSizeChange(Number.parseInt(event.target.value, 10) as 5 | 10 | 20)
						}
						className="rounded-md border bg-background px-2 py-2 text-sm"
						aria-label="RYM open batch size"
					>
						<option value={5}>5 tabs</option>
						<option value={10}>10 tabs</option>
						<option value={20}>20 tabs</option>
					</select>
					<OpenRymLinksButton links={openableLinks} />
					<Button
						type="button"
						variant="outline"
						onClick={() => void handleFindRymLinks()}
						disabled={isFinding}
					>
						<Search className="h-4 w-4" />
						{isFinding ? "Finding..." : "Find RYM links"}
					</Button>
					<Button
						type="button"
						onClick={() => void handleSyncNow()}
						disabled={!isConnected || isSyncing}
					>
						<RefreshCw className="h-4 w-4" />
						{isSyncing ? "Syncing..." : "Sync now"}
					</Button>
				</div>
			</div>
		</header>
	);
}

function formatDateTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
```

- **Step 3: Run component lint check**

Run:

```bash
pnpm check src/app/for-later-albums/_components/for-later-header.tsx src/app/for-later-albums/_components/open-rym-links-button.tsx
```

Expected: exits 0 or reports only formatting changes that `pnpm check:write` can apply.

---

## Task 11: Create Filter Controls

**Files:**

- Create: `src/app/for-later-albums/_components/for-later-filters.tsx`
- **Step 1: Create filter component**

Create `src/app/for-later-albums/_components/for-later-filters.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "../../../../convex/_generated/api";
import type { ForLaterFilters as ForLaterFiltersState } from "../_utils/types";

export function ForLaterFilters({
	filters,
	onChange,
}: {
	filters: ForLaterFiltersState;
	onChange: (filters: ForLaterFiltersState) => void;
}) {
	const genreOptions = useQuery(api.rateYourMusicScrapes.listRateYourMusicGenreKeys, {
		limit: 500,
	});
	const descriptorOptions = useQuery(
		api.rateYourMusicScrapes.listRateYourMusicDescriptorKeys,
		{ limit: 500 },
	);

	function patchFilters(patch: Partial<ForLaterFiltersState>): void {
		onChange({ ...filters, ...patch });
	}

	return (
		<section className="rounded-lg border bg-card p-4">
			<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
				<Input
					value={filters.title ?? ""}
					placeholder="Album title"
					onChange={(event) => patchFilters({ title: event.target.value || undefined })}
				/>
				<Input
					value={filters.artist ?? ""}
					placeholder="Artist"
					onChange={(event) => patchFilters({ artist: event.target.value || undefined })}
				/>
				<Input
					value={filters.year?.toString() ?? ""}
					placeholder="Release year"
					inputMode="numeric"
					onChange={(event) => {
						const value = event.target.value.trim();
						patchFilters({
							year: /^\d{4}$/.test(value) ? Number.parseInt(value, 10) : undefined,
						});
					}}
				/>
				<select
					value={filters.listened}
					onChange={(event) =>
						patchFilters({
							listened: event.target.value as ForLaterFiltersState["listened"],
						})
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="all">All listen states</option>
					<option value="listened">Listened</option>
					<option value="not_listened">Not listened</option>
				</select>
				<select
					value={filters.genreKey ?? ""}
					onChange={(event) =>
						patchFilters({ genreKey: event.target.value || undefined })
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="">All genres</option>
					{genreOptions?.map((genre) => (
						<option key={genre.key} value={genre.key}>
							{genre.label}
						</option>
					))}
				</select>
				<select
					value={filters.genreRole}
					onChange={(event) =>
						patchFilters({
							genreRole: event.target.value as ForLaterFiltersState["genreRole"],
						})
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="either">Primary or secondary</option>
					<option value="primary">Primary only</option>
					<option value="secondary">Secondary only</option>
				</select>
				<select
					value={filters.descriptorKey ?? ""}
					onChange={(event) =>
						patchFilters({ descriptorKey: event.target.value || undefined })
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="">All descriptors</option>
					{descriptorOptions?.map((descriptor) => (
						<option key={descriptor.key} value={descriptor.key}>
							{descriptor.label}
						</option>
					))}
				</select>
				<select
					value={filters.rymStatus}
					onChange={(event) =>
						patchFilters({
							rymStatus: event.target.value as ForLaterFiltersState["rymStatus"],
						})
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="all">All RYM states</option>
					<option value="has_scrape">Has scrape</option>
					<option value="no_scrape">No scrape</option>
					<option value="has_candidate">Has candidate URL</option>
					<option value="no_candidate">No candidate URL</option>
				</select>
				<select
					value={filters.playlist}
					onChange={(event) =>
						patchFilters({
							playlist: event.target.value as ForLaterFiltersState["playlist"],
						})
					}
					className="rounded-md border bg-background px-3 py-2 text-sm"
				>
					<option value="active">Active only</option>
					<option value="removed">Removed only</option>
					<option value="all">Active and removed</option>
				</select>
				<Button
					type="button"
					variant="outline"
					onClick={() =>
						onChange({
							genreKey: undefined,
							genreRole: "either",
							descriptorKey: undefined,
							title: undefined,
							artist: undefined,
							year: undefined,
							listened: "all",
							rymStatus: "all",
							playlist: "active",
						})
					}
				>
					Clear filters
				</Button>
			</div>
		</section>
	);
}
```

- **Step 2: Run component lint check**

Run:

```bash
pnpm check src/app/for-later-albums/_components/for-later-filters.tsx
```

Expected: exits 0 or reports only formatting changes that `pnpm check:write` can apply.

---

## Task 12: Use Frontend Design Skill And Create Row UI

**Files:**

- Create: `src/app/for-later-albums/_components/for-later-row.tsx`
- **Step 1: Invoke the frontend-design skill before writing the row**

Read and apply:

```txt
/Users/matthewalbrecht/.claude/skills/frontend-design/SKILL.md
```

Apply it specifically to this row/card: dense album backlog row, clear metadata hierarchy, subtle RYM/listen badges, scannable taxonomy chips, and a polished empty-cover fallback. Keep the style compatible with existing `/albums` rows and shadcn/Tailwind conventions.

- **Step 2: Create row component**

Create `src/app/for-later-albums/_components/for-later-row.tsx`:

```tsx
"use client";

import { Disc3, ExternalLink } from "lucide-react";
import Image from "next/image";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { ForLaterAlbumRowData } from "../_utils/types";

export function ForLaterRow({ row }: { row: ForLaterAlbumRowData }) {
	return (
		<article className="rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30">
			<div className="flex gap-3">
				<div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
					{row.imageUrl ? (
						<Image
							src={row.imageUrl}
							alt={row.name}
							fill
							className="object-cover"
							sizes="64px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<Disc3 className="h-7 w-7 text-muted-foreground/60" />
						</div>
					)}
				</div>
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div className="min-w-0">
							<h2 className="truncate font-semibold text-base">{row.name}</h2>
							<p className="truncate text-muted-foreground text-sm">
								{row.artistName}
								{row.releaseYear ? ` · ${row.releaseYear}` : ""}
							</p>
							<p className="text-muted-foreground text-xs">
								Added {formatDate(row.playlistAddedAt ?? row.firstSeenAt)} · Seen{" "}
								{formatDate(row.lastSeenAt)}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2 md:justify-end">
							<Badge variant={row.isActive ? "default" : "secondary"}>
								{row.isActive ? "Active" : "Removed"}
							</Badge>
							<ListenBadge row={row} />
							<RymStatusBadge row={row} />
							{row.rymMatchMethod ? (
								<Badge variant="outline">{row.rymMatchMethod}</Badge>
							) : null}
							{row.rymUrl ? (
								<Button asChild size="sm" variant="outline">
									<a href={row.rymUrl} target="_blank" rel="noreferrer">
										<ExternalLink className="h-3.5 w-3.5" />
										RYM
									</a>
								</Button>
							) : null}
						</div>
					</div>
					<TagGroups row={row} />
					{row.rymDiscoveryReason ? (
						<p className="line-clamp-2 text-muted-foreground text-xs">
							{row.rymDiscoveryReason}
						</p>
					) : null}
				</div>
			</div>
		</article>
	);
}

function ListenBadge({ row }: { row: ForLaterAlbumRowData }) {
	if (!row.hasListened) {
		return <Badge variant="outline">Not listened</Badge>;
	}

	return (
		<Badge variant="secondary">
			Listened {row.listenCount}x
			{row.lastListenedAt ? ` · ${formatDate(row.lastListenedAt)}` : ""}
		</Badge>
	);
}

function RymStatusBadge({ row }: { row: ForLaterAlbumRowData }) {
	const className = cn(
		row.rymStatus === "matched" && "border-emerald-500/40 text-emerald-600",
		row.rymStatus === "candidate" && "border-blue-500/40 text-blue-600",
		row.rymStatus === "failed" && "border-destructive/40 text-destructive",
	);

	return (
		<Badge variant="outline" className={className}>
			{formatRymStatus(row.rymStatus)}
			{row.rymCandidateConfidence ? ` · ${row.rymCandidateConfidence}` : ""}
		</Badge>
	);
}

function TagGroups({ row }: { row: ForLaterAlbumRowData }) {
	return (
		<div className="space-y-1">
			<TagLine label="Primary" tags={row.primaryGenres} />
			<TagLine label="Secondary" tags={row.secondaryGenres} />
			<TagLine label="Descriptors" tags={row.descriptors} />
		</div>
	);
}

function TagLine({
	label,
	tags,
}: {
	label: string;
	tags: Array<{ key: string; label: string }>;
}) {
	if (tags.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5 text-xs">
			<span className="mr-1 text-muted-foreground">{label}</span>
			{tags.map((tag) => (
				<Badge key={tag.key} variant="secondary" className="font-normal">
					{tag.label}
				</Badge>
			))}
		</div>
	);
}

function formatRymStatus(status: ForLaterAlbumRowData["rymStatus"]): string {
	const labels: Record<ForLaterAlbumRowData["rymStatus"], string> = {
		matched: "RYM matched",
		candidate: "Candidate found",
		searching: "Searching",
		not_found: "Not found",
		failed: "Failed",
		not_started: "Not started",
	};
	return labels[status];
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
```

- **Step 3: Run component lint check**

Run:

```bash
pnpm check src/app/for-later-albums/_components/for-later-row.tsx
```

Expected: exits 0 or reports only formatting changes that `pnpm check:write` can apply.

---

## Task 13: Create Paginated List

**Files:**

- Create: `src/app/for-later-albums/_components/for-later-list.tsx`
- **Step 1: Create list component**

Create `src/app/for-later-albums/_components/for-later-list.tsx`:

```tsx
"use client";

import { Disc3 } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { ForLaterAlbumRowData } from "../_utils/types";
import { ForLaterRow } from "./for-later-row";

export function ForLaterList({
	rows,
	isLoading,
	isLoadingMore,
	canLoadMore,
	onLoadMore,
}: {
	rows: ForLaterAlbumRowData[];
	isLoading: boolean;
	isLoadingMore: boolean;
	canLoadMore: boolean;
	onLoadMore: () => void;
}) {
	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<p className="text-muted-foreground">Loading For Later albums...</p>
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center">
					<Disc3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
					<p className="mt-4 text-muted-foreground">No albums match this view</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Sync the playlist or loosen the filters to see albums.
					</p>
				</div>
			</div>
		);
	}

	return (
		<section className="space-y-3">
			{rows.map((row) => (
				<ForLaterRow key={row.id} row={row} />
			))}
			{canLoadMore ? (
				<div className="flex justify-center pt-2">
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
		</section>
	);
}
```

- **Step 2: Run component lint check**

Run:

```bash
pnpm check src/app/for-later-albums/_components/for-later-list.tsx
```

Expected: exits 0 or reports only formatting changes that `pnpm check:write` can apply.

---

## Task 14: End-To-End Verification

**Files:**

- Verify all files touched in Tasks 1-13.
- **Step 1: Run focused helper tests**

Run:

```bash
node --test convex/_utils/forLaterAlbumsUi.test.ts
node --test src/app/for-later-albums/_utils/filter-state.test.ts
```

Expected: both commands exit 0.

- **Step 2: Regenerate Convex types**

Run:

```bash
npx convex codegen
```

Expected: exits 0 and generated API types include `api.forLaterAlbums.getForLaterUiSummary`, `api.forLaterAlbums.listForLaterAlbumRows`, and `api.forLaterAlbums.listOpenableRymLinks`.

- **Step 3: Run TypeScript**

Run:

```bash
pnpm typecheck
```

Expected: exits 0.

- **Step 4: Run Biome**

Run:

```bash
pnpm check
```

Expected: exits 0. If formatting issues appear, run `pnpm check:write`, inspect the diff, then rerun `pnpm check`.

- **Step 5: Manual UI verification**

Run:

```bash
pnpm dev
```

Expected: Next.js starts on port 1333.

Open:

```txt
http://localhost:1333/for-later-albums
```

Verify these user flows:

- Default view shows active For Later playlist albums ordered by newest `lastSeenAt`, then `playlistAddedAt`, then `createdAt`.
- Header shows "For Later Albums", playlist name, active/removed counts, last sync timestamp, and failed sync error text when the last run failed.
- "Sync now" posts to the Phase 1 sync route and shows a success or error toast.
- Title, artist, release year, genre, descriptor, listened status, RYM scrape status, and playlist active filters update the URL.
- Reloading a filtered URL restores the same filter controls and result set.
- Rows show cover image, title, artists, release year, playlist dates, active/removed status, listened/not listened status, listen count, last listened date, RYM status, primary genres, secondary genres, descriptors, and match method when available.
- "Find RYM links" posts up to 10 visible unmatched row ids to the Phase 3 discovery route.
- "Open RYM links" opens only a capped batch of 5, 10, or 20 candidate/matched RYM URLs from the current filtered result.
- Loading more keeps the same filters applied.

---

## Acceptance Criteria Mapping

- Default list shows active playlist albums ordered newest first: Tasks 3, 5, 6, and 13.
- Each row indicates whether it has a matched RYM scrape: Tasks 2, 6, and 12.
- Each row with a scrape shows primary genres, secondary genres, and descriptors: Tasks 5, 6, and 12.
- List can be filtered to albums not listened to yet: Tasks 5, 6, 8, and 11.
- Genre and descriptor filters only show albums with matching RYM tags: Tasks 5, 6, 8, and 11.
- Pagination works with filters applied: Tasks 6, 9, and 13.
- Multi-open button opens only capped batches from the current filter result: Tasks 2, 6, 9, and 10.


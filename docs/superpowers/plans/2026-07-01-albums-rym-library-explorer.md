# Albums RYM Library Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/albums/all` a read-only album library explorer showing RYM link status, Rob's Top 50 membership, listen metadata, and linked RYM taxonomy.

**Architecture:** Add a Convex read-model helper and query that hydrates `spotifyAlbums` with user listen data, RYM link data, linked scrape taxonomy, and Rob ranking membership. Keep the existing client-side filtering model in Phase 1, but move filtering inputs to richer row data returned from the new query. Avoid global matching queues, destructive backfills, and auto-matching inside `spotify.upsertAlbum`.

**Tech Stack:** Next.js App Router, React 19, Convex queries, TypeScript, existing Albums route components.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `convex/_utils/albumLibraryRows.ts` | Create | Pure helpers for album type, RYM status, row shaping, filters used by tests |
| `convex/_utils/albumLibraryRows.test.ts` | Create | Unit tests for row helpers and filter predicates |
| `convex/spotify.ts` | Modify | Add `listAlbumLibraryRows` query near existing album queries |
| `src/app/albums/_utils/types.ts` | Modify | Add `AlbumLibraryRowData` and filter type aliases |
| `src/app/albums/all/page.tsx` | Modify | Replace `getAllAlbums` + `getUserAlbums` composition with `listAlbumLibraryRows` |
| `src/app/albums/_components/all-albums-view.tsx` | Modify | Add RYM/rankings filters and row badges, using the new row shape |

---

## Task 1: Album Library Row Helpers

**Files:**
- Create: `convex/_utils/albumLibraryRows.ts`
- Create: `convex/_utils/albumLibraryRows.test.ts`

- [ ] **Step 1: Write helper tests**

Create `convex/_utils/albumLibraryRows.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	type AlbumLibraryFilterInput,
	getAlbumLibraryAlbumType,
	getAlbumLibraryRymStatus,
	rowMatchesAlbumLibraryFilters,
} from "./albumLibraryRows";

function row(overrides: Partial<AlbumLibraryFilterInput> = {}): AlbumLibraryFilterInput {
	return {
		name: "Imaginal Disk",
		artistName: "Magdalena Bay",
		releaseYear: 2024,
		albumType: "album",
		listenCount: 1,
		rymStatus: "linked",
		appearsInRobRankings: false,
		...overrides,
	};
}

test("getAlbumLibraryAlbumType treats albums with fewer than 3 tracks as singles", () => {
	assert.equal(getAlbumLibraryAlbumType(1), "single");
	assert.equal(getAlbumLibraryAlbumType(2), "single");
	assert.equal(getAlbumLibraryAlbumType(3), "album");
});

test("getAlbumLibraryRymStatus derives linked status from link presence", () => {
	assert.equal(getAlbumLibraryRymStatus(true), "linked");
	assert.equal(getAlbumLibraryRymStatus(false), "unlinked");
});

test("rowMatchesAlbumLibraryFilters filters by rym status", () => {
	assert.equal(rowMatchesAlbumLibraryFilters(row(), { rymStatus: "linked" }), true);
	assert.equal(rowMatchesAlbumLibraryFilters(row(), { rymStatus: "unlinked" }), false);
});

test("rowMatchesAlbumLibraryFilters filters by Rob ranking membership", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ appearsInRobRankings: true }), {
			robRankingStatus: "appears",
		}),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ appearsInRobRankings: false }), {
			robRankingStatus: "appears",
		}),
		false,
	);
});

test("rowMatchesAlbumLibraryFilters filters by album type and listen status", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ albumType: "single" }), {
			albumType: "single",
		}),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ listenCount: 0 }), {
			listenStatus: "unlistened",
		}),
		true,
	);
});

test("rowMatchesAlbumLibraryFilters searches album and artist names", () => {
	assert.equal(rowMatchesAlbumLibraryFilters(row(), { search: "magdalena" }), true);
	assert.equal(rowMatchesAlbumLibraryFilters(row(), { search: "imaginal" }), true);
	assert.equal(rowMatchesAlbumLibraryFilters(row(), { search: "radiohead" }), false);
});
```

- [ ] **Step 2: Run helper tests to verify failure**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumLibraryRows.test.ts
```

Expected: FAIL because `convex/_utils/albumLibraryRows.ts` does not exist yet.

- [ ] **Step 3: Implement pure helpers**

Create `convex/_utils/albumLibraryRows.ts`:

```ts
export type AlbumLibraryRymStatus = "all" | "linked" | "unlinked";
export type AlbumLibraryRobRankingStatus = "all" | "appears" | "not_appears";
export type AlbumLibraryListenStatus = "all" | "listened" | "unlistened";
export type AlbumLibraryAlbumType = "all" | "album" | "single";

export type AlbumLibraryFilters = {
	search?: string;
	rymStatus?: AlbumLibraryRymStatus;
	robRankingStatus?: AlbumLibraryRobRankingStatus;
	listenStatus?: AlbumLibraryListenStatus;
	albumType?: AlbumLibraryAlbumType;
	releaseYear?: number;
};

export type AlbumLibraryFilterInput = {
	name: string;
	artistName: string;
	releaseYear?: number;
	albumType: Exclude<AlbumLibraryAlbumType, "all">;
	listenCount: number;
	rymStatus: Exclude<AlbumLibraryRymStatus, "all">;
	appearsInRobRankings: boolean;
};

export function getAlbumLibraryAlbumType(
	totalTracks: number | undefined,
): "album" | "single" {
	if (totalTracks !== undefined && totalTracks < 3) {
		return "single";
	}
	return "album";
}

export function getAlbumLibraryRymStatus(
	hasRymLink: boolean,
): "linked" | "unlinked" {
	return hasRymLink ? "linked" : "unlinked";
}

export function rowMatchesAlbumLibraryFilters(
	row: AlbumLibraryFilterInput,
	filters: AlbumLibraryFilters,
): boolean {
	const search = filters.search?.trim().toLowerCase();
	if (
		search &&
		!row.name.toLowerCase().includes(search) &&
		!row.artistName.toLowerCase().includes(search)
	) {
		return false;
	}

	if (filters.rymStatus && filters.rymStatus !== "all") {
		if (row.rymStatus !== filters.rymStatus) return false;
	}

	if (filters.robRankingStatus === "appears" && !row.appearsInRobRankings) {
		return false;
	}
	if (filters.robRankingStatus === "not_appears" && row.appearsInRobRankings) {
		return false;
	}

	if (filters.listenStatus === "listened" && row.listenCount <= 0) {
		return false;
	}
	if (filters.listenStatus === "unlistened" && row.listenCount > 0) {
		return false;
	}

	if (filters.albumType && filters.albumType !== "all") {
		if (row.albumType !== filters.albumType) return false;
	}

	if (filters.releaseYear !== undefined && row.releaseYear !== filters.releaseYear) {
		return false;
	}

	return true;
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumLibraryRows.test.ts
```

Expected: PASS.

---

## Task 2: Convex Album Library Query

**Files:**
- Modify: `convex/spotify.ts`
- Modify: `src/app/albums/_utils/types.ts`

- [ ] **Step 1: Add frontend row type**

Modify `src/app/albums/_utils/types.ts` by adding:

```ts
export type AlbumLibraryRowData = {
	_id: string;
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	releaseYear?: number;
	totalTracks: number;
	albumType: "album" | "single";
	createdAt: number;
	listenCount: number;
	firstListenedAt?: number;
	lastListenedAt?: number;
	rating?: number;
	rymStatus: "linked" | "unlinked";
	rymLink?: {
		scrapeId: string;
		method: "spotify_id" | "title_artist" | "manual";
		rymUrl?: string;
		updatedAt: number;
	};
	appearsInRobRankings: boolean;
	robRankingYears: number[];
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
};
```

- [ ] **Step 2: Import helpers in `convex/spotify.ts`**

Add near the top of `convex/spotify.ts`:

```ts
import {
	getAlbumLibraryAlbumType,
	getAlbumLibraryRymStatus,
} from "./_utils/albumLibraryRows";
```

- [ ] **Step 3: Add RYM taxonomy loader helpers**

Add these helpers before `getAllAlbums` in `convex/spotify.ts`:

```ts
async function loadRymTaxonomyForScrape(
	ctx: QueryCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<{
	primaryGenres: Array<{ key: string; label: string }>;
	secondaryGenres: Array<{ key: string; label: string }>;
	descriptors: Array<{ key: string; label: string }>;
}> {
	const [genreRows, descriptorRows] = await Promise.all([
		ctx.db
			.query("rateYourMusicReleaseGenres")
			.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
			.collect(),
		ctx.db
			.query("rateYourMusicReleaseDescriptors")
			.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
			.collect(),
	]);

	const primaryGenres: Array<{ key: string; label: string }> = [];
	const secondaryGenres: Array<{ key: string; label: string }> = [];
	for (const row of genreRows) {
		const genre = await ctx.db.get(row.genreId);
		if (!genre) continue;
		const target = row.role === "primary" ? primaryGenres : secondaryGenres;
		target.push({ key: genre.key, label: genre.name });
	}

	const descriptors: Array<{ key: string; label: string }> = [];
	for (const row of descriptorRows) {
		const descriptor = await ctx.db.get(row.descriptorId);
		if (!descriptor) continue;
		descriptors.push({ key: descriptor.key, label: descriptor.name });
	}

	return { primaryGenres, secondaryGenres, descriptors };
}

function parseAlbumReleaseYear(releaseDate: string | undefined): number | undefined {
	if (!releaseDate) return undefined;
	const year = Number.parseInt(releaseDate.slice(0, 4), 10);
	return Number.isFinite(year) ? year : undefined;
}
```

Ensure `QueryCtx` is imported from `./_generated/server` if it is not already.

- [ ] **Step 4: Add `listAlbumLibraryRows` query**

Add after `getAllAlbums` or replace future usage while keeping `getAllAlbums` intact:

```ts
export const listAlbumLibraryRows = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const albums = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_createdAt")
			.collect();
		const userAlbumRows = await ctx.db
			.query("userAlbums")
			.withIndex("by_userId_lastListenedAt", (q) => q.eq("userId", args.userId))
			.collect();
		const userAlbumsByAlbumId = new Map(
			userAlbumRows.map((row) => [row.albumId, row]),
		);

		const rankingRows = await ctx.db.query("robRankingAlbums").collect();
		const rankingYearsByAlbumId = new Map<Id<"spotifyAlbums">, Set<number>>();
		for (const ranking of rankingRows) {
			if (!ranking.albumId) continue;
			const year = await ctx.db.get(ranking.yearId);
			if (!year) continue;
			const years = rankingYearsByAlbumId.get(ranking.albumId) ?? new Set<number>();
			years.add(year.year);
			rankingYearsByAlbumId.set(ranking.albumId, years);
		}

		const rows = [];
		for (const album of albums) {
			const userAlbum = userAlbumsByAlbumId.get(album._id);
			const rymLink = await ctx.db
				.query("rateYourMusicSpotifyAlbumLinks")
				.withIndex("by_albumId", (q) => q.eq("albumId", album._id))
				.order("desc")
				.first();
			const scrape = rymLink ? await ctx.db.get(rymLink.scrapeId) : null;
			const taxonomy = rymLink
				? await loadRymTaxonomyForScrape(ctx, rymLink.scrapeId)
				: { primaryGenres: [], secondaryGenres: [], descriptors: [] };
			const robRankingYears = [
				...(rankingYearsByAlbumId.get(album._id) ?? new Set<number>()),
			].sort((a, b) => b - a);

			rows.push({
				_id: album._id,
				spotifyAlbumId: album.spotifyAlbumId,
				name: album.name,
				artistName: album.artistName,
				imageUrl: album.imageUrl,
				releaseDate: album.releaseDate,
				releaseYear: parseAlbumReleaseYear(album.releaseDate),
				totalTracks: album.totalTracks,
				albumType: getAlbumLibraryAlbumType(album.totalTracks),
				createdAt: album.createdAt,
				listenCount: userAlbum?.listenCount ?? 0,
				firstListenedAt: userAlbum?.firstListenedAt,
				lastListenedAt: userAlbum?.lastListenedAt,
				rating: userAlbum?.rating,
				rymStatus: getAlbumLibraryRymStatus(Boolean(rymLink)),
				rymLink: rymLink
					? {
							scrapeId: rymLink.scrapeId,
							method: rymLink.method,
							rymUrl: scrape?.rymUrl,
							updatedAt: rymLink.updatedAt,
						}
					: undefined,
				appearsInRobRankings: robRankingYears.length > 0,
				robRankingYears,
				...taxonomy,
			});
		}

		return rows.sort((a, b) => b.createdAt - a.createdAt);
	},
});
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS, or TypeScript points to concrete type mismatches in the new query that must be fixed before continuing.

---

## Task 3: Wire `/albums/all` To New Query

**Files:**
- Modify: `src/app/albums/all/page.tsx`
- Modify: `src/app/albums/_components/all-albums-view.tsx`

- [ ] **Step 1: Update page query**

Replace `src/app/albums/all/page.tsx` with:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AllAlbumsView } from "../_components/all-albums-view";
import { useAlbums } from "../_context/albums-context";

export default function AllAlbumsPage() {
	const { userId, openAddListenDrawer } = useAlbums();
	const albums = useQuery(
		api.spotify.listAlbumLibraryRows,
		userId ? { userId } : "skip",
	);

	return (
		<AllAlbumsView
			albums={albums ?? []}
			isLoading={albums === undefined}
			onAddListen={(album) => openAddListenDrawer(album, "album")}
		/>
	);
}
```

- [ ] **Step 2: Update `AllAlbumsView` props and filter state**

In `src/app/albums/_components/all-albums-view.tsx`, replace the imports and prop types:

```tsx
import type {
	AlbumLibraryAlbumType,
	AlbumLibraryListenStatus,
	AlbumLibraryRobRankingStatus,
	AlbumLibraryRymStatus,
} from "../../../../convex/_utils/albumLibraryRows";
import type { AlbumLibraryRowData } from "../_utils/types";

type AllAlbumsViewProps = {
	albums: AlbumLibraryRowData[];
	isLoading: boolean;
	onAddListen: (album: AlbumLibraryRowData) => void;
};
```

Remove `userAlbums`, `UserAlbumRecord`, and `userAlbumsMap` from this component. Add state:

```tsx
const [rymFilter, setRymFilter] = useState<AlbumLibraryRymStatus>("all");
const [robRankingFilter, setRobRankingFilter] =
	useState<AlbumLibraryRobRankingStatus>("all");
const [listenFilter, setListenFilter] =
	useState<AlbumLibraryListenStatus>("all");
const [albumTypeFilter, setAlbumTypeFilter] =
	useState<AlbumLibraryAlbumType>("album");
```

- [ ] **Step 3: Update filter logic**

Replace the current `filteredAlbums` `useMemo` body with:

```tsx
const filteredAlbums = useMemo(() => {
	let result = albums;

	if (yearFilter !== "all") {
		const filterYear = Number.parseInt(yearFilter, 10);
		result = result.filter((album) => album.releaseYear === filterYear);
	}

	if (listenFilter === "listened") {
		result = result.filter((album) => album.listenCount > 0);
	} else if (listenFilter === "unlistened") {
		result = result.filter((album) => album.listenCount === 0);
	}

	if (rymFilter !== "all") {
		result = result.filter((album) => album.rymStatus === rymFilter);
	}

	if (robRankingFilter === "appears") {
		result = result.filter((album) => album.appearsInRobRankings);
	} else if (robRankingFilter === "not_appears") {
		result = result.filter((album) => !album.appearsInRobRankings);
	}

	if (albumTypeFilter !== "all") {
		result = result.filter((album) => album.albumType === albumTypeFilter);
	}

	if (searchQuery.trim()) {
		const query = searchQuery.toLowerCase();
		result = result.filter(
			(album) =>
				album.name.toLowerCase().includes(query) ||
				album.artistName.toLowerCase().includes(query),
		);
	}

	return result;
}, [
	albums,
	yearFilter,
	listenFilter,
	rymFilter,
	robRankingFilter,
	albumTypeFilter,
	searchQuery,
]);
```

- [ ] **Step 4: Update filter controls**

Replace the old "Show" select and "Hide singles" checkbox with four selects:

```tsx
<select
	id="rym-filter"
	value={rymFilter}
	onChange={(e) => setRymFilter(e.target.value as AlbumLibraryRymStatus)}
	className="rounded-md border bg-background px-2 py-1 text-sm"
>
	<option value="all">All RYM</option>
	<option value="linked">RYM linked</option>
	<option value="unlinked">Needs RYM</option>
</select>

<select
	id="rob-ranking-filter"
	value={robRankingFilter}
	onChange={(e) =>
		setRobRankingFilter(e.target.value as AlbumLibraryRobRankingStatus)
	}
	className="rounded-md border bg-background px-2 py-1 text-sm"
>
	<option value="all">All rankings</option>
	<option value="appears">In Rob&apos;s Top 50</option>
	<option value="not_appears">Not in Rob&apos;s Top 50</option>
</select>

<select
	id="listen-filter"
	value={listenFilter}
	onChange={(e) => setListenFilter(e.target.value as AlbumLibraryListenStatus)}
	className="rounded-md border bg-background px-2 py-1 text-sm"
>
	<option value="all">All listens</option>
	<option value="listened">Listened</option>
	<option value="unlistened">Unlistened</option>
</select>

<select
	id="album-type-filter"
	value={albumTypeFilter}
	onChange={(e) => setAlbumTypeFilter(e.target.value as AlbumLibraryAlbumType)}
	className="rounded-md border bg-background px-2 py-1 text-sm"
>
	<option value="all">All types</option>
	<option value="album">Albums</option>
	<option value="single">Singles</option>
</select>
```

Keep the existing year select and search input.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS after imports and props are updated.

---

## Task 4: Row Badges And Taxonomy Display

**Files:**
- Modify: `src/app/albums/_components/all-albums-view.tsx`

- [ ] **Step 1: Update row props**

Change `AlbumCardRow` props:

```tsx
function AlbumCardRow({
	album,
	onAddListen,
}: {
	album: AlbumLibraryRowData;
	onAddListen: () => void;
}) {
```

Remove `userAlbum` prop usage. Use `album.listenCount`, `album.rating`, and `album.lastListenedAt` directly.

- [ ] **Step 2: Add badge helpers after `AlbumCardRow`**

Add helper components after the main row component:

```tsx
function RymStatusBadge({ album }: { album: AlbumLibraryRowData }) {
	if (album.rymStatus === "linked") {
		return (
			<span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs dark:text-emerald-300">
				RYM linked
			</span>
		);
	}

	return (
		<span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs dark:text-amber-300">
			Needs RYM
		</span>
	);
}

function RobRankingBadge({ years }: { years: number[] }) {
	if (years.length === 0) return null;
	return (
		<span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
			Rob&apos;s Top 50 {years.slice(0, 3).join(", ")}
			{years.length > 3 ? ` +${years.length - 3}` : ""}
		</span>
	);
}

function TaxonomyChips({ album }: { album: AlbumLibraryRowData }) {
	const chips = [
		...album.primaryGenres.slice(0, 3),
		...album.secondaryGenres.slice(0, 2),
		...album.descriptors.slice(0, 3),
	];

	if (chips.length === 0) return null;

	return (
		<div className="mt-1 flex flex-wrap gap-1">
			{chips.map((chip) => (
				<span
					key={chip.key}
					className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs"
				>
					{chip.label}
				</span>
			))}
		</div>
	);
}
```

- [ ] **Step 3: Render badges and taxonomy in row**

Inside `AlbumCardRow`, near the album title/artist display, add:

```tsx
<div className="mt-1 flex flex-wrap gap-1">
	<RymStatusBadge album={album} />
	<RobRankingBadge years={album.robRankingYears} />
</div>
<TaxonomyChips album={album} />
```

Use existing row layout; do not redesign the page.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

---

## Task 5: Verification

**Files:**
- Existing files from prior tasks

- [ ] **Step 1: Run unit tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/albumLibraryRows.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Manual browser verification**

Run the app:

```bash
pnpm dev
```

Open `/albums/all` and verify:

- RYM linked albums show `RYM linked`.
- Unlinked albums show `Needs RYM`.
- The RYM status filter hides/shows expected rows.
- The Rob rankings filter shows albums that appear in Rob's Top 50.
- The Albums/Singles filter replaces the old hide-singles checkbox.
- Search still works.
- Add listen still opens the existing drawer.

Stop the dev server after verification.

---

## Self-Review Notes

- Spec coverage: Phase 1 read model, RYM status, Rob ranking membership, album type, listen filters, and taxonomy display are covered.
- Scope: This plan intentionally defers taxonomy filtering, manual associate actions, batch matching, pagination, and global queues.
- Safety: No writes to RYM links, Rob ranking rows, or Spotify album rows are introduced.
- Commit guidance: Do not commit unless the user explicitly asks.

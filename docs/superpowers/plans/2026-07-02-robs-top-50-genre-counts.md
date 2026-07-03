# Rob's Top 50 Genre Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public Rob's Top 50 stats subpage that shows count-only top-level RYM genre counts for a selected published ranking year.

**Architecture:** Keep pure aggregation in `convex/_utils/robRankingGenreStats.ts`, expose a thin public Convex query from `convex/robRankings.ts`, and render a new `/public/robs-top-50/stats/genres` page with year pills and a count table. The query joins Rob ranking rows to canonical Spotify albums, latest RYM album links, primary RYM release genres, and top-level taxonomy labels.

**Tech Stack:** Next.js App Router, React 19, Convex queries, TypeScript, Biome, `node:test` through `tsx`.

---

## File Structure

- Create `convex/_utils/robRankingGenreStats.ts`: pure count/coverage aggregation helpers.
- Create `convex/_utils/robRankingGenreStats.test.ts`: unit tests for the pure helper.
- Modify `convex/robRankings.ts`: add validators and `getPublishedTopLevelGenreCountsForYear`.
- Create `convex/rob-ranking-genre-stats-source.test.ts`: source-level query wiring regression.
- Create `src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx`: count-only display component and skeleton.
- Create `src/app/public/robs-top-50/stats/genres/page.tsx`: public stats page with year pills.
- Create `src/app/public/robs-top-50/stats/genres/page-source.test.ts`: source-level route regression.
- Modify `src/app/public/robs-top-50/_components/public-stats-nav.tsx`: add `Genres` nav pill.

---

### Task 1: Pure Genre Count Helper

**Files:**
- Create: `convex/_utils/robRankingGenreStats.ts`
- Create: `convex/_utils/robRankingGenreStats.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `convex/_utils/robRankingGenreStats.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildRobRankingGenreCountSummary } from "./robRankingGenreStats";

test("buildRobRankingGenreCountSummary counts albums by top-level genre", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2024,
		totalAlbums: 4,
		albumTopLevelGenres: [
			[
				{ key: "rock", label: "Rock" },
				{ key: "pop", label: "Pop" },
			],
			[{ key: "rock", label: "Rock" }],
			[],
			[{ key: "hip hop", label: "Hip Hop" }],
		],
	});

	assert.equal(summary.year, 2024);
	assert.equal(summary.totalAlbums, 4);
	assert.equal(summary.albumsWithGenreData, 3);
	assert.equal(summary.albumsMissingGenreData, 1);
	assert.deepEqual(summary.genres, [
		{ genreKey: "rock", label: "Rock", count: 2 },
		{ genreKey: "hip hop", label: "Hip Hop", count: 1 },
		{ genreKey: "pop", label: "Pop", count: 1 },
	]);
});

test("buildRobRankingGenreCountSummary deduplicates duplicate genres per album", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2023,
		totalAlbums: 2,
		albumTopLevelGenres: [
			[
				{ key: "jazz", label: "Jazz" },
				{ key: "jazz", label: "Jazz" },
			],
			[{ key: "jazz", label: "Jazz" }],
		],
	});

	assert.deepEqual(summary.genres, [
		{ genreKey: "jazz", label: "Jazz", count: 2 },
	]);
	assert.equal(summary.albumsWithGenreData, 2);
	assert.equal(summary.albumsMissingGenreData, 0);
});

test("buildRobRankingGenreCountSummary sorts ties by label", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2022,
		totalAlbums: 3,
		albumTopLevelGenres: [
			[{ key: "soul", label: "Soul" }],
			[{ key: "ambient", label: "Ambient" }],
			[{ key: "rock", label: "Rock" }],
		],
	});

	assert.deepEqual(
		summary.genres.map((genre) => genre.label),
		["Ambient", "Rock", "Soul"],
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec tsx --test convex/_utils/robRankingGenreStats.test.ts
```

Expected: FAIL because `convex/_utils/robRankingGenreStats.ts` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `convex/_utils/robRankingGenreStats.ts`:

```ts
export type RobRankingTopLevelGenre = {
	key: string;
	label: string;
};

export type RobRankingGenreCountRow = {
	genreKey: string;
	label: string;
	count: number;
};

export type RobRankingGenreCountSummary = {
	year: number;
	totalAlbums: number;
	albumsWithGenreData: number;
	albumsMissingGenreData: number;
	genres: RobRankingGenreCountRow[];
};

export function buildRobRankingGenreCountSummary({
	year,
	totalAlbums,
	albumTopLevelGenres,
}: {
	year: number;
	totalAlbums: number;
	albumTopLevelGenres: RobRankingTopLevelGenre[][];
}): RobRankingGenreCountSummary {
	const countsByKey = new Map<string, { label: string; count: number }>();
	let albumsWithGenreData = 0;

	for (const genresForAlbum of albumTopLevelGenres) {
		const uniqueGenres = new Map<string, string>();
		for (const genre of genresForAlbum) {
			uniqueGenres.set(genre.key, genre.label);
		}

		if (uniqueGenres.size === 0) {
			continue;
		}

		albumsWithGenreData += 1;

		for (const [key, label] of uniqueGenres.entries()) {
			const existing = countsByKey.get(key);
			countsByKey.set(key, {
				label,
				count: (existing?.count ?? 0) + 1,
			});
		}
	}

	const genres = [...countsByKey.entries()]
		.map(([genreKey, value]) => ({
			genreKey,
			label: value.label,
			count: value.count,
		}))
		.sort((a, b) => {
			const countDiff = b.count - a.count;
			if (countDiff !== 0) return countDiff;
			return a.label.localeCompare(b.label);
		});

	return {
		year,
		totalAlbums,
		albumsWithGenreData,
		albumsMissingGenreData: Math.max(totalAlbums - albumsWithGenreData, 0),
		genres,
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm exec tsx --test convex/_utils/robRankingGenreStats.test.ts
```

Expected: PASS, 3 tests.

---

### Task 2: Convex Query

**Files:**
- Modify: `convex/robRankings.ts`
- Create: `convex/rob-ranking-genre-stats-source.test.ts`

- [ ] **Step 1: Write the source-level regression test**

Create `convex/rob-ranking-genre-stats-source.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/robRankings.ts", "utf8");

function getSourceBetween(sourceText: string, start: string, end: string): string {
	const startIndex = sourceText.indexOf(start);
	assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
	const endIndex = sourceText.indexOf(end, startIndex);
	assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
	return sourceText.slice(startIndex, endIndex);
}

test("rob rankings exposes published top-level genre counts query", () => {
	const body = getSourceBetween(
		source,
		"export const getPublishedTopLevelGenreCountsForYear = query({",
		"export const getPublishedAlbumsForYear = query({",
	);

	assert.match(body, /year: v\.number\(\)/);
	assert.match(body, /robRankingAlbums/);
	assert.match(body, /withIndex\("by_yearId"/);
	assert.match(body, /rateYourMusicSpotifyAlbumLinks/);
	assert.match(body, /withIndex\("by_albumId"/);
	assert.match(body, /rateYourMusicReleaseGenres/);
	assert.match(body, /withIndex\("by_scrapeId"/);
	assert.match(body, /role === "primary"/);
	assert.match(body, /resolveTopLevelGenreKey/);
	assert.match(body, /buildRobRankingGenreCountSummary/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test convex/rob-ranking-genre-stats-source.test.ts
```

Expected: FAIL because the query does not exist yet.

- [ ] **Step 3: Add imports**

In `convex/robRankings.ts`, add:

```ts
import { buildRobRankingGenreCountSummary } from "./_utils/robRankingGenreStats";
import { resolveTopLevelGenreKey } from "./_utils/rymGenreHierarchy";
import { loadRymGenreParentKeysByChild } from "./_utils/forLaterFilterProjection";
```

Keep existing import ordering consistent with Biome.

- [ ] **Step 4: Add return validators near existing published stats validators**

In `convex/robRankings.ts`, near `publishedArtistStatsRowValidator`, add:

```ts
const publishedTopLevelGenreCountRowValidator = v.object({
	genreKey: v.string(),
	label: v.string(),
	count: v.number(),
});

const publishedTopLevelGenreCountSummaryValidator = v.object({
	year: v.number(),
	totalAlbums: v.number(),
	albumsWithGenreData: v.number(),
	albumsMissingGenreData: v.number(),
	genres: v.array(publishedTopLevelGenreCountRowValidator),
});
```

- [ ] **Step 5: Add small query helpers**

In `convex/robRankings.ts`, above `getPublishedAlbumsForYear`, add:

```ts
async function loadLatestRymLinkForAlbum(
	ctx: QueryCtx,
	albumId: Id<"spotifyAlbums">,
): Promise<Doc<"rateYourMusicSpotifyAlbumLinks"> | null> {
	const links = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_albumId", (q) => q.eq("albumId", albumId))
		.collect();

	return [...links].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

async function loadTopLevelGenresForScrape(
	ctx: QueryCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
	parentKeysByChild: Map<string, string[]>,
	topLevelGenreKeys: Set<string>,
	labelsByKey: Map<string, string>,
): Promise<Array<{ key: string; label: string }>> {
	const releaseGenres = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const topLevelGenres = new Map<string, string>();

	for (const releaseGenre of releaseGenres) {
		if (releaseGenre.role !== "primary") continue;

		const genre = await ctx.db.get(releaseGenre.genreId);
		if (!genre) continue;

		const topLevelKey = resolveTopLevelGenreKey(
			genre.key,
			parentKeysByChild,
			topLevelGenreKeys,
		);
		if (!topLevelKey) continue;

		topLevelGenres.set(
			topLevelKey,
			labelsByKey.get(topLevelKey) ?? genre.label,
		);
	}

	return [...topLevelGenres.entries()].map(([key, label]) => ({ key, label }));
}
```

- [ ] **Step 6: Add the query**

In `convex/robRankings.ts`, before `getPublishedAlbumsForYear`, add:

```ts
export const getPublishedTopLevelGenreCountsForYear = query({
	args: {
		year: v.number(),
	},
	returns: publishedTopLevelGenreCountSummaryValidator,
	handler: async (ctx, args) => {
		const yearRow = await ctx.db
			.query("robRankingYears")
			.filter((q) =>
				q.and(
					q.eq(q.field("year"), args.year),
					q.eq(q.field("published"), true),
				),
			)
			.first();

		if (!yearRow) {
			return buildRobRankingGenreCountSummary({
				year: args.year,
				totalAlbums: 0,
				albumTopLevelGenres: [],
			});
		}

		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", yearRow._id))
			.collect();

		const [parentKeysByChild, topLevelGenres] = await Promise.all([
			loadRymGenreParentKeysByChild(ctx),
			ctx.db
				.query("rateYourMusicGenres")
				.withIndex("by_isTopLevel", (q) => q.eq("isTopLevel", true))
				.collect(),
		]);

		const topLevelGenreKeys = new Set(topLevelGenres.map((genre) => genre.key));
		const labelsByKey = new Map(
			topLevelGenres.map((genre) => [genre.key, genre.label]),
		);
		const albumTopLevelGenres: Array<Array<{ key: string; label: string }>> = [];

		for (const ranking of rankings) {
			if (!ranking.albumId) {
				albumTopLevelGenres.push([]);
				continue;
			}

			const link = await loadLatestRymLinkForAlbum(ctx, ranking.albumId);
			if (!link) {
				albumTopLevelGenres.push([]);
				continue;
			}

			albumTopLevelGenres.push(
				await loadTopLevelGenresForScrape(
					ctx,
					link.scrapeId,
					parentKeysByChild,
					topLevelGenreKeys,
					labelsByKey,
				),
			);
		}

		return buildRobRankingGenreCountSummary({
			year: yearRow.year,
			totalAlbums: rankings.length,
			albumTopLevelGenres,
		});
	},
});
```

- [ ] **Step 7: Run focused backend checks**

Run:

```bash
pnpm exec tsx --test convex/_utils/robRankingGenreStats.test.ts convex/rob-ranking-genre-stats-source.test.ts
pnpm typecheck
```

Expected: tests PASS and typecheck exits 0.

---

### Task 3: Public Genres Stats Page

**Files:**
- Create: `src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx`
- Create: `src/app/public/robs-top-50/stats/genres/page.tsx`
- Create: `src/app/public/robs-top-50/stats/genres/page-source.test.ts`
- Modify: `src/app/public/robs-top-50/_components/public-stats-nav.tsx`

- [ ] **Step 1: Write the source-level route test**

Create `src/app/public/robs-top-50/stats/genres/page-source.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
	"src/app/public/robs-top-50/stats/genres/page.tsx",
	"utf8",
);
const navSource = readFileSync(
	"src/app/public/robs-top-50/_components/public-stats-nav.tsx",
	"utf8",
);

test("genres stats page uses published years and genre count query", () => {
	assert.match(pageSource, /api\.robRankings\.listPublishedYears/);
	assert.match(
		pageSource,
		/api\.robRankings\.getPublishedTopLevelGenreCountsForYear/,
	);
	assert.match(pageSource, /\?year=/);
	assert.match(pageSource, /TopLevelGenreCountsTable/);
});

test("public stats nav links to genres stats", () => {
	assert.match(navSource, /\/public\/robs-top-50\/stats\/genres/);
	assert.match(navSource, /Genres/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/public/robs-top-50/stats/genres/page-source.test.ts
```

Expected: FAIL because the page does not exist yet.

- [ ] **Step 3: Create the count table component**

Create `src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx`:

```tsx
"use client";

import { Skeleton } from "~/components/ui/skeleton";

export type TopLevelGenreCountRow = {
	genreKey: string;
	label: string;
	count: number;
};

export function TopLevelGenreCountsTable({
	rows,
}: {
	rows: TopLevelGenreCountRow[];
}) {
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No genre data available for this year yet.
			</p>
		);
	}

	return (
		<ol className="space-y-1">
			{rows.map((row, index) => (
				<li
					key={row.genreKey}
					className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
				>
					<span className="w-8 flex-shrink-0 text-right font-mono text-muted-foreground text-sm">
						{index + 1}
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-sm">{row.label}</p>
					</div>
					<span className="flex-shrink-0 font-mono text-sm tabular-nums">
						{row.count}
					</span>
				</li>
			))}
		</ol>
	);
}

export function TopLevelGenreCountsTableSkeleton() {
	return (
		<div className="space-y-2">
			{["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"].map((key) => (
				<div key={key} className="flex items-center gap-3 px-2 py-2">
					<Skeleton className="h-4 w-8" />
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-6" />
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 4: Create the genres stats page**

Create `src/app/public/robs-top-50/stats/genres/page.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { ListMusic } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { api } from "../../../../../../convex/_generated/api";
import { PublicStatsNav } from "../../_components/public-stats-nav";
import { PublicTop50Nav } from "../../_components/public-top-50-nav";
import {
	TopLevelGenreCountsTable,
	TopLevelGenreCountsTableSkeleton,
} from "../../_components/top-level-genre-counts-table";

export default function PublicRobsTop50GenreStatsPage() {
	return (
		<Suspense fallback={<PublicRobsTop50GenreStatsPageSkeleton />}>
			<PublicRobsTop50GenreStatsPageInner />
		</Suspense>
	);
}

function PublicRobsTop50GenreStatsPageInner() {
	const publishedYears = useQuery(api.robRankings.listPublishedYears, {});
	const searchParams = useSearchParams();
	const yearParam = searchParams?.get("year") ?? null;
	const defaultYear = publishedYears?.[0]?.year ?? null;
	const [selectedYear, setSelectedYear] = useState<number | null>(null);

	useEffect(() => {
		if (selectedYear !== null) return;
		if (!publishedYears || publishedYears.length === 0) return;

		const paramYear = yearParam ? Number(yearParam) : null;
		if (
			paramYear &&
			!Number.isNaN(paramYear) &&
			publishedYears.some((entry) => entry.year === paramYear)
		) {
			setSelectedYear(paramYear);
			return;
		}

		if (defaultYear !== null) {
			setSelectedYear(defaultYear);
		}
	}, [publishedYears, yearParam, defaultYear, selectedYear]);

	const activeYear = selectedYear ?? defaultYear;
	const genreSummary = useQuery(
		api.robRankings.getPublishedTopLevelGenreCountsForYear,
		activeYear !== null ? { year: activeYear } : "skip",
	);
	const isLoadingYears = publishedYears === undefined;
	const isLoadingGenres = activeYear !== null && genreSummary === undefined;

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<ListMusic className="h-6 w-6" />
						Rob&apos;s Top 50
					</CardTitle>
				</CardHeader>
				<CardContent>
					<PublicTop50Nav />
					<PublicStatsNav />

					{isLoadingYears ? (
						<TopLevelGenreCountsTableSkeleton />
					) : !publishedYears || publishedYears.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No published lists yet. Check back soon.
						</p>
					) : (
						<>
							<div className="mb-6 flex flex-wrap gap-2">
								{publishedYears.map((entry) => (
									<button
										key={entry.year}
										type="button"
										onClick={() => setSelectedYear(entry.year)}
										className={cn(
											"rounded-full border px-3 py-1 text-sm transition-colors",
											activeYear === entry.year
												? "border-primary bg-primary text-primary-foreground"
												: "hover:bg-muted",
										)}
									>
										{entry.year}
									</button>
								))}
							</div>

							{isLoadingGenres ? (
								<TopLevelGenreCountsTableSkeleton />
							) : genreSummary && genreSummary.totalAlbums > 0 ? (
								<>
									<p className="mb-2 text-muted-foreground text-sm">
										Top-level RYM genre counts for {genreSummary.year}.
									</p>
									<p className="mb-4 text-muted-foreground text-sm">
										{genreSummary.albumsWithGenreData} /{" "}
										{genreSummary.totalAlbums} albums have genre data;{" "}
										{genreSummary.albumsMissingGenreData} missing.
									</p>
									<TopLevelGenreCountsTable rows={genreSummary.genres} />
								</>
							) : (
								<p className="text-muted-foreground text-sm">
									No albums for this year.
								</p>
							)}
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

function PublicRobsTop50GenreStatsPageSkeleton() {
	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-2xl">
						<ListMusic className="h-6 w-6" />
						Rob&apos;s Top 50
					</CardTitle>
				</CardHeader>
				<CardContent>
					<TopLevelGenreCountsTableSkeleton />
				</CardContent>
			</Card>
		</main>
	);
}
```

- [ ] **Step 5: Add stats nav entry**

In `src/app/public/robs-top-50/_components/public-stats-nav.tsx`, add this option after `Unique artists`:

```ts
{
	href: "/public/robs-top-50/stats/genres",
	label: "Genres",
},
```

- [ ] **Step 6: Run focused frontend checks**

Run:

```bash
pnpm exec tsx --test src/app/public/robs-top-50/stats/genres/page-source.test.ts
pnpm typecheck
pnpm exec biome check src/app/public/robs-top-50/stats/genres/page.tsx src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx src/app/public/robs-top-50/_components/public-stats-nav.tsx
```

Expected: tests PASS, typecheck exits 0, Biome exits 0 for these files.

---

### Task 4: Final Integration Verification

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Run all feature tests**

Run:

```bash
pnpm exec tsx --test convex/_utils/robRankingGenreStats.test.ts convex/rob-ranking-genre-stats-source.test.ts src/app/public/robs-top-50/stats/genres/page-source.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Run focused Biome checks**

Run:

```bash
pnpm exec biome check convex/_utils/robRankingGenreStats.ts convex/_utils/robRankingGenreStats.test.ts convex/rob-ranking-genre-stats-source.test.ts convex/robRankings.ts src/app/public/robs-top-50/stats/genres/page.tsx src/app/public/robs-top-50/stats/genres/page-source.test.ts src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx src/app/public/robs-top-50/_components/public-stats-nav.tsx
```

Expected: no new issues in touched files. If Biome reports existing unrelated issues in `convex/robRankings.ts`, document that and keep focused UI/helper files clean.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git diff --stat
git diff -- docs/superpowers/specs/2026-07-02-robs-top-50-genre-counts-design.md docs/superpowers/plans/2026-07-02-robs-top-50-genre-counts.md convex/_utils/robRankingGenreStats.ts convex/_utils/robRankingGenreStats.test.ts convex/rob-ranking-genre-stats-source.test.ts convex/robRankings.ts src/app/public/robs-top-50/stats/genres/page.tsx src/app/public/robs-top-50/stats/genres/page-source.test.ts src/app/public/robs-top-50/_components/top-level-genre-counts-table.tsx src/app/public/robs-top-50/_components/public-stats-nav.tsx
```

Expected: diff matches the approved spec and no unrelated files are changed.

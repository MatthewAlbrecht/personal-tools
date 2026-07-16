# Smart Playlist Fields Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign smart playlist filter schema and recipe form so rating/duration are dual-range sliders, genres are per-row include/exclude+role clauses, year uses For Later’s picker, added-window gains presets + alignment fix, and preview-driven album exclusions persist on the recipe and apply to sync.

**Architecture:** Schema-first. Introduce new `SmartPlaylistFilters` (genre clauses, open-ended duration, `excludedAlbumIds`). Pure match/migrate helpers live in `convex/_utils` (Convex cannot import `src/`). Resolver normalizes legacy filters on read during transition; a one-shot internal mutation rewrites stored docs; validators then drop legacy. Form rebuilds filter controls around the new shape; sync pipeline stays unchanged and consumes already-filtered albums.

**Tech Stack:** Next.js 15 App Router, Convex, React, Tailwind, existing `Slider` (`src/components/ui/slider.tsx`), For Later `YearRangePicker`, TypeScript, Biome, `node:test` via `npx tsx --test`

**Spec:** `docs/superpowers/specs/2026-07-16-smart-playlist-fields-refactor-design.md`

## Global Constraints

- Rating stops are discrete **1–15**; full range `1–15` is a no-op in the resolver.
- Duration open-low = **under 20 min**; open-high = **≥ 90 min**; interior stops are whole minutes **20–89**.
- Genre ALL/ANY applies to **include** clauses only; **excludes always veto**.
- At most **one genre row per `genreKey`**.
- Album exclusions are `Id<"spotifyAlbums">` (Convex) / string ids in client types; set from preview rows only.
- Descriptors, name, source lock, sync mode, track selection unchanged.
- Do not unify For Later filter kit beyond reusing `YearRangePicker`.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/smart-playlists/types.ts` | New filter types (`GenreClause`, open duration, `excludedAlbumIds`); drop `genreKeys` / `primaryGenresOnly` / `durationBucketKey` from the public type |
| Create | `convex/_utils/smartPlaylistFilterModel.ts` | `EMPTY_SMART_PLAYLIST_FILTERS`, legacy type, `isLegacySmartPlaylistFilters`, `migrateLegacySmartPlaylistFilters`, duration/rating helpers |
| Create | `convex/_utils/smartPlaylistFilterModel.test.ts` | Migration + rating no-op + duration mapping tests |
| Create | `convex/_utils/smartPlaylistGenreMatch.ts` | `albumMatchesGenreClauses(primaryKeys, secondaryKeys, clauses, genreMatch)` |
| Create | `convex/_utils/smartPlaylistGenreMatch.test.ts` | Include ALL/ANY, roles, exclude veto |
| Modify | `convex/_utils/smartPlaylistValidators.ts` | New filters validator; temporary `legacy \| new` union during transition |
| Modify | `convex/smartPlaylists.ts` | Use new matchers; normalize filters; load For Later primary+secondary genre sets; apply exclusions; add `migrateFiltersToV2` internalMutation |
| Modify | `src/lib/smart-playlists/rule-summary.ts` | Summarize clauses, open duration, exclusions |
| Modify | `src/lib/smart-playlists/rule-summary.test.ts` | Update fixtures to new shape |
| Create | `src/app/smart-playlists/_components/rating-range-slider.tsx` | Dual-thumb 1–15 slider with tier labels |
| Create | `src/app/smart-playlists/_components/duration-range-slider.tsx` | Dual-thumb open-ended duration slider |
| Create | `src/app/smart-playlists/_components/genre-clause-list.tsx` | ALL/ANY + repeatable clause rows |
| Modify | `src/app/smart-playlists/_components/recipe-form.tsx` | Wire new controls, year picker, added presets/alignment, preview exclusions |
| Modify | `docs/ideas/2026-07-16-refactor-smart-playlist-fields.md` | Set `status: planned` + link spec/plan when done |

---

### Task 1: Filter model + migration helpers (TDD)

**Files:**
- Create: `convex/_utils/smartPlaylistFilterModel.ts`
- Create: `convex/_utils/smartPlaylistFilterModel.test.ts`

**Interfaces:**
- Produces: `SmartPlaylistFiltersV2`, `LegacySmartPlaylistFilters`, `EMPTY_SMART_PLAYLIST_FILTERS`, `migrateLegacySmartPlaylistFilters`, `isRatingFilterActive`, `durationBoundsFromFilters`, `albumMatchesDurationFilter`

- [ ] **Step 1: Write the failing tests**

```typescript
// convex/_utils/smartPlaylistFilterModel.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	albumMatchesDurationFilter,
	durationBoundsFromFilters,
	isRatingFilterActive,
	migrateLegacySmartPlaylistFilters,
} from "./smartPlaylistFilterModel";

test("migrateLegacy maps genreKeys + primaryGenresOnly to include clauses", () => {
	const next = migrateLegacySmartPlaylistFilters({
		genreKeys: ["folk", "jazz"],
		genreMatch: "all",
		primaryGenresOnly: true,
		descriptorKeys: [],
		descriptorMatch: "any",
		ratingMin: 10,
		ratingMax: 15,
	});
	assert.deepEqual(next.genreClauses, [
		{ genreKey: "folk", mode: "include", role: "primary" },
		{ genreKey: "jazz", mode: "include", role: "primary" },
	]);
	assert.equal(next.genreMatch, "all");
	assert.deepEqual(next.excludedAlbumIds, []);
	assert.equal(next.ratingMin, 10);
	assert.equal(next.ratingMax, 15);
	assert.equal(next.durationOpenLow, true);
	assert.equal(next.durationOpenHigh, true);
});

test("migrateLegacy uses either when primaryGenresOnly is false", () => {
	const next = migrateLegacySmartPlaylistFilters({
		genreKeys: ["folk"],
		genreMatch: "any",
		primaryGenresOnly: false,
		descriptorKeys: [],
		descriptorMatch: "any",
	});
	assert.equal(next.genreClauses[0]?.role, "either");
	assert.equal(next.ratingMin, 1);
	assert.equal(next.ratingMax, 15);
});

test("isRatingFilterActive is false only for full 1–15", () => {
	assert.equal(isRatingFilterActive({ ratingMin: 1, ratingMax: 15 }), false);
	assert.equal(isRatingFilterActive({ ratingMin: 10, ratingMax: 15 }), true);
});

test("duration both open matches any duration including missing", () => {
	const filters = {
		durationOpenLow: true,
		durationOpenHigh: true,
	};
	assert.equal(albumMatchesDurationFilter(undefined, filters), true);
	assert.equal(albumMatchesDurationFilter(5 * 60_000, filters), true);
});

test("duration open-low with max 45 allows under 20 and up to 45", () => {
	const filters = {
		durationOpenLow: true,
		durationOpenHigh: false,
		durationMaxMinutes: 45,
	};
	assert.equal(albumMatchesDurationFilter(10 * 60_000, filters), true);
	assert.equal(albumMatchesDurationFilter(45 * 60_000, filters), true);
	assert.equal(albumMatchesDurationFilter(46 * 60_000, filters), false);
});

test("duration min 30 with open-high allows 30+ including 90+", () => {
	const filters = {
		durationOpenLow: false,
		durationOpenHigh: true,
		durationMinMinutes: 30,
	};
	assert.equal(albumMatchesDurationFilter(29 * 60_000, filters), false);
	assert.equal(albumMatchesDurationFilter(30 * 60_000, filters), true);
	assert.equal(albumMatchesDurationFilter(120 * 60_000, filters), true);
});

test("durationBoundsFromFilters encodes open ends", () => {
	assert.deepEqual(
		durationBoundsFromFilters({
			durationOpenLow: true,
			durationOpenHigh: true,
		}),
		{ minMinutes: undefined, maxMinutes: undefined, active: false },
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test convex/_utils/smartPlaylistFilterModel.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement minimal model**

```typescript
// convex/_utils/smartPlaylistFilterModel.ts
export type GenreRole = "primary" | "secondary" | "either";
export type GenreClause = {
	genreKey: string;
	mode: "include" | "exclude";
	role: GenreRole;
};

export type SmartPlaylistFiltersV2 = {
	genreClauses: GenreClause[];
	genreMatch: "all" | "any";
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin: number;
	ratingMax: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
	addedWindow?:
		| { type: "absolute"; afterMs?: number; beforeMs?: number }
		| { type: "relative"; unit: "days" | "months"; amount: number }
		| { type: "calendar_month"; year: number; month: number };
	excludedAlbumIds: string[];
};

export type LegacySmartPlaylistFilters = {
	genreKeys: string[];
	genreMatch: "all" | "any";
	primaryGenresOnly: boolean;
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin?: number;
	ratingMax?: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationBucketKey?: string;
	addedWindow?: SmartPlaylistFiltersV2["addedWindow"];
};

export const EMPTY_SMART_PLAYLIST_FILTERS: SmartPlaylistFiltersV2 = {
	genreClauses: [],
	genreMatch: "any",
	descriptorKeys: [],
	descriptorMatch: "any",
	ratingMin: 1,
	ratingMax: 15,
	durationOpenLow: true,
	durationOpenHigh: true,
	excludedAlbumIds: [],
};

export function isLegacySmartPlaylistFilters(
	filters: LegacySmartPlaylistFilters | SmartPlaylistFiltersV2,
): filters is LegacySmartPlaylistFilters {
	return "genreKeys" in filters && Array.isArray(filters.genreKeys);
}

export function migrateLegacySmartPlaylistFilters(
	legacy: LegacySmartPlaylistFilters,
): SmartPlaylistFiltersV2 {
	const role = legacy.primaryGenresOnly ? "primary" : "either";
	return {
		genreClauses: legacy.genreKeys.map((genreKey) => ({
			genreKey,
			mode: "include",
			role,
		})),
		genreMatch: legacy.genreMatch,
		descriptorKeys: legacy.descriptorKeys,
		descriptorMatch: legacy.descriptorMatch,
		ratingMin: legacy.ratingMin ?? 1,
		ratingMax: legacy.ratingMax ?? 15,
		yearMin: legacy.yearMin,
		yearMax: legacy.yearMax,
		durationMinMinutes: legacy.durationMinMinutes,
		durationMaxMinutes: legacy.durationMaxMinutes,
		durationOpenLow:
			legacy.durationMinMinutes === undefined &&
			legacy.durationBucketKey === undefined,
		durationOpenHigh: legacy.durationMaxMinutes === undefined,
		addedWindow: legacy.addedWindow,
		excludedAlbumIds: [],
	};
}

export function normalizeSmartPlaylistFilters(
	filters: LegacySmartPlaylistFilters | SmartPlaylistFiltersV2,
): SmartPlaylistFiltersV2 {
	if (isLegacySmartPlaylistFilters(filters)) {
		return migrateLegacySmartPlaylistFilters(filters);
	}
	return {
		...EMPTY_SMART_PLAYLIST_FILTERS,
		...filters,
		genreClauses: filters.genreClauses ?? [],
		excludedAlbumIds: filters.excludedAlbumIds ?? [],
		ratingMin: filters.ratingMin ?? 1,
		ratingMax: filters.ratingMax ?? 15,
	};
}

export function isRatingFilterActive(filters: {
	ratingMin: number;
	ratingMax: number;
}): boolean {
	return !(filters.ratingMin === 1 && filters.ratingMax === 15);
}

export function durationBoundsFromFilters(filters: {
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
}): { minMinutes?: number; maxMinutes?: number; active: boolean } {
	const openLow = filters.durationOpenLow === true;
	const openHigh = filters.durationOpenHigh === true;
	if (openLow && openHigh) {
		return { active: false };
	}
	return {
		minMinutes: openLow ? undefined : filters.durationMinMinutes,
		maxMinutes: openHigh ? undefined : filters.durationMaxMinutes,
		active: true,
	};
}

export function albumMatchesDurationFilter(
	durationMs: number | undefined,
	filters: {
		durationMinMinutes?: number;
		durationMaxMinutes?: number;
		durationOpenLow?: boolean;
		durationOpenHigh?: boolean;
	},
): boolean {
	const bounds = durationBoundsFromFilters(filters);
	if (!bounds.active) {
		return true;
	}
	if (durationMs === undefined) {
		return false;
	}
	const minutes = durationMs / 60_000;
	if (bounds.minMinutes !== undefined && minutes < bounds.minMinutes) {
		return false;
	}
	if (bounds.maxMinutes !== undefined && minutes > bounds.maxMinutes) {
		return false;
	}
	return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test convex/_utils/smartPlaylistFilterModel.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/smartPlaylistFilterModel.ts convex/_utils/smartPlaylistFilterModel.test.ts
git commit -m "feat(smart-playlists): add filter model and legacy migration helpers"
```

---

### Task 2: Genre clause matching (TDD)

**Files:**
- Create: `convex/_utils/smartPlaylistGenreMatch.ts`
- Create: `convex/_utils/smartPlaylistGenreMatch.test.ts`

**Interfaces:**
- Consumes: `GenreClause` from `smartPlaylistFilterModel`
- Produces: `clauseMatchesRoleKeys`, `albumMatchesGenreClauses`

- [ ] **Step 1: Write the failing tests**

```typescript
// convex/_utils/smartPlaylistGenreMatch.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { albumMatchesGenreClauses } from "./smartPlaylistGenreMatch";

const primary = new Set(["folk", "rock"]);
const secondary = new Set(["jazz"]);

test("empty clauses match everything", () => {
	assert.equal(
		albumMatchesGenreClauses(primary, secondary, [], "any"),
		true,
	);
});

test("include any: one matching primary role passes", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "folk", mode: "include", role: "primary" }],
			"any",
		),
		true,
	);
});

test("include primary fails when genre only secondary", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "jazz", mode: "include", role: "primary" }],
			"any",
		),
		false,
	);
});

test("include either matches secondary", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "jazz", mode: "include", role: "either" }],
			"any",
		),
		true,
	);
});

test("include all requires every include clause", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[
				{ genreKey: "folk", mode: "include", role: "primary" },
				{ genreKey: "jazz", mode: "include", role: "either" },
			],
			"all",
		),
		true,
	);
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[
				{ genreKey: "folk", mode: "include", role: "primary" },
				{ genreKey: "ambient", mode: "include", role: "either" },
			],
			"all",
		),
		false,
	);
});

test("exclude vetoes even when includes would pass", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[
				{ genreKey: "folk", mode: "include", role: "primary" },
				{ genreKey: "jazz", mode: "exclude", role: "secondary" },
			],
			"any",
		),
		false,
	);
});

test("exclude alone filters without includes", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "folk", mode: "exclude", role: "primary" }],
			"any",
		),
		false,
	);
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "ambient", mode: "exclude", role: "either" }],
			"any",
		),
		true,
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test convex/_utils/smartPlaylistGenreMatch.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement matcher**

```typescript
// convex/_utils/smartPlaylistGenreMatch.ts
import type { GenreClause } from "./smartPlaylistFilterModel";

function roleKeySet(
	role: GenreClause["role"],
	primaryKeys: Set<string>,
	secondaryKeys: Set<string>,
): Set<string> {
	if (role === "primary") return primaryKeys;
	if (role === "secondary") return secondaryKeys;
	const either = new Set(primaryKeys);
	for (const key of secondaryKeys) either.add(key);
	return either;
}

export function clauseMatchesRoleKeys(
	clause: GenreClause,
	primaryKeys: Set<string>,
	secondaryKeys: Set<string>,
): boolean {
	return roleKeySet(clause.role, primaryKeys, secondaryKeys).has(
		clause.genreKey,
	);
}

export function albumMatchesGenreClauses(
	primaryKeys: Set<string>,
	secondaryKeys: Set<string>,
	clauses: GenreClause[],
	genreMatch: "all" | "any",
): boolean {
	if (clauses.length === 0) return true;

	const includes = clauses.filter((c) => c.mode === "include");
	const excludes = clauses.filter((c) => c.mode === "exclude");

	for (const clause of excludes) {
		if (clauseMatchesRoleKeys(clause, primaryKeys, secondaryKeys)) {
			return false;
		}
	}

	if (includes.length === 0) return true;

	if (genreMatch === "any") {
		return includes.some((clause) =>
			clauseMatchesRoleKeys(clause, primaryKeys, secondaryKeys),
		);
	}
	return includes.every((clause) =>
		clauseMatchesRoleKeys(clause, primaryKeys, secondaryKeys),
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test convex/_utils/smartPlaylistGenreMatch.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/smartPlaylistGenreMatch.ts convex/_utils/smartPlaylistGenreMatch.test.ts
git commit -m "feat(smart-playlists): add genre clause matching helpers"
```

---

### Task 3: Client types + dual validators

**Files:**
- Modify: `src/lib/smart-playlists/types.ts`
- Modify: `convex/_utils/smartPlaylistValidators.ts`

**Interfaces:**
- Produces: client `SmartPlaylistFilters` matching V2; validators `smartPlaylistFiltersValidator` (union of legacy + new during transition), `smartPlaylistFiltersV2Validator`

- [ ] **Step 1: Replace client filter types**

```typescript
// src/lib/smart-playlists/types.ts — replace SmartPlaylistFilters and add:
export type GenreRole = "primary" | "secondary" | "either";

export type GenreClause = {
	genreKey: string;
	mode: "include" | "exclude";
	role: GenreRole;
};

export type SmartPlaylistFilters = {
	genreClauses: GenreClause[];
	genreMatch: "all" | "any";
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin: number;
	ratingMax: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
	addedWindow?: AddedWindow;
	/** Convex Id<"spotifyAlbums"> as string on the client */
	excludedAlbumIds: string[];
};
```

Remove `genreKeys`, `primaryGenresOnly`, `durationBucketKey`, and make `ratingMin`/`ratingMax` required numbers.

Export `EMPTY_SMART_PLAYLIST_FILTERS` from types (mirror convex empty) for the form:

```typescript
export const EMPTY_SMART_PLAYLIST_FILTERS: SmartPlaylistFilters = {
	genreClauses: [],
	genreMatch: "any",
	descriptorKeys: [],
	descriptorMatch: "any",
	ratingMin: 1,
	ratingMax: 15,
	durationOpenLow: true,
	durationOpenHigh: true,
	excludedAlbumIds: [],
};
```

- [ ] **Step 2: Update Convex validators to accept legacy | v2**

```typescript
// convex/_utils/smartPlaylistValidators.ts
export const genreClauseValidator = v.object({
	genreKey: v.string(),
	mode: v.union(v.literal("include"), v.literal("exclude")),
	role: v.union(
		v.literal("primary"),
		v.literal("secondary"),
		v.literal("either"),
	),
});

export const smartPlaylistFiltersV2Validator = v.object({
	genreClauses: v.array(genreClauseValidator),
	genreMatch: v.union(v.literal("all"), v.literal("any")),
	descriptorKeys: v.array(v.string()),
	descriptorMatch: v.union(v.literal("all"), v.literal("any")),
	ratingMin: v.number(),
	ratingMax: v.number(),
	yearMin: v.optional(v.number()),
	yearMax: v.optional(v.number()),
	durationMinMinutes: v.optional(v.number()),
	durationMaxMinutes: v.optional(v.number()),
	durationOpenLow: v.optional(v.boolean()),
	durationOpenHigh: v.optional(v.boolean()),
	addedWindow: v.optional(addedWindowValidator),
	excludedAlbumIds: v.array(v.id("spotifyAlbums")),
});

const legacySmartPlaylistFiltersValidator = v.object({
	genreKeys: v.array(v.string()),
	genreMatch: v.union(v.literal("all"), v.literal("any")),
	primaryGenresOnly: v.boolean(),
	descriptorKeys: v.array(v.string()),
	descriptorMatch: v.union(v.literal("all"), v.literal("any")),
	ratingMin: v.optional(v.number()),
	ratingMax: v.optional(v.number()),
	yearMin: v.optional(v.number()),
	yearMax: v.optional(v.number()),
	durationMinMinutes: v.optional(v.number()),
	durationMaxMinutes: v.optional(v.number()),
	durationBucketKey: v.optional(v.string()),
	addedWindow: v.optional(addedWindowValidator),
});

/** Temporary: allow reads/writes of both shapes until migration completes */
export const smartPlaylistFiltersValidator = v.union(
	legacySmartPlaylistFiltersValidator,
	smartPlaylistFiltersV2Validator,
);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`  
Expected: errors only in smart-playlist consumers still on old shape (form, rule-summary) — fix those in later tasks; if typecheck fails only there, proceed. If validators break schema compile, fix imports.

- [ ] **Step 4: Commit**

```bash
git add src/lib/smart-playlists/types.ts convex/_utils/smartPlaylistValidators.ts
git commit -m "feat(smart-playlists): dual-shape filter types and validators"
```

---

### Task 4: Wire resolver + exclusions + For Later role keys

**Files:**
- Modify: `convex/smartPlaylists.ts`

**Interfaces:**
- Consumes: `normalizeSmartPlaylistFilters`, `isRatingFilterActive`, `albumMatchesDurationFilter`, `albumMatchesGenreClauses`
- Produces: updated `resolveForLaterMatches` / `resolveRankingsMatches` that filter with V2 semantics and drop `excludedAlbumIds`

- [ ] **Step 1: Replace local `SmartPlaylistFilters` type**

Import V2 + normalize from `./_utils/smartPlaylistFilterModel`. Delete the inline filters type. At the start of `resolveMatchingAlbums`, normalize:

```typescript
const filters = normalizeSmartPlaylistFilters(args.filters);
```

Pass `filters` (V2) into forLater/rankings resolvers.

- [ ] **Step 2: Replace rating / duration helpers**

```typescript
function ratingMatchesBounds(
	rating: number | undefined,
	filters: { ratingMin: number; ratingMax: number },
): boolean {
	if (!isRatingFilterActive(filters)) return true;
	if (rating === undefined) return false;
	return rating >= filters.ratingMin && rating <= filters.ratingMax;
}
```

Replace `durationMatchesFilters` body with `albumMatchesDurationFilter(durationMs, filters)`.

- [ ] **Step 3: Add loadGenreRoleKeysForScrape**

Extend existing `loadPrimaryGenreKeysForScrape` into loading both roles:

```typescript
async function loadGenreRoleKeysForScrape(
	ctx: DbCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<{ primary: Set<string>; secondary: Set<string> }> {
	const genreLinks = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();
	const primary = new Set<string>();
	const secondary = new Set<string>();
	for (const link of genreLinks) {
		const genre = await ctx.db.get(link.genreId);
		if (!genre) continue;
		if (link.role === "primary") primary.add(genre.key);
		else if (link.role === "secondary") secondary.add(genre.key);
	}
	return { primary, secondary };
}
```

When expanding with ancestors for matching, expand each set separately via `buildFilterGenreKeysSortedWithAncestors`.

- [ ] **Step 4: Replace genre blocks in forLater + rankings**

For Later (when `filters.genreClauses.length > 0`):

```typescript
if (!item.rymScrapeId || !parentKeysByChild) continue;
const roles = await loadGenreRoleKeysForScrape(ctx, item.rymScrapeId);
const primaryKeys = new Set(
	buildFilterGenreKeysSortedWithAncestors([...roles.primary], parentKeysByChild),
);
const secondaryKeys = new Set(
	buildFilterGenreKeysSortedWithAncestors(
		[...roles.secondary],
		parentKeysByChild,
	),
);
if (
	!albumMatchesGenreClauses(
		primaryKeys,
		secondaryKeys,
		filters.genreClauses,
		filters.genreMatch,
	)
) {
	continue;
}
```

Load `parentKeysByChild` when any genre clauses exist (not only primaryGenresOnly).

Rankings: build primary/secondary sets from `item.primaryGenres` / `item.secondaryGenres` keys (with ancestor expansion when parent map loaded), then `albumMatchesGenreClauses`.

- [ ] **Step 5: Apply exclusions at end of `resolveMatchingAlbums`**

```typescript
const excluded = new Set(filters.excludedAlbumIds);
return matches.filter((album) => !excluded.has(album.albumId));
```

(Use string compare if normalize stores strings — cast `album.albumId` consistently.)

- [ ] **Step 6: Fix `needsRating` / `needsDuration` flags**

```typescript
const needsRating = isRatingFilterActive(filters);
const needsDuration =
	filters.durationOpenLow !== true || filters.durationOpenHigh !== true;
```

- [ ] **Step 7: Typecheck Convex file**

Run: `pnpm typecheck`  
Expected: `smartPlaylists.ts` clean; form/summary may still error.

- [ ] **Step 8: Commit**

```bash
git add convex/smartPlaylists.ts
git commit -m "feat(smart-playlists): resolve matches with clause filters and exclusions"
```

---

### Task 5: One-shot migration mutation

**Files:**
- Modify: `convex/smartPlaylists.ts` (add `internalMutation`)

- [ ] **Step 1: Add internal migration**

```typescript
import { internalMutation } from "./_generated/server";

export const migrateFiltersToV2 = internalMutation({
	args: {},
	returns: v.object({
		scanned: v.number(),
		migrated: v.number(),
		skipped: v.number(),
	}),
	handler: async (ctx) => {
		const recipes = await ctx.db.query("smartPlaylists").collect();
		let migrated = 0;
		let skipped = 0;
		for (const recipe of recipes) {
			const filters = recipe.filters as
				| LegacySmartPlaylistFilters
				| SmartPlaylistFiltersV2;
			if (!isLegacySmartPlaylistFilters(filters)) {
				skipped += 1;
				continue;
			}
			const next = migrateLegacySmartPlaylistFilters(filters);
			await ctx.db.patch(recipe._id, {
				filters: {
					...next,
					excludedAlbumIds: [] as Id<"spotifyAlbums">[],
				},
				updatedAt: Date.now(),
			});
			migrated += 1;
		}
		return { scanned: recipes.length, migrated, skipped };
	},
});
```

Note: `excludedAlbumIds` must be `Id<"spotifyAlbums">[]` for V2 validator — empty array is fine.

- [ ] **Step 2: Document run command in plan comment at top of mutation**

```typescript
// Run once from Convex dashboard: internal.smartPlaylists.migrateFiltersToV2
```

- [ ] **Step 3: Commit**

```bash
git add convex/smartPlaylists.ts
git commit -m "feat(smart-playlists): add internal filters v2 migration mutation"
```

---

### Task 6: Rule summary (TDD)

**Files:**
- Modify: `src/lib/smart-playlists/rule-summary.ts`
- Modify: `src/lib/smart-playlists/rule-summary.test.ts`

- [ ] **Step 1: Rewrite tests for V2**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { formatRuleSummary } from "./rule-summary";

test("for later folk primary under 30m with exclusion count", () => {
	const s = formatRuleSummary({
		source: "forLater",
		filters: {
			genreClauses: [
				{ genreKey: "folk", mode: "include", role: "primary" },
			],
			genreMatch: "any",
			descriptorKeys: [],
			descriptorMatch: "any",
			ratingMin: 1,
			ratingMax: 15,
			durationOpenLow: true,
			durationOpenHigh: false,
			durationMaxMinutes: 30,
			excludedAlbumIds: ["k17abc"],
		},
		genreLabels: { folk: "Folk" },
	});
	assert.match(s, /For Later/);
	assert.match(s, /Folk \(primary\)/);
	assert.match(s, /under 30m|30m/);
	assert.match(s, /−1 excluded|1 excluded/);
});

test("exclude genre renders with bang", () => {
	const s = formatRuleSummary({
		source: "rankings",
		filters: {
			genreClauses: [
				{ genreKey: "jazz", mode: "exclude", role: "secondary" },
			],
			genreMatch: "any",
			descriptorKeys: [],
			descriptorMatch: "any",
			ratingMin: 13,
			ratingMax: 15,
			durationOpenLow: true,
			durationOpenHigh: true,
			excludedAlbumIds: [],
		},
		genreLabels: { jazz: "Jazz" },
	});
	assert.match(s, /!Jazz \(secondary\)/);
	assert.match(s, /13|Holy Moly|rating/);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx tsx --test src/lib/smart-playlists/rule-summary.test.ts`  
Expected: FAIL

- [ ] **Step 3: Update `formatGenreSegment` / duration / rating / exclusions**

```typescript
function formatGenreSegment(...) {
  if (filters.genreClauses.length === 0) return undefined;
  const parts = filters.genreClauses.map((c) => {
    const label = genreLabels?.[c.genreKey] ?? c.genreKey;
    const role = c.role === "either" ? "" : ` (${c.role})`;
    return c.mode === "exclude" ? `!${label}${role}` : `${label}${role}`;
  });
  const joined = parts.join(filters.genreMatch === "all" ? " + " : ", ");
  return joined;
}

function formatRatingSegment(...) {
  if (filters.ratingMin === 1 && filters.ratingMax === 15) return undefined;
  // prefer getTierLabel when min===max; else `rating min–max`
}

function formatDurationSegment(...) {
  if (filters.durationOpenLow && filters.durationOpenHigh) return undefined;
  if (filters.durationOpenLow && filters.durationMaxMinutes !== undefined) {
    return `under ${filters.durationMaxMinutes}m`;
  }
  if (filters.durationOpenHigh && filters.durationMinMinutes !== undefined) {
    return `${filters.durationMinMinutes}m+`;
  }
  if (
    filters.durationMinMinutes !== undefined &&
    filters.durationMaxMinutes !== undefined
  ) {
    return `${filters.durationMinMinutes}–${filters.durationMaxMinutes}m`;
  }
  return undefined;
}

// In formatRuleSummary, after other segments:
if (filters.excludedAlbumIds.length > 0) {
  segments.push(`−${filters.excludedAlbumIds.length} excluded`);
}
```

Import `getTierLabel` from `~/lib/album-tiers` when min === max.

- [ ] **Step 4: Run tests**

Run: `npx tsx --test src/lib/smart-playlists/rule-summary.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/smart-playlists/rule-summary.ts src/lib/smart-playlists/rule-summary.test.ts
git commit -m "feat(smart-playlists): update rule summary for clause filters"
```

---

### Task 7: Rating dual-range slider component

**Files:**
- Create: `src/app/smart-playlists/_components/rating-range-slider.tsx`

- [ ] **Step 1: Implement component**

```typescript
"use client";

import { getTierLabel } from "~/lib/album-tiers";
import { Slider } from "~/components/ui/slider";
import { Label } from "~/components/ui/label";

export function RatingRangeSlider({
	ratingMin,
	ratingMax,
	onChange,
}: {
	ratingMin: number;
	ratingMax: number;
	onChange: (next: { ratingMin: number; ratingMax: number }) => void;
}): React.ReactNode {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<Label>Rating</Label>
				<p className="text-muted-foreground text-xs">
					{getTierLabel(ratingMin)} → {getTierLabel(ratingMax)}
				</p>
			</div>
			<Slider
				min={1}
				max={15}
				step={1}
				value={[ratingMin, ratingMax]}
				onValueChange={(value) => {
					const low = value[0] ?? 1;
					const high = value[1] ?? 15;
					onChange({
						ratingMin: Math.min(low, high),
						ratingMax: Math.max(low, high),
					});
				}}
			/>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/smart-playlists/_components/rating-range-slider.tsx
git commit -m "feat(smart-playlists): add rating dual-range slider"
```

---

### Task 8: Duration dual-range slider component

**Files:**
- Create: `src/app/smart-playlists/_components/duration-range-slider.tsx`
- Optional create: `src/lib/smart-playlists/duration-slider.ts` + test for index↔filter mapping

**Encoding:** slider indices `0 … 71` where `0 = openLow`, `1..70 = minutes 20..89`, `71 = openHigh`.

- [ ] **Step 1: Write mapping tests**

```typescript
// src/lib/smart-playlists/duration-slider.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	durationFiltersFromIndices,
	indicesFromDurationFilters,
} from "./duration-slider";

test("default both open", () => {
	assert.deepEqual(durationFiltersFromIndices(0, 71), {
		durationOpenLow: true,
		durationOpenHigh: true,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
	});
});

test("open low to 45", () => {
	const idx45 = 1 + (45 - 20); // 26
	assert.deepEqual(durationFiltersFromIndices(0, idx45), {
		durationOpenLow: true,
		durationOpenHigh: false,
		durationMinMinutes: undefined,
		durationMaxMinutes: 45,
	});
});

test("round-trip closed 30–60", () => {
	const low = 1 + (30 - 20);
	const high = 1 + (60 - 20);
	const filters = durationFiltersFromIndices(low, high);
	assert.deepEqual(indicesFromDurationFilters(filters), [low, high]);
});
```

- [ ] **Step 2: Implement mapping + slider UI**

```typescript
// src/lib/smart-playlists/duration-slider.ts
export const DURATION_SLIDER_MAX_INDEX = 71;

export function durationFiltersFromIndices(low: number, high: number) {
	const lo = Math.min(low, high);
	const hi = Math.max(low, high);
	return {
		durationOpenLow: lo === 0,
		durationOpenHigh: hi === DURATION_SLIDER_MAX_INDEX,
		durationMinMinutes: lo === 0 ? undefined : 20 + (lo - 1),
		durationMaxMinutes:
			hi === DURATION_SLIDER_MAX_INDEX ? undefined : 20 + (hi - 1),
	};
}

export function indicesFromDurationFilters(filters: {
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
}): [number, number] {
	const low =
		filters.durationOpenLow === true || filters.durationMinMinutes === undefined
			? 0
			: 1 + (filters.durationMinMinutes - 20);
	const high =
		filters.durationOpenHigh === true ||
		filters.durationMaxMinutes === undefined
			? DURATION_SLIDER_MAX_INDEX
			: 1 + (filters.durationMaxMinutes - 20);
	return [low, high];
}

export function formatDurationHandleLabel(index: number): string {
	if (index === 0) return "<20m";
	if (index === DURATION_SLIDER_MAX_INDEX) return "1h30m+";
	const minutes = 20 + (index - 1);
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? `${h}h${m.toString().padStart(2, "0")}m` : `${m}m`;
}
```

Wire `DurationRangeSlider` similarly to rating, calling `onChange` with the filter patch object.

- [ ] **Step 3: Run mapping tests**

Run: `npx tsx --test src/lib/smart-playlists/duration-slider.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/smart-playlists/duration-slider.ts src/lib/smart-playlists/duration-slider.test.ts src/app/smart-playlists/_components/duration-range-slider.tsx
git commit -m "feat(smart-playlists): add open-ended duration dual-range slider"
```

---

### Task 9: Genre clause list UI

**Files:**
- Create: `src/app/smart-playlists/_components/genre-clause-list.tsx`

- [ ] **Step 1: Implement list**

Behavior:
- ALL/ANY toggle bound to `genreMatch`.
- Combobox of genre keys; on select: if `genreKey` already in clauses, do not duplicate — optionally no-op or flash existing row; else append `{ genreKey, mode: "include", role: "primary" }` and clear combobox selection.
- Each row: label, Select Include/Exclude, Select Primary/Secondary/Either, delete button.
- Button “Add another genre filter” focuses the combobox (via ref).

Reuse the same Combobox primitives already imported in `recipe-form.tsx` (move genre combobox markup into this component). Props:

```typescript
export function GenreClauseList({
	genreOptions, // { key, label }[]
	clauses,
	genreMatch,
	onChange,
}: {
	genreOptions: Array<{ key: string; label: string }>;
	clauses: GenreClause[];
	genreMatch: "all" | "any";
	onChange: (next: {
		genreClauses: GenreClause[];
		genreMatch: "all" | "any";
	}) => void;
}): React.ReactNode
```

- [ ] **Step 2: Commit**

```bash
git add src/app/smart-playlists/_components/genre-clause-list.tsx
git commit -m "feat(smart-playlists): add genre clause list control"
```

---

### Task 10: Rebuild recipe form filters + year + added window

**Files:**
- Modify: `src/app/smart-playlists/_components/recipe-form.tsx`

- [ ] **Step 1: Swap EMPTY_FILTERS and remove old rating UI state**

Use `EMPTY_SMART_PLAYLIST_FILTERS` from types. Delete `RatingMode` / `RatingUiState` / `applyRatingUi` / tier selects. Delete multi-select genre chips + `primaryGenresOnly` checkbox. Delete duration bucket/min/max number inputs if present.

- [ ] **Step 2: Insert new controls**

Order in filters card:
1. `GenreClauseList`
2. `RatingRangeSlider`
3. `DurationRangeSlider`
4. Import and render `YearRangePicker` from `~/app/for-later-albums/_components/year-range-picker` with `yearMin`/`yearMax`/`onCommit`
5. Descriptors (unchanged)
6. Added window (For Later only)

- [ ] **Step 3: Fix added-window alignment + presets**

- Wrap Type / Year / Month in a single grid: `grid grid-cols-1 gap-3 sm:grid-cols-3 items-end` with each field `space-y-1.5` and shared trigger height (`h-9` on SelectTrigger and Input).
- Above the Type row, render preset buttons:

```typescript
const ADDED_PRESETS = [7, 14, 30, 90] as const;
// onClick → set addedWindow UI to relative days + patchFilters({
//   addedWindow: { type: "relative", unit: "days", amount }
// })
```

- [ ] **Step 4: Ensure create/update payloads send V2 only**

`normalizeFiltersForSave` strips undefined duration mins when open flags set; always includes `excludedAlbumIds` and `genreClauses`.

- [ ] **Step 5: Manual smoke in browser** (dev)

Create recipe → change rating/duration/genres/year → preview updates. Rankings hides added window.

- [ ] **Step 6: Commit**

```bash
git add src/app/smart-playlists/_components/recipe-form.tsx
git commit -m "feat(smart-playlists): rebuild recipe form filter controls"
```

---

### Task 11: Preview exclusions UI

**Files:**
- Modify: `src/app/smart-playlists/_components/recipe-form.tsx`

- [ ] **Step 1: Add exclude control on each preview row**

```tsx
<button
  type="button"
  className="text-muted-foreground text-xs hover:text-foreground"
  onClick={() => {
    if (filters.excludedAlbumIds.includes(album.albumId)) return;
    patchFilters({
      excludedAlbumIds: [...filters.excludedAlbumIds, album.albumId],
    });
  }}
>
  Exclude
</button>
```

- [ ] **Step 2: Render excluded chips under the list**

For each id in `excludedAlbumIds`, show name if present in current preview or `"Excluded album"` + remove button that filters id out of `excludedAlbumIds`.

- [ ] **Step 3: Confirm preview query receives exclusions**

`previewMatches` already gets `filters` from form state — after Task 4, counts drop when exclusions added without save. On edit save, exclusions persist.

- [ ] **Step 4: Commit**

```bash
git add src/app/smart-playlists/_components/recipe-form.tsx
git commit -m "feat(smart-playlists): exclude albums from preview and recipe filters"
```

---

### Task 12: Drop legacy validator + mark idea planned

**Files:**
- Modify: `convex/_utils/smartPlaylistValidators.ts`
- Modify: `docs/ideas/2026-07-16-refactor-smart-playlist-fields.md`

- [ ] **Step 1: Run migration on dev deployment**

From Convex dashboard / CLI: run `internal.smartPlaylists.migrateFiltersToV2`.  
Expected: `migrated + skipped === scanned`, `migrated` ≥ 0.

- [ ] **Step 2: Remove legacy from union**

```typescript
export const smartPlaylistFiltersValidator = smartPlaylistFiltersV2Validator;
```

Delete `legacySmartPlaylistFiltersValidator` export if unused. Keep `migrateFiltersToV2` as idempotent no-op for already-migrated docs.

- [ ] **Step 3: Full verification**

```bash
npx tsx --test convex/_utils/smartPlaylistFilterModel.test.ts convex/_utils/smartPlaylistGenreMatch.test.ts src/lib/smart-playlists/rule-summary.test.ts src/lib/smart-playlists/duration-slider.test.ts
pnpm typecheck
pnpm check
```

Expected: all PASS / clean.

- [ ] **Step 4: Update idea status**

```yaml
status: planned
```

Add notes bullets linking:

- Spec: `docs/superpowers/specs/2026-07-16-smart-playlist-fields-refactor-design.md`
- Plan: `docs/superpowers/plans/2026-07-16-smart-playlist-fields-refactor.md`

- [ ] **Step 5: Commit**

```bash
git add convex/_utils/smartPlaylistValidators.ts docs/ideas/2026-07-16-refactor-smart-playlist-fields.md
git commit -m "chore(smart-playlists): require v2 filters after migration; mark idea planned"
```

---

## Manual test checklist (after Task 12)

- [ ] New recipe defaults: full rating range, open duration, no genres → preview shows source matches
- [ ] Genre include primary vs secondary vs either behaves as expected; ALL vs ANY
- [ ] Genre exclude removes matching albums; ALL/ANY does not weaken excludes
- [ ] Duplicate genre key cannot add a second row
- [ ] Year picker matches For Later behavior
- [ ] Added presets set last N days; Type/Year/Month aligned; Rankings hides section
- [ ] Exclude from preview reduces count; chip undo restores; Save + Sync now omits excluded albums
- [ ] Existing recipes still load after migration (rule summary + edit form)

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Genre clauses + ALL/ANY includes-only + exclude veto | 2, 4, 9 |
| One row per genreKey | 9 |
| Rating dual slider 1–15, full range no-op | 1, 4, 7, 10 |
| Duration open ends &lt;20 / ≥1:30 | 1, 8, 10 |
| YearRangePicker reuse | 10 |
| Added window keep + alignment + presets | 10 |
| excludedAlbumIds from preview, persist, sync | 4, 11 |
| Migration legacy → v2 | 1, 5, 12 |
| Rule summary | 6 |
| Descriptors / sync pipeline unchanged | (no task — leave alone) |
| Idea → planned | 12 |

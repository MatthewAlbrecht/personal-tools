# For Later Recommendation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a page-level recommendation drawer for `/for-later-albums` that asks one button-radio question at a time and returns seeded-random albums from the full active backlog.

**Architecture:** Put recommendation filtering, bucketing, and seeded random selection in a pure Convex utility so it can be tested with `node:test`. Add two Convex queries: one for shuffled genre/descriptor choices and one for recommendation results. Add a focused drawer component with local wizard state, then wire it into the existing for-later page header.

**Tech Stack:** Next.js App Router, React 19, Convex queries, Vaul drawer via `src/components/ui/drawer.tsx`, node:test via `pnpm exec tsx --test`, Biome, TypeScript.

---

## File Structure

- Create `convex/_utils/forLaterRecommendations.ts`
  - Owns recommendation answer types, count clamping, mutually exclusive added-timeframe matching, release-time buckets, rating tier matching, seeded shuffling, and candidate filtering.
- Create `convex/_utils/forLaterRecommendations.test.ts`
  - Tests every pure recommendation rule before Convex/UI wiring.
- Modify `convex/forLaterAlbums.ts`
  - Adds validators, candidate collection, `listForLaterRecommendationOptions`, and `getForLaterRecommendations`.
- Create `src/app/for-later-albums/_utils/recommendation-state.ts`
  - Owns frontend question definitions, labels, default answers, and answer-summary formatting.
- Create `src/app/for-later-albums/_utils/recommendation-state.test.ts`
  - Tests frontend step advancement and defaults.
- Create `src/lib/hooks/use-for-later-recommendation-drawer.ts`
  - Matches existing drawer hook style with open/close state.
- Create `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx`
  - Renders the right-side drawer, step navigation, button-radio choices, shuffles, recommendation action, and results.
- Modify `src/app/for-later-albums/_components/for-later-header.tsx`
  - Adds a page-level `Recommend` button beside the existing actions menu.
- Modify `src/app/for-later-albums/page.tsx`
  - Owns the recommendation drawer hook and renders the drawer.

No commit steps are included because this environment requires explicit user approval before creating commits.

---

### Task 1: Pure Recommendation Rules

**Files:**
- Create: `convex/_utils/forLaterRecommendations.test.ts`
- Create: `convex/_utils/forLaterRecommendations.ts`

- [ ] **Step 1: Write the failing pure helper tests**

Create `convex/_utils/forLaterRecommendations.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	type ForLaterRecommendationCandidate,
	addedTimeframeMatches,
	candidateMatchesRecommendationAnswers,
	chooseRecommendationRows,
	normalizeRecommendationCount,
	releaseTimeMatches,
	selectRandomTagOptions,
} from "./forLaterRecommendations";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 22);

function candidate(
	overrides: Partial<ForLaterRecommendationCandidate>,
): ForLaterRecommendationCandidate {
	return {
		id: "row-1",
		playlistAddedAt: NOW - 10 * DAY_MS,
		firstSeenAt: NOW - 12 * DAY_MS,
		createdAt: NOW - 14 * DAY_MS,
		releaseYear: 2020,
		filterGenreKeysSorted: [],
		filterDescriptorKeysSorted: [],
		rating: undefined,
		markedAsSingle: undefined,
		removedFromForLater: undefined,
		...overrides,
	};
}

test("normalizeRecommendationCount defaults and clamps to 1 through 5", () => {
	assert.equal(normalizeRecommendationCount(undefined), 1);
	assert.equal(normalizeRecommendationCount(0), 1);
	assert.equal(normalizeRecommendationCount(1), 1);
	assert.equal(normalizeRecommendationCount(5), 5);
	assert.equal(normalizeRecommendationCount(6), 5);
});

test("addedTimeframeMatches uses mutually exclusive buckets", () => {
	assert.equal(
		addedTimeframeMatches(candidate({ playlistAddedAt: NOW - 12 * 60 * 60 * 1000 }), "day", NOW),
		true,
	);
	assert.equal(
		addedTimeframeMatches(candidate({ playlistAddedAt: NOW - 3 * DAY_MS }), "week", NOW),
		true,
	);
	assert.equal(
		addedTimeframeMatches(candidate({ playlistAddedAt: NOW - 12 * DAY_MS }), "week", NOW),
		false,
	);
	assert.equal(
		addedTimeframeMatches(candidate({ playlistAddedAt: NOW - 12 * DAY_MS }), "month", NOW),
		true,
	);
	assert.equal(
		addedTimeframeMatches(candidate({ playlistAddedAt: NOW - 3 * DAY_MS }), "month", NOW),
		false,
	);
	assert.equal(
		addedTimeframeMatches(candidate({ playlistAddedAt: NOW - 45 * DAY_MS }), "two_months", NOW),
		true,
	);
	assert.equal(
		addedTimeframeMatches(candidate({ playlistAddedAt: NOW - 12 * DAY_MS }), "two_months", NOW),
		false,
	);
});

test("addedTimeframeMatches falls back to firstSeenAt then createdAt", () => {
	assert.equal(
		addedTimeframeMatches(
			candidate({
				playlistAddedAt: undefined,
				firstSeenAt: NOW - 3 * DAY_MS,
				createdAt: NOW - 45 * DAY_MS,
			}),
			"week",
			NOW,
		),
		true,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({
				playlistAddedAt: undefined,
				firstSeenAt: undefined,
				createdAt: NOW - 45 * DAY_MS,
			}),
			"two_months",
			NOW,
		),
		true,
	);
});

test("releaseTimeMatches maps years to user-facing buckets", () => {
	assert.equal(releaseTimeMatches(candidate({ releaseYear: 2026 }), "new_release", NOW), true);
	assert.equal(releaseTimeMatches(candidate({ releaseYear: 2025 }), "new_release", NOW), true);
	assert.equal(releaseTimeMatches(candidate({ releaseYear: 2023 }), "recent", NOW), true);
	assert.equal(releaseTimeMatches(candidate({ releaseYear: 2014 }), "modern", NOW), true);
	assert.equal(releaseTimeMatches(candidate({ releaseYear: 2000 }), "old", NOW), true);
	assert.equal(releaseTimeMatches(candidate({ releaseYear: undefined }), "old", NOW), false);
	assert.equal(releaseTimeMatches(candidate({ releaseYear: undefined }), "any", NOW), true);
});

test("candidateMatchesRecommendationAnswers applies genre descriptor and rating filters", () => {
	const row = candidate({
		filterGenreKeysSorted: ["slowcore", "rock"],
		filterDescriptorKeysSorted: ["melancholic"],
		rating: 11,
	});
	assert.equal(
		candidateMatchesRecommendationAnswers(row, {
			addedTimeframe: "any",
			genreKey: "slowcore",
			releaseTime: "any",
			descriptorKey: "melancholic",
			ratingTier: "really_enjoyed",
			count: 1,
		}, NOW),
		true,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(row, {
			addedTimeframe: "any",
			genreKey: "ambient",
			releaseTime: "any",
			descriptorKey: "melancholic",
			ratingTier: "really_enjoyed",
			count: 1,
		}, NOW),
		false,
	);
});

test("candidateMatchesRecommendationAnswers excludes hidden rows and unrated rows for rating tiers", () => {
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ markedAsSingle: true, rating: 15 }),
			{
				addedTimeframe: "any",
				genreKey: "any",
				releaseTime: "any",
				descriptorKey: "any",
				ratingTier: "holy_moly",
				count: 1,
			},
			NOW,
		),
		false,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ removedFromForLater: true, rating: 15 }),
			{
				addedTimeframe: "any",
				genreKey: "any",
				releaseTime: "any",
				descriptorKey: "any",
				ratingTier: "holy_moly",
				count: 1,
			},
			NOW,
		),
		false,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ rating: undefined }),
			{
				addedTimeframe: "any",
				genreKey: "any",
				releaseTime: "any",
				descriptorKey: "any",
				ratingTier: "holy_moly",
				count: 1,
			},
			NOW,
		),
		false,
	);
});

test("chooseRecommendationRows returns seeded results without duplicates", () => {
	const rows = Array.from({ length: 6 }, (_, index) =>
		candidate({ id: `row-${index + 1}` }),
	);
	const first = chooseRecommendationRows(rows, 3, "seed-a");
	const second = chooseRecommendationRows(rows, 3, "seed-a");
	assert.deepEqual(
		first.map((row) => row.id),
		second.map((row) => row.id),
	);
	assert.equal(new Set(first.map((row) => row.id)).size, 3);
	assert.equal(first.length, 3);
});

test("selectRandomTagOptions dedupes keys and keeps counts", () => {
	const options = selectRandomTagOptions(
		[
			{ key: "slowcore", label: "Slowcore" },
			{ key: "slowcore", label: "Slowcore" },
			{ key: "ambient", label: "Ambient" },
		],
		"genres",
		10,
	);
	assert.equal(options.length, 2);
	assert.equal(options.find((option) => option.key === "slowcore")?.count, 2);
});
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

```bash
pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts
```

Expected: fails because `convex/_utils/forLaterRecommendations.ts` does not exist yet.

- [ ] **Step 3: Implement the pure recommendation helper**

Create `convex/_utils/forLaterRecommendations.ts`:

```typescript
export type AddedTimeframeAnswer =
	| "day"
	| "week"
	| "month"
	| "two_months"
	| "any";
export type ReleaseTimeAnswer =
	| "new_release"
	| "recent"
	| "modern"
	| "old"
	| "any";
export type RatingTierAnswer =
	| "holy_moly"
	| "really_enjoyed"
	| "good"
	| "any";

export type ForLaterRecommendationAnswers = {
	addedTimeframe: AddedTimeframeAnswer;
	genreKey: string | "any";
	releaseTime: ReleaseTimeAnswer;
	descriptorKey: string | "any";
	ratingTier: RatingTierAnswer;
	count: number;
};

export type ForLaterRecommendationCandidate = {
	id: string;
	playlistAddedAt?: number;
	firstSeenAt?: number;
	createdAt: number;
	releaseYear?: number;
	filterGenreKeysSorted?: string[];
	filterDescriptorKeysSorted?: string[];
	rating?: number;
	markedAsSingle?: boolean;
	removedFromForLater?: boolean;
};

export type ForLaterRecommendationTagInput = {
	key: string;
	label: string;
};

export type ForLaterRecommendationTagOption = {
	key: string;
	label: string;
	count: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeRecommendationCount(count: number | undefined): number {
	if (count === undefined || !Number.isFinite(count)) {
		return 1;
	}
	return Math.min(5, Math.max(1, Math.floor(count)));
}

export function recommendationAddedAt(
	candidate: ForLaterRecommendationCandidate,
): number {
	return candidate.playlistAddedAt ?? candidate.firstSeenAt ?? candidate.createdAt;
}

export function addedTimeframeMatches(
	candidate: ForLaterRecommendationCandidate,
	answer: AddedTimeframeAnswer,
	now: number,
): boolean {
	if (answer === "any") {
		return true;
	}
	const ageMs = now - recommendationAddedAt(candidate);
	if (ageMs < 0) {
		return false;
	}
	if (answer === "day") {
		return ageMs <= DAY_MS;
	}
	if (answer === "week") {
		return ageMs > DAY_MS && ageMs <= 7 * DAY_MS;
	}
	if (answer === "month") {
		return ageMs > 7 * DAY_MS && ageMs <= 30 * DAY_MS;
	}
	return ageMs > 30 * DAY_MS && ageMs <= 60 * DAY_MS;
}

export function releaseTimeMatches(
	candidate: ForLaterRecommendationCandidate,
	answer: ReleaseTimeAnswer,
	now: number,
): boolean {
	if (answer === "any") {
		return true;
	}
	if (candidate.releaseYear === undefined) {
		return false;
	}
	const currentYear = new Date(now).getUTCFullYear();
	const ageYears = currentYear - candidate.releaseYear;
	if (answer === "new_release") {
		return ageYears >= 0 && ageYears <= 1;
	}
	if (answer === "recent") {
		return ageYears >= 2 && ageYears <= 5;
	}
	if (answer === "modern") {
		return ageYears >= 6 && ageYears <= 20;
	}
	return ageYears > 20;
}

export function ratingTierMatches(
	rating: number | undefined,
	answer: RatingTierAnswer,
): boolean {
	if (answer === "any") {
		return true;
	}
	if (rating === undefined) {
		return false;
	}
	if (answer === "holy_moly") {
		return rating >= 13 && rating <= 15;
	}
	if (answer === "really_enjoyed") {
		return rating >= 10 && rating <= 12;
	}
	return rating >= 7 && rating <= 9;
}

export function candidateMatchesRecommendationAnswers(
	candidate: ForLaterRecommendationCandidate,
	answers: ForLaterRecommendationAnswers,
	now: number,
): boolean {
	if (candidate.markedAsSingle === true || candidate.removedFromForLater === true) {
		return false;
	}
	if (!addedTimeframeMatches(candidate, answers.addedTimeframe, now)) {
		return false;
	}
	if (!releaseTimeMatches(candidate, answers.releaseTime, now)) {
		return false;
	}
	if (!ratingTierMatches(candidate.rating, answers.ratingTier)) {
		return false;
	}
	if (
		answers.genreKey !== "any" &&
		!(candidate.filterGenreKeysSorted ?? []).includes(answers.genreKey)
	) {
		return false;
	}
	if (
		answers.descriptorKey !== "any" &&
		!(candidate.filterDescriptorKeysSorted ?? []).includes(answers.descriptorKey)
	) {
		return false;
	}
	return true;
}

function hashString(input: string): number {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function seededShuffle<T>(
	items: T[],
	seed: string,
	keyForItem: (item: T, index: number) => string,
): T[] {
	return items
		.map((item, index) => ({
			item,
			score: hashString(`${seed}:${keyForItem(item, index)}:${index}`),
		}))
		.sort((a, b) => a.score - b.score)
		.map(({ item }) => item);
}

export function chooseRecommendationRows<T extends { id: string }>(
	rows: T[],
	count: number,
	seed: string,
): T[] {
	const normalizedCount = normalizeRecommendationCount(count);
	return seededShuffle(rows, seed, (row) => row.id).slice(0, normalizedCount);
}

export function selectRandomTagOptions(
	tags: ForLaterRecommendationTagInput[],
	seed: string,
	limit: number,
): ForLaterRecommendationTagOption[] {
	const byKey = new Map<string, ForLaterRecommendationTagOption>();
	for (const tag of tags) {
		const existing = byKey.get(tag.key);
		if (existing) {
			existing.count += 1;
		} else {
			byKey.set(tag.key, { ...tag, count: 1 });
		}
	}
	return seededShuffle([...byKey.values()], seed, (option) => option.key).slice(
		0,
		Math.max(0, limit),
	);
}
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run:

```bash
pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts
```

Expected: all tests in `convex/_utils/forLaterRecommendations.test.ts` pass.

---

### Task 2: Convex Recommendation Queries

**Files:**
- Modify: `convex/forLaterAlbums.ts`

- [ ] **Step 1: Add imports and validators**

Modify the import block in `convex/forLaterAlbums.ts`:

```typescript
import {
	type AddedTimeframeAnswer,
	type ForLaterRecommendationAnswers,
	type ForLaterRecommendationCandidate,
	type ForLaterRecommendationTagInput,
	type RatingTierAnswer,
	type ReleaseTimeAnswer,
	candidateMatchesRecommendationAnswers,
	chooseRecommendationRows,
	normalizeRecommendationCount,
	selectRandomTagOptions,
} from "./_utils/forLaterRecommendations";
```

Add these validators near the existing filter validators:

```typescript
const recommendationAddedTimeframeValidator = v.union(
	v.literal("day"),
	v.literal("week"),
	v.literal("month"),
	v.literal("two_months"),
	v.literal("any"),
);

const recommendationReleaseTimeValidator = v.union(
	v.literal("new_release"),
	v.literal("recent"),
	v.literal("modern"),
	v.literal("old"),
	v.literal("any"),
);

const recommendationRatingTierValidator = v.union(
	v.literal("holy_moly"),
	v.literal("really_enjoyed"),
	v.literal("good"),
	v.literal("any"),
);

const recommendationAnswersValidator = v.object({
	addedTimeframe: recommendationAddedTimeframeValidator,
	genreKey: v.string(),
	releaseTime: recommendationReleaseTimeValidator,
	descriptorKey: v.string(),
	ratingTier: recommendationRatingTierValidator,
	count: v.number(),
});

const recommendationOptionValidator = v.object({
	key: v.string(),
	label: v.string(),
	count: v.number(),
});
```

- [ ] **Step 2: Add candidate collection helpers**

Add below `hydrateForLaterAlbumRow`:

```typescript
const FOR_LATER_RECOMMENDATION_SCAN_LIMIT = 2000;
const FOR_LATER_RECOMMENDATION_OPTION_LIMIT = 10;

type ForLaterRecommendationHydratedCandidate = {
	row: ForLaterAlbumRow;
	candidate: ForLaterRecommendationCandidate;
	genreTags: ForLaterRecommendationTagInput[];
	descriptorTags: ForLaterRecommendationTagInput[];
};

function recommendationCandidateFromRow(
	row: ForLaterAlbumRow,
	item: Doc<"forLaterAlbumItems">,
): ForLaterRecommendationCandidate {
	return {
		id: row.id,
		playlistAddedAt: row.playlistAddedAt,
		firstSeenAt: row.firstSeenAt,
		createdAt: row.createdAt,
		releaseYear: row.releaseYear,
		filterGenreKeysSorted: item.filterGenreKeysSorted,
		filterDescriptorKeysSorted: item.filterDescriptorKeysSorted,
		rating: row.rating,
		markedAsSingle: row.markedAsSingle,
		removedFromForLater: row.removedFromForLater,
	};
}

async function collectForLaterRecommendationCandidates(
	ctx: QueryCtx,
	args: { userId: string },
): Promise<ForLaterRecommendationHydratedCandidate[]> {
	const items = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_isActive_lastSeenAt", (q) =>
			q.eq("userId", args.userId).eq("isActive", true),
		)
		.order("desc")
		.take(FOR_LATER_RECOMMENDATION_SCAN_LIMIT);

	const candidates: ForLaterRecommendationHydratedCandidate[] = [];
	for (const item of items) {
		if (
			item.filterMarkedAsSingle === true ||
			item.filterRemovedFromForLater === true
		) {
			continue;
		}
		const row = await hydrateForLaterAlbumRow(ctx, {
			userId: args.userId,
			item,
		});
		if (!row) {
			continue;
		}
		candidates.push({
			row,
			candidate: recommendationCandidateFromRow(row, item),
			genreTags: [...row.primaryGenres, ...row.secondaryGenres],
			descriptorTags: row.descriptors,
		});
	}
	return candidates;
}
```

- [ ] **Step 3: Add the choice pool query**

Add this export before `listForLaterAlbumRows`:

```typescript
export const listForLaterRecommendationOptions = query({
	args: {
		userId: v.string(),
		genreSeed: v.string(),
		descriptorSeed: v.string(),
	},
	returns: v.object({
		genres: v.array(recommendationOptionValidator),
		descriptors: v.array(recommendationOptionValidator),
	}),
	handler: async (ctx, args): Promise<{
		genres: Array<{ key: string; label: string; count: number }>;
		descriptors: Array<{ key: string; label: string; count: number }>;
	}> => {
		requireAuth(ctx);
		const candidates = await collectForLaterRecommendationCandidates(ctx, {
			userId: args.userId,
		});
		return {
			genres: selectRandomTagOptions(
				candidates.flatMap((candidate) => candidate.genreTags),
				args.genreSeed,
				FOR_LATER_RECOMMENDATION_OPTION_LIMIT,
			),
			descriptors: selectRandomTagOptions(
				candidates.flatMap((candidate) => candidate.descriptorTags),
				args.descriptorSeed,
				FOR_LATER_RECOMMENDATION_OPTION_LIMIT,
			),
		};
	},
});
```

- [ ] **Step 4: Add the recommendation query**

Add this export after `listForLaterRecommendationOptions`:

```typescript
export const getForLaterRecommendations = query({
	args: {
		userId: v.string(),
		answers: recommendationAnswersValidator,
		now: v.number(),
		seed: v.string(),
	},
	returns: v.object({
		rows: v.array(forLaterAlbumRowValidator),
		matchingCount: v.number(),
		requestedCount: v.number(),
		returnedCount: v.number(),
		wasLimitedByPool: v.boolean(),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{
		rows: ForLaterAlbumRow[];
		matchingCount: number;
		requestedCount: number;
		returnedCount: number;
		wasLimitedByPool: boolean;
	}> => {
		requireAuth(ctx);
		const answers: ForLaterRecommendationAnswers = {
			addedTimeframe: args.answers.addedTimeframe as AddedTimeframeAnswer,
			genreKey: args.answers.genreKey.trim() || "any",
			releaseTime: args.answers.releaseTime as ReleaseTimeAnswer,
			descriptorKey: args.answers.descriptorKey.trim() || "any",
			ratingTier: args.answers.ratingTier as RatingTierAnswer,
			count: normalizeRecommendationCount(args.answers.count),
		};
		const candidates = await collectForLaterRecommendationCandidates(ctx, {
			userId: args.userId,
		});
		const matching = candidates.filter(({ candidate }) =>
			candidateMatchesRecommendationAnswers(candidate, answers, args.now),
		);
		const rows = chooseRecommendationRows(
			matching.map(({ row }) => row),
			answers.count,
			args.seed,
		);
		return {
			rows,
			matchingCount: matching.length,
			requestedCount: answers.count,
			returnedCount: rows.length,
			wasLimitedByPool: rows.length < answers.count,
		};
	},
});
```

- [ ] **Step 5: Run focused backend verification**

Run:

```bash
pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts
pnpm typecheck
```

Expected: helper tests pass. `pnpm typecheck` either passes or reports real type errors in the edited files that must be fixed before moving on.

---

### Task 3: Frontend Recommendation State

**Files:**
- Create: `src/app/for-later-albums/_utils/recommendation-state.test.ts`
- Create: `src/app/for-later-albums/_utils/recommendation-state.ts`

- [ ] **Step 1: Write failing frontend state tests**

Create `src/app/for-later-albums/_utils/recommendation-state.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
	QUESTION_ORDER,
	createDefaultRecommendationAnswers,
	nextRecommendationQuestion,
	recommendationAnswerSummary,
} from "./recommendation-state";

test("createDefaultRecommendationAnswers treats every filter as any and count as one", () => {
	assert.deepEqual(createDefaultRecommendationAnswers(), {
		addedTimeframe: "any",
		genreKey: "any",
		releaseTime: "any",
		descriptorKey: "any",
		ratingTier: "any",
		count: 1,
	});
});

test("nextRecommendationQuestion advances until the final question", () => {
	assert.equal(nextRecommendationQuestion("addedTimeframe"), "genre");
	assert.equal(nextRecommendationQuestion("genre"), "releaseTime");
	assert.equal(nextRecommendationQuestion("releaseTime"), "descriptor");
	assert.equal(nextRecommendationQuestion("descriptor"), "rating");
	assert.equal(nextRecommendationQuestion("rating"), "count");
	assert.equal(nextRecommendationQuestion("count"), "count");
});

test("QUESTION_ORDER has the approved question order", () => {
	assert.deepEqual(QUESTION_ORDER, [
		"addedTimeframe",
		"genre",
		"releaseTime",
		"descriptor",
		"rating",
		"count",
	]);
});

test("recommendationAnswerSummary omits unanswered filters but includes count", () => {
	assert.deepEqual(
		recommendationAnswerSummary({
			addedTimeframe: "any",
			genreKey: "slowcore",
			releaseTime: "modern",
			descriptorKey: "any",
			ratingTier: "good",
			count: 3,
		}),
		["Genre: slowcore", "Release: Modern", "Rating: Good", "3 recs"],
	);
});
```

- [ ] **Step 2: Run the state tests and verify they fail**

Run:

```bash
pnpm exec tsx --test src/app/for-later-albums/_utils/recommendation-state.test.ts
```

Expected: fails because `recommendation-state.ts` does not exist yet.

- [ ] **Step 3: Implement frontend recommendation state**

Create `src/app/for-later-albums/_utils/recommendation-state.ts`:

```typescript
export type RecommendationQuestionId =
	| "addedTimeframe"
	| "genre"
	| "releaseTime"
	| "descriptor"
	| "rating"
	| "count";

export type AddedTimeframeAnswer =
	| "day"
	| "week"
	| "month"
	| "two_months"
	| "any";
export type ReleaseTimeAnswer =
	| "new_release"
	| "recent"
	| "modern"
	| "old"
	| "any";
export type RatingTierAnswer =
	| "holy_moly"
	| "really_enjoyed"
	| "good"
	| "any";

export type RecommendationAnswers = {
	addedTimeframe: AddedTimeframeAnswer;
	genreKey: string | "any";
	releaseTime: ReleaseTimeAnswer;
	descriptorKey: string | "any";
	ratingTier: RatingTierAnswer;
	count: number;
};

export type RecommendationOption = {
	key: string;
	label: string;
	count?: number;
};

export const QUESTION_ORDER: RecommendationQuestionId[] = [
	"addedTimeframe",
	"genre",
	"releaseTime",
	"descriptor",
	"rating",
	"count",
];

export const QUESTION_LABELS: Record<RecommendationQuestionId, string> = {
	addedTimeframe: "Added",
	genre: "Genre",
	releaseTime: "Release",
	descriptor: "Descriptors",
	rating: "Rating",
	count: "# of recs",
};

export const ADDED_TIMEFRAME_OPTIONS: Array<{
	value: AddedTimeframeAnswer;
	label: string;
}> = [
	{ value: "day", label: "Day" },
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
	{ value: "two_months", label: "2 months" },
	{ value: "any", label: "Doesn't matter" },
];

export const RELEASE_TIME_OPTIONS: Array<{
	value: ReleaseTimeAnswer;
	label: string;
}> = [
	{ value: "new_release", label: "New release" },
	{ value: "recent", label: "Recent" },
	{ value: "modern", label: "Modern" },
	{ value: "old", label: "Old" },
	{ value: "any", label: "Doesn't matter" },
];

export const RATING_TIER_OPTIONS: Array<{
	value: RatingTierAnswer;
	label: string;
}> = [
	{ value: "holy_moly", label: "Holy Moly" },
	{ value: "really_enjoyed", label: "Really Enjoyed" },
	{ value: "good", label: "Good" },
	{ value: "any", label: "Doesn't matter" },
];

export const RECOMMENDATION_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

export function createDefaultRecommendationAnswers(): RecommendationAnswers {
	return {
		addedTimeframe: "any",
		genreKey: "any",
		releaseTime: "any",
		descriptorKey: "any",
		ratingTier: "any",
		count: 1,
	};
}

export function nextRecommendationQuestion(
	current: RecommendationQuestionId,
): RecommendationQuestionId {
	const currentIndex = QUESTION_ORDER.indexOf(current);
	return QUESTION_ORDER[Math.min(currentIndex + 1, QUESTION_ORDER.length - 1)] ?? "count";
}

function labelForValue<T extends string>(
	options: Array<{ value: T; label: string }>,
	value: T,
): string {
	return options.find((option) => option.value === value)?.label ?? value;
}

export function recommendationAnswerSummary(
	answers: RecommendationAnswers,
): string[] {
	const summary: string[] = [];
	if (answers.addedTimeframe !== "any") {
		summary.push(
			`Added: ${labelForValue(ADDED_TIMEFRAME_OPTIONS, answers.addedTimeframe)}`,
		);
	}
	if (answers.genreKey !== "any") {
		summary.push(`Genre: ${answers.genreKey}`);
	}
	if (answers.releaseTime !== "any") {
		summary.push(
			`Release: ${labelForValue(RELEASE_TIME_OPTIONS, answers.releaseTime)}`,
		);
	}
	if (answers.descriptorKey !== "any") {
		summary.push(`Descriptor: ${answers.descriptorKey}`);
	}
	if (answers.ratingTier !== "any") {
		summary.push(
			`Rating: ${labelForValue(RATING_TIER_OPTIONS, answers.ratingTier)}`,
		);
	}
	summary.push(`${answers.count} rec${answers.count === 1 ? "" : "s"}`);
	return summary;
}
```

- [ ] **Step 4: Run the state tests and verify they pass**

Run:

```bash
pnpm exec tsx --test src/app/for-later-albums/_utils/recommendation-state.test.ts
```

Expected: all tests in `recommendation-state.test.ts` pass.

---

### Task 4: Recommendation Drawer Hook And Component

**Files:**
- Create: `src/lib/hooks/use-for-later-recommendation-drawer.ts`
- Create: `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx`

- [ ] **Step 1: Create the drawer state hook**

Create `src/lib/hooks/use-for-later-recommendation-drawer.ts`:

```typescript
"use client";

import { useState } from "react";

export function useForLaterRecommendationDrawer(): {
	isRecommendationDrawerOpen: boolean;
	openRecommendationDrawer: () => void;
	closeRecommendationDrawer: () => void;
	setRecommendationDrawerOpen: (open: boolean) => void;
} {
	const [isRecommendationDrawerOpen, setRecommendationDrawerOpen] =
		useState(false);

	function openRecommendationDrawer(): void {
		setRecommendationDrawerOpen(true);
	}

	function closeRecommendationDrawer(): void {
		setRecommendationDrawerOpen(false);
	}

	return {
		isRecommendationDrawerOpen,
		openRecommendationDrawer,
		closeRecommendationDrawer,
		setRecommendationDrawerOpen,
	};
}
```

- [ ] **Step 2: Create the drawer component**

Create `src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx` with this structure:

```typescript
"use client";

import { useQuery } from "convex/react";
import { RefreshCw, Shuffle } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { AlbumRatingBadge } from "~/components/album-rating-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { ForLaterAlbumRowData } from "../_utils/types";
import {
	ADDED_TIMEFRAME_OPTIONS,
	QUESTION_LABELS,
	QUESTION_ORDER,
	RECOMMENDATION_COUNT_OPTIONS,
	RELEASE_TIME_OPTIONS,
	RATING_TIER_OPTIONS,
	type RecommendationAnswers,
	type RecommendationOption,
	type RecommendationQuestionId,
	createDefaultRecommendationAnswers,
	nextRecommendationQuestion,
	recommendationAnswerSummary,
} from "../_utils/recommendation-state";

type RecommendationQueryState = {
	seed: string;
	now: number;
} | null;

export function ForLaterRecommendationDrawer({
	userId,
	open,
	onOpenChange,
}: {
	userId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [activeQuestion, setActiveQuestion] =
		useState<RecommendationQuestionId>("addedTimeframe");
	const [answers, setAnswers] = useState<RecommendationAnswers>(() =>
		createDefaultRecommendationAnswers(),
	);
	const [genreSeed, setGenreSeed] = useState("genre-initial");
	const [descriptorSeed, setDescriptorSeed] = useState("descriptor-initial");
	const [recommendationQuery, setRecommendationQuery] =
		useState<RecommendationQueryState>(null);

	const options = useQuery(
		api.forLaterAlbums.listForLaterRecommendationOptions,
		open ? { userId, genreSeed, descriptorSeed } : "skip",
	);

	const recommendations = useQuery(
		api.forLaterAlbums.getForLaterRecommendations,
		open && recommendationQuery
			? {
					userId,
					answers,
					now: recommendationQuery.now,
					seed: recommendationQuery.seed,
				}
			: "skip",
	);

	const summary = useMemo(
		() => recommendationAnswerSummary(answers),
		[answers],
	);

	function selectAnswer(nextAnswers: RecommendationAnswers): void {
		setAnswers(nextAnswers);
		setActiveQuestion(nextRecommendationQuestion(activeQuestion));
	}

	function recommendNow(): void {
		setRecommendationQuery({
			now: Date.now(),
			seed: crypto.randomUUID(),
		});
	}

	function clearAnswers(): void {
		setAnswers(createDefaultRecommendationAnswers());
		setActiveQuestion("addedTimeframe");
		setRecommendationQuery(null);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="flex h-full w-full flex-col sm:max-w-xl">
				<DrawerHeader className="shrink-0 gap-3 border-b pb-4 text-left">
					<div>
						<DrawerTitle>Find something to listen to</DrawerTitle>
						<DrawerDescription>
							Answer any questions you care about, then get random picks from your
							full for-later backlog.
						</DrawerDescription>
					</div>
					<StepNavigation
						activeQuestion={activeQuestion}
						onSelectQuestion={setActiveQuestion}
					/>
					<AnswerSummary summary={summary} />
				</DrawerHeader>

				<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
					<QuestionBody
						activeQuestion={activeQuestion}
						answers={answers}
						genreOptions={options?.genres ?? []}
						descriptorOptions={options?.descriptors ?? []}
						onSelectAnswer={selectAnswer}
						onShuffleGenres={() => setGenreSeed(crypto.randomUUID())}
						onShuffleDescriptors={() => setDescriptorSeed(crypto.randomUUID())}
					/>

					<div className="flex flex-wrap gap-2">
						<Button type="button" onClick={recommendNow}>
							<RefreshCw className="size-4" />
							Recommend now
						</Button>
						<Button type="button" variant="outline" onClick={clearAnswers}>
							Clear answers
						</Button>
					</div>

					<RecommendationResults
						recommendations={recommendations}
						hasRequested={recommendationQuery !== null}
					/>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
```

In the same file, add helper components after `ForLaterRecommendationDrawer`: `StepNavigation`, `AnswerSummary`, `QuestionBody`, `ChoiceButton`, `TaxonomyQuestion`, `RecommendationResults`, and `RecommendationResultCard`.

Use these implementation details:

```typescript
function ChoiceButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant={active ? "default" : "outline"}
			className="justify-start"
			onClick={onClick}
		>
			{children}
		</Button>
	);
}
```

```typescript
function TaxonomyQuestion({
	title,
	emptyMessage,
	options,
	selectedKey,
	onSelect,
	onShuffle,
}: {
	title: string;
	emptyMessage: string;
	options: RecommendationOption[];
	selectedKey: string;
	onSelect: (key: string) => void;
	onShuffle: () => void;
}) {
	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<h3 className="font-semibold text-sm">{title}</h3>
				<Button type="button" variant="ghost" size="sm" onClick={onShuffle}>
					<Shuffle className="size-4" />
					Shuffle
				</Button>
			</div>
			<div className="flex flex-wrap gap-2">
				<ChoiceButton active={selectedKey === "any"} onClick={() => onSelect("any")}>
					Doesn't matter
				</ChoiceButton>
				{options.map((option) => (
					<ChoiceButton
						key={option.key}
						active={selectedKey === option.key}
						onClick={() => onSelect(option.key)}
					>
						{option.label}
					</ChoiceButton>
				))}
			</div>
			{options.length === 0 ? (
				<p className="text-muted-foreground text-sm">{emptyMessage}</p>
			) : null}
		</section>
	);
}
```

For `RecommendationResultCard`, render a compact card instead of reusing `ForLaterRow`:

```typescript
function RecommendationResultCard({ row }: { row: ForLaterAlbumRowData }) {
	return (
		<article className="flex gap-3 rounded-lg border bg-card p-3">
			<div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
				{row.imageUrl ? (
					<Image
						src={row.imageUrl}
						alt={row.name}
						fill
						className="object-cover"
						sizes="56px"
					/>
				) : null}
			</div>
			<div className="min-w-0 flex-1 space-y-2">
				<div>
					<p className="truncate font-medium text-sm">{row.name}</p>
					<p className="truncate text-muted-foreground text-xs">
						{row.artistName}
						{row.releaseYear ? ` · ${row.releaseYear}` : ""}
					</p>
				</div>
				<div className="flex flex-wrap gap-1">
					{row.rating !== undefined ? <AlbumRatingBadge rating={row.rating} /> : null}
					{[...row.primaryGenres, ...row.secondaryGenres, ...row.descriptors]
						.slice(0, 4)
						.map((tag) => (
							<Badge key={`${tag.key}-${tag.label}`} variant="secondary">
								{tag.label}
							</Badge>
						))}
				</div>
			</div>
		</article>
	);
}
```

- [ ] **Step 3: Finish `QuestionBody` and `RecommendationResults`**

Implement `QuestionBody` as a `switch` over `activeQuestion`:

- `addedTimeframe`: map `ADDED_TIMEFRAME_OPTIONS`, update `answers.addedTimeframe`.
- `genre`: render `TaxonomyQuestion`, update `answers.genreKey`.
- `releaseTime`: map `RELEASE_TIME_OPTIONS`, update `answers.releaseTime`.
- `descriptor`: render `TaxonomyQuestion`, update `answers.descriptorKey`.
- `rating`: map `RATING_TIER_OPTIONS`, update `answers.ratingTier`.
- `count`: map `RECOMMENDATION_COUNT_OPTIONS`, update `answers.count`.

Implement `RecommendationResults` with these states:

- `hasRequested === false`: render no results block.
- `hasRequested === true && recommendations === undefined`: render `Finding recommendations...`.
- `recommendations.rows.length === 0`: render `No albums match these answers yet. Clear answers or change one question.`
- `recommendations.wasLimitedByPool === true`: render a small muted line saying only `{returnedCount}` of `{requestedCount}` matching albums were available.
- Otherwise render a list of `RecommendationResultCard`.

- [ ] **Step 4: Run frontend type verification**

Run:

```bash
pnpm typecheck
```

Expected: typecheck either passes or reports errors in the new drawer files that must be fixed before moving on.

---

### Task 5: Wire The Drawer Into The For-Later Page

**Files:**
- Modify: `src/app/for-later-albums/_components/for-later-header.tsx`
- Modify: `src/app/for-later-albums/page.tsx`

- [ ] **Step 1: Modify the header props and render the trigger**

In `src/app/for-later-albums/_components/for-later-header.tsx`, add `Sparkles` to the icon import:

```typescript
import { DatabaseBackup, MoreHorizontal, RefreshCw, Sparkles } from "lucide-react";
```

Add `onOpenRecommendationDrawer` to the component props:

```typescript
export function ForLaterHeader({
	userId,
	spotifyDisplayName,
	isConnected,
	getValidAccessToken,
	summary,
	onOpenRecommendationDrawer,
}: {
	userId: string;
	spotifyDisplayName?: string;
	isConnected: boolean;
	getValidAccessToken: () => Promise<string | null>;
	summary?: ForLaterSummary;
	onOpenRecommendationDrawer: () => void;
}) {
```

Replace the action wrapper with a button plus the existing dropdown:

```tsx
<div className="flex shrink-0 justify-end gap-2">
	<Button
		type="button"
		variant="outline"
		onClick={onOpenRecommendationDrawer}
		disabled={summary !== undefined && summary.activeCount === 0}
	>
		<Sparkles className="size-4" />
		Recommend
	</Button>
	<DropdownMenu>
		{/* existing menu stays unchanged */}
	</DropdownMenu>
</div>
```

- [ ] **Step 2: Wire the hook and drawer into the page**

In `src/app/for-later-albums/page.tsx`, add imports:

```typescript
import { ForLaterRecommendationDrawer } from "./_components/for-later-recommendation-drawer";
import { useForLaterRecommendationDrawer } from "~/lib/hooks/use-for-later-recommendation-drawer";
```

Inside `ForLaterAlbumsPageInner`, add:

```typescript
const {
	isRecommendationDrawerOpen,
	openRecommendationDrawer,
	closeRecommendationDrawer,
	setRecommendationDrawerOpen,
} = useForLaterRecommendationDrawer();
```

Pass the trigger to `ForLaterHeader`:

```tsx
<ForLaterHeader
	userId={userId}
	spotifyDisplayName={connection?.displayName}
	isConnected={isConnected}
	getValidAccessToken={getValidAccessToken}
	summary={summary}
	onOpenRecommendationDrawer={openRecommendationDrawer}
/>
```

Render the drawer near the other drawers:

```tsx
<ForLaterRecommendationDrawer
	userId={userId}
	open={isRecommendationDrawerOpen}
	onOpenChange={(open) => {
		setRecommendationDrawerOpen(open);
		if (!open) closeRecommendationDrawer();
	}}
/>
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts src/app/for-later-albums/_utils/recommendation-state.test.ts
pnpm typecheck
```

Expected: both test files pass. Typecheck passes or reports errors directly tied to the edited files; fix those before continuing.

---

### Task 6: Final Verification And Manual UI Check

**Files:**
- Verify only; edit files only if a check fails because of this feature.

- [ ] **Step 1: Run focused automated checks**

Run:

```bash
pnpm exec tsx --test convex/_utils/forLaterRecommendations.test.ts src/app/for-later-albums/_utils/recommendation-state.test.ts
pnpm typecheck
```

Expected: tests pass and typecheck passes.

- [ ] **Step 2: Run Biome on changed implementation files**

Run:

```bash
pnpm exec biome check convex/_utils/forLaterRecommendations.ts convex/_utils/forLaterRecommendations.test.ts convex/forLaterAlbums.ts src/app/for-later-albums/_utils/recommendation-state.ts src/app/for-later-albums/_utils/recommendation-state.test.ts src/lib/hooks/use-for-later-recommendation-drawer.ts src/app/for-later-albums/_components/for-later-recommendation-drawer.tsx src/app/for-later-albums/_components/for-later-header.tsx src/app/for-later-albums/page.tsx
```

Expected: Biome reports no errors for the changed implementation files. If Biome reports formatting changes, run the same command with `--write` on those exact files and re-run the check command.

- [ ] **Step 3: Manual UI verification**

Run the dev server if it is not already running:

```bash
pnpm dev
```

Open `/for-later-albums` and verify:

- The header has a `Recommend` button.
- Clicking it opens a right-side drawer.
- The drawer starts on `Added`.
- Clicking any answer advances to the next question.
- Clicking any step label jumps to that question without clearing answers.
- Genre and descriptor choices show actual backlog tags when available.
- `Shuffle` changes genre or descriptor choices.
- `Recommend now` works before all questions are answered.
- Recommendations ignore current URL filters.
- Rating choices are only `Holy Moly`, `Really Enjoyed`, `Good`, and `Doesn't matter`.
- Added timeframe choices are mutually exclusive by helper tests.
- Empty/no-match states are readable.

Expected: all checklist items pass in the browser.

---

## Self-Review Notes

- Spec coverage: tasks cover page-level trigger, right drawer, one-question flow, jump navigation, anytime recommendation, shuffled actual backlog metadata, seeded random recommendations, count 1-5, full backlog independence, top rating tiers only, and mutually exclusive added-timeframe buckets.
- Test-first coverage: pure backend recommendation rules and frontend state defaults/step order are tested before implementation.
- Scope: no AI scoring, saved presets, history, dedicated page, or row-level trigger.
- Known verification caveat: previous repo-wide `pnpm check` reported unrelated generated-file and migration lint errors. This plan uses focused Biome checks for changed files plus `pnpm typecheck`.

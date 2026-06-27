import assert from "node:assert/strict";
import test from "node:test";
import {
	type ForLaterRecommendationCandidate,
	addedTimeframeMatches,
	buildSavedRecommendationAlbumRefs,
	buildSubgenreCountsForTopLevel,
	buildTopLevelGenreCounts,
	candidateMatchesRecommendationAnswers,
	chooseRecommendationRows,
	durationBucketMatchesAnswer,
	durationTierMatches,
	normalizeRecommendationCount,
	ratingTierMatches,
	releaseTimeMatches,
	selectRandomTagOptions,
	sortRecommendationTagOptionsByCount,
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
		filterDurationMs: undefined,
		rating: undefined,
		markedAsSingle: undefined,
		removedFromForLater: undefined,
		...overrides,
	};
}

test("normalizeRecommendationCount defaults and clamps to 1 through 5", () => {
	assert.equal(normalizeRecommendationCount(undefined), 1);
	assert.equal(normalizeRecommendationCount(Number.NaN), 1);
	assert.equal(normalizeRecommendationCount(Number.NEGATIVE_INFINITY), 1);
	assert.equal(normalizeRecommendationCount(Number.POSITIVE_INFINITY), 5);
	assert.equal(normalizeRecommendationCount(0), 1);
	assert.equal(normalizeRecommendationCount(1), 1);
	assert.equal(normalizeRecommendationCount(5), 5);
	assert.equal(normalizeRecommendationCount(6), 5);
});

test("addedTimeframeMatches uses mutually exclusive buckets", () => {
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 12 * 60 * 60 * 1000 }),
			"day",
			NOW,
		),
		true,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 3 * DAY_MS }),
			"week",
			NOW,
		),
		true,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 12 * DAY_MS }),
			"week",
			NOW,
		),
		false,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 12 * DAY_MS }),
			"month",
			NOW,
		),
		true,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 3 * DAY_MS }),
			"month",
			NOW,
		),
		false,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 45 * DAY_MS }),
			"two_months",
			NOW,
		),
		true,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 12 * DAY_MS }),
			"two_months",
			NOW,
		),
		false,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 90 * DAY_MS }),
			"older_than_two_months",
			NOW,
		),
		true,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 45 * DAY_MS }),
			"older_than_two_months",
			NOW,
		),
		false,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW - 60 * DAY_MS }),
			"older_than_two_months",
			NOW,
		),
		false,
	);
});

test("addedTimeframeMatches returns true for any and false for future constrained dates", () => {
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW + DAY_MS }),
			"any",
			NOW,
		),
		true,
	);
	assert.equal(
		addedTimeframeMatches(
			candidate({ playlistAddedAt: NOW + DAY_MS }),
			"day",
			NOW,
		),
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
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2026 }), "new_release", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2025 }), "new_release", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2023 }), "recent", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2014 }), "modern", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2000 }), "old", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: undefined }), "old", NOW),
		false,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: undefined }), "any", NOW),
		true,
	);
});

test("releaseTimeMatches includes bucket boundaries and excludes adjacent buckets", () => {
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2026 }), "new_release", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2025 }), "new_release", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2024 }), "new_release", NOW),
		false,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2024 }), "recent", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2021 }), "recent", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2025 }), "recent", NOW),
		false,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2020 }), "modern", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2006 }), "modern", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2021 }), "modern", NOW),
		false,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2005 }), "modern", NOW),
		false,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2005 }), "old", NOW),
		true,
	);
	assert.equal(
		releaseTimeMatches(candidate({ releaseYear: 2006 }), "old", NOW),
		false,
	);
});

test("ratingTierMatches includes boundaries and excludes lower categories", () => {
	assert.equal(ratingTierMatches(13, "holy_moly"), true);
	assert.equal(ratingTierMatches(15, "holy_moly"), true);
	assert.equal(ratingTierMatches(12, "holy_moly"), false);
	assert.equal(ratingTierMatches(10, "really_enjoyed"), true);
	assert.equal(ratingTierMatches(12, "really_enjoyed"), true);
	assert.equal(ratingTierMatches(9, "really_enjoyed"), false);
	assert.equal(ratingTierMatches(13, "really_enjoyed"), false);
	assert.equal(ratingTierMatches(7, "good"), true);
	assert.equal(ratingTierMatches(9, "good"), true);
	assert.equal(ratingTierMatches(6, "good"), false);
	assert.equal(ratingTierMatches(10, "good"), false);

	for (let rating = 1; rating <= 6; rating += 1) {
		assert.equal(ratingTierMatches(rating, "good"), false);
		assert.equal(ratingTierMatches(rating, "really_enjoyed"), false);
		assert.equal(ratingTierMatches(rating, "holy_moly"), false);
	}
});

test("durationBucketMatchesAnswer maps playlist duration to minute buckets", () => {
	const ms = 45 * 60 * 1000;
	assert.equal(durationBucketMatchesAnswer(ms, "40_50"), true);
	assert.equal(durationBucketMatchesAnswer(ms, "50_60"), false);
	assert.equal(durationBucketMatchesAnswer(undefined, "40_50"), false);
	assert.equal(durationBucketMatchesAnswer(undefined, "any"), true);
});

test("durationTierMatches maps playlist duration to short medium and long tiers", () => {
	const shortMs = 30 * 60 * 1000;
	const mediumMs = 45 * 60 * 1000;
	const longMs = 60 * 60 * 1000;

	assert.equal(durationTierMatches(shortMs, "short"), true);
	assert.equal(durationTierMatches(shortMs, "medium"), false);
	assert.equal(durationTierMatches(mediumMs, "medium"), true);
	assert.equal(durationTierMatches(longMs, "long"), true);
	assert.equal(durationTierMatches(35 * 60 * 1000, "medium"), true);
	assert.equal(durationTierMatches(55 * 60 * 1000, "medium"), true);
	assert.equal(durationTierMatches(55 * 60 * 1000 + 1, "long"), true);
	assert.equal(durationTierMatches(undefined, "short"), false);
	assert.equal(durationTierMatches(undefined, "any"), true);
});

test("candidateMatchesRecommendationAnswers applies genre descriptor and rating filters", () => {
	const row = candidate({
		filterGenreKeysSorted: ["slowcore", "rock"],
		filterDescriptorKeysSorted: ["melancholic"],
		rating: 11,
	});
	assert.equal(
		candidateMatchesRecommendationAnswers(
			row,
			{
				addedTimeframe: "any",
				genreKey: "slowcore",
				releaseTime: "any",
				descriptorKey: "melancholic",
				ratingTier: "really_enjoyed",
				durationBucket: "any",
				count: 1,
			},
			NOW,
		),
		true,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			row,
			{
				addedTimeframe: "any",
				genreKey: "ambient",
				releaseTime: "any",
				descriptorKey: "melancholic",
				ratingTier: "really_enjoyed",
				durationBucket: "any",
				count: 1,
			},
			NOW,
		),
		false,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			row,
			{
				addedTimeframe: "any",
				genreKey: "slowcore",
				releaseTime: "any",
				descriptorKey: "warm",
				ratingTier: "really_enjoyed",
				durationBucket: "any",
				count: 1,
			},
			NOW,
		),
		false,
	);
});

test("candidateMatchesRecommendationAnswers applies duration bucket filter", () => {
	const row = candidate({
		filterDurationMs: 40 * 60 * 1000,
	});
	assert.equal(
		candidateMatchesRecommendationAnswers(
			row,
			{
				addedTimeframe: "any",
				genreKey: "any",
				releaseTime: "any",
				descriptorKey: "any",
				ratingTier: "any",
				durationBucket: "40_50",
				count: 1,
			},
			NOW,
		),
		true,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			row,
			{
				addedTimeframe: "any",
				genreKey: "any",
				releaseTime: "any",
				descriptorKey: "any",
				ratingTier: "any",
				durationBucket: "30_40",
				count: 1,
			},
			NOW,
		),
		false,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ filterDurationMs: undefined }),
			{
				addedTimeframe: "any",
				genreKey: "any",
				releaseTime: "any",
				descriptorKey: "any",
				ratingTier: "any",
				durationBucket: "30_40",
				count: 1,
			},
			NOW,
		),
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
				durationBucket: "any",
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
				durationBucket: "any",
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
				durationBucket: "any",
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
			{ key: "slowcore", label: "Slowcore Alternate" },
			{ key: "ambient", label: "Ambient" },
		],
		"genres",
		10,
	);
	assert.equal(options.length, 2);
	assert.equal(options.find((option) => option.key === "slowcore")?.count, 2);
	assert.equal(
		options.find((option) => option.key === "slowcore")?.label,
		"Slowcore",
	);
});

test("selectRandomTagOptions is deterministic and applies limit", () => {
	const tags = [
		{ key: "slowcore", label: "Slowcore" },
		{ key: "ambient", label: "Ambient" },
		{ key: "shoegaze", label: "Shoegaze" },
		{ key: "folk", label: "Folk" },
	];
	const first = selectRandomTagOptions(tags, "genres", 2);
	const second = selectRandomTagOptions(tags, "genres", 2);

	assert.deepEqual(first, second);
	assert.equal(first.length, 2);
});

test("buildSavedRecommendationAlbumRefs stores chosen album identifiers", () => {
	assert.deepEqual(
		buildSavedRecommendationAlbumRefs([
			{
				albumItemId: "item-1",
				albumId: "album-1",
				spotifyAlbumId: "spotify-1",
			},
			{
				albumItemId: "item-2",
				albumId: "album-2",
				spotifyAlbumId: "spotify-2",
			},
		]),
		{
			albumItemIds: ["item-1", "item-2"],
			albumIds: ["album-1", "album-2"],
			spotifyAlbumIds: ["spotify-1", "spotify-2"],
		},
	);
});

test("buildTopLevelGenreCounts rolls primary genres up to top-level buckets", () => {
	const parentKeysByChild = new Map<string, string[]>([
		["acoustic blues", ["blues"]],
		["acoustic texas blues", ["acoustic blues"]],
	]);
	const topLevelGenreKeys = new Set(["blues", "ambient"]);

	const counts = buildTopLevelGenreCounts({
		albumPrimaryGenreKeys: [
			["acoustic texas blues"],
			["blues"],
			["ambient"],
			["acoustic texas blues", "ambient"],
		],
		topLevelGenreKeys,
		parentKeysByChild,
	});

	assert.equal(counts.get("blues"), 3);
	assert.equal(counts.get("ambient"), 2);
});

test("buildTopLevelGenreCounts counts albums from filterGenreKeysSorted ancestor expansion", () => {
	const parentKeysByChild = new Map<string, string[]>([["bebop", ["jazz"]]]);
	const topLevelGenreKeys = new Set(["jazz", "rock"]);

	const counts = buildTopLevelGenreCounts({
		albumPrimaryGenreKeys: [["bebop", "jazz"], ["rock"], ["jazz"]],
		topLevelGenreKeys,
		parentKeysByChild,
	});

	assert.equal(counts.get("jazz"), 2);
	assert.equal(counts.get("rock"), 1);
});

test("buildSubgenreCountsForTopLevel counts attached tags and limits results", () => {
	const descendantGenreKeys = new Set([
		"blues",
		"acoustic blues",
		"acoustic texas blues",
		"country blues",
	]);

	const options = buildSubgenreCountsForTopLevel({
		albumAllGenreKeys: [
			["acoustic texas blues", "country blues"],
			["acoustic blues", "acoustic texas blues"],
			["blues"],
		],
		topLevelGenreKey: "blues",
		descendantGenreKeys,
		limit: 2,
	});

	assert.deepEqual(options, [
		{ key: "acoustic texas blues", label: "acoustic texas blues", count: 2 },
		{ key: "acoustic blues", label: "acoustic blues", count: 1 },
	]);
});

test("sortRecommendationTagOptionsByCount orders by count descending", () => {
	assert.deepEqual(
		sortRecommendationTagOptionsByCount([
			{ key: "ambient", label: "Ambient", count: 2 },
			{ key: "blues", label: "Blues", count: 5 },
			{ key: "folk", label: "Folk", count: 5 },
		]),
		[
			{ key: "blues", label: "Blues", count: 5 },
			{ key: "folk", label: "Folk", count: 5 },
			{ key: "ambient", label: "Ambient", count: 2 },
		],
	);
});

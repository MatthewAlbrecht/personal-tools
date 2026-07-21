import assert from "node:assert/strict";
import test from "node:test";
import {
	type ForLaterRecommendationAnswers,
	type ForLaterRecommendationCandidate,
	addedDaysRangeMatches,
	buildSavedRecommendationAlbumRefs,
	buildSubgenreCountsForTopLevel,
	buildTopLevelGenreCounts,
	candidateMatchesRecommendationAnswers,
	chooseRecommendationRows,
	genreKeysMatch,
	getAddedDaysMax,
	listenedMatches,
	normalizeRecommendationCount,
	normalizeRecommendationPoolSize,
	selectRandomTagOptions,
	sortRecommendationTagOptionsByCount,
	yearRangeMatches,
} from "./forLaterRecommendations";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const NOW = Date.UTC(2026, 5, 22);

function candidate(
	overrides: Partial<ForLaterRecommendationCandidate> = {},
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
		hasListened: false,
		markedAsSingle: undefined,
		removedFromForLater: undefined,
		...overrides,
	};
}

function defaultAnswers(
	overrides: Partial<ForLaterRecommendationAnswers> = {},
): ForLaterRecommendationAnswers {
	return {
		addedDaysMin: 0,
		addedDaysMax: getAddedDaysMax(NOW),
		durationMinMs: 0,
		durationMaxMs: 120 * MINUTE_MS,
		ratingMin: 1,
		ratingMax: 15,
		listened: "any",
		genreKeys: [],
		genreMatch: "any",
		count: 1,
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

test("normalizeRecommendationPoolSize defaults and clamps to 1 through 10", () => {
	assert.equal(normalizeRecommendationPoolSize(undefined), 10);
	assert.equal(normalizeRecommendationPoolSize(0), 1);
	assert.equal(normalizeRecommendationPoolSize(10), 10);
	assert.equal(normalizeRecommendationPoolSize(11), 10);
});

test("full-span ranges and empty genres do not filter", () => {
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({
				playlistAddedAt: NOW - 10 * DAY_MS,
				releaseYear: 1999,
				filterDurationMs: 45 * MINUTE_MS,
				rating: undefined,
				hasListened: false,
				filterGenreKeysSorted: ["ambient"],
			}),
			defaultAnswers(),
			NOW,
		),
		true,
	);
});

test("addedDaysRangeMatches inclusive day-age window", () => {
	assert.equal(
		addedDaysRangeMatches(
			candidate({ playlistAddedAt: NOW - 3 * DAY_MS }),
			2,
			7,
			NOW,
		),
		true,
	);
	assert.equal(
		addedDaysRangeMatches(
			candidate({ playlistAddedAt: NOW - 1 * DAY_MS }),
			2,
			7,
			NOW,
		),
		false,
	);
});

test("yearRangeMatches respects min/max and missing year", () => {
	assert.equal(
		yearRangeMatches(candidate({ releaseYear: 1971 }), 1970, 1979),
		true,
	);
	assert.equal(
		yearRangeMatches(candidate({ releaseYear: undefined }), 1970, 1979),
		false,
	);
	assert.equal(
		yearRangeMatches(candidate({ releaseYear: 1980 }), undefined, undefined),
		true,
	);
});

test("listenedMatches heard / not_yet / any", () => {
	assert.equal(listenedMatches(true, "heard"), true);
	assert.equal(listenedMatches(false, "heard"), false);
	assert.equal(listenedMatches(false, "not_yet"), true);
	assert.equal(listenedMatches(true, "not_yet"), false);
	assert.equal(listenedMatches(false, "any"), true);
});

test("genreKeysMatch OR and AND against filterGenreKeysSorted", () => {
	const keys = ["ambient", "electronic", "drone"];
	assert.equal(genreKeysMatch(keys, ["ambient", "jazz"], "any"), true);
	assert.equal(genreKeysMatch(keys, ["ambient", "jazz"], "all"), false);
	assert.equal(genreKeysMatch(keys, ["ambient", "drone"], "all"), true);
	assert.equal(genreKeysMatch(keys, [], "all"), true);
});

test("constrained rating applies only when listened is heard", () => {
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ rating: undefined, hasListened: true }),
			defaultAnswers({
				ratingMin: 10,
				ratingMax: 15,
				listened: "heard",
			}),
			NOW,
		),
		false,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ rating: 12, hasListened: true }),
			defaultAnswers({ ratingMin: 10, ratingMax: 15, listened: "heard" }),
			NOW,
		),
		true,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ rating: undefined, hasListened: false }),
			defaultAnswers({ ratingMin: 10, ratingMax: 15, listened: "not_yet" }),
			NOW,
		),
		true,
	);
});

test("candidateMatchesRecommendationAnswers excludes hidden rows", () => {
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ markedAsSingle: true, rating: 15 }),
			defaultAnswers(),
			NOW,
		),
		false,
	);
	assert.equal(
		candidateMatchesRecommendationAnswers(
			candidate({ removedFromForLater: true, rating: 15 }),
			defaultAnswers(),
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

test("chooseRecommendationRows can return a pool of up to 10", () => {
	const rows = Array.from({ length: 20 }, (_, index) =>
		candidate({ id: `row-${index + 1}` }),
	);
	const pool = chooseRecommendationRows(rows, 10, "seed-pool");
	assert.equal(pool.length, 10);
	assert.equal(new Set(pool.map((row) => row.id)).size, 10);
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
				albumId: "album-1",
				spotifyAlbumId: "spotify-1",
			},
			{
				albumId: "album-2",
				spotifyAlbumId: "spotify-2",
			},
		]),
		{
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

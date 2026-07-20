import assert from "node:assert/strict";
import test from "node:test";
import {
	type ForLaterAlbumRowFilterInput,
	deriveRymStatus,
	normalizeForLaterFilters,
	releaseYearMatchesForLaterFilter,
	rowMatchesFilters,
	sortForLaterRows,
} from "./forLaterAlbumsUi";

test("normalizeForLaterFilters applies defaults", () => {
	const filters = normalizeForLaterFilters({});

	assert.deepEqual(filters, {
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		yearMin: undefined,
		yearMax: undefined,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
		durationBucketKey: undefined,
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});
});

test("normalizeForLaterFilters maps legacy filterMatch to both taxonomy modes", () => {
	assert.deepEqual(
		normalizeForLaterFilters({ filterMatch: "any" }),
		normalizeForLaterFilters({ genreMatch: "any", descriptorMatch: "any" }),
	);
});

test("normalizeForLaterFilters dedupes and sorts genre and descriptor keys", () => {
	const filters = normalizeForLaterFilters({
		genreKeys: ["  b ", "a", "b", "a"],
		descriptorKeys: ["x", "x", "y"],
	});

	assert.deepEqual(filters.genreKeys, ["a", "b"]);
	assert.deepEqual(filters.descriptorKeys, ["x", "y"]);
});

test("normalizeForLaterFilters lowercases taxonomy keys", () => {
	const filters = normalizeForLaterFilters({
		genreKeys: ["Ambient", " ambient ", "Rock"],
		descriptorKeys: ["Melancholic"],
	});

	assert.deepEqual(filters.genreKeys, ["ambient", "rock"]);
	assert.deepEqual(filters.descriptorKeys, ["melancholic"]);
});

test("rowMatchesFilters matches parent genre via filterGenreKeysSorted", () => {
	const row = {
		name: "Album",
		artistName: "Artist",
		hasListened: false,
		rymStatus: "matched" as const,
		primaryGenres: [{ key: "acoustic blues" }],
		secondaryGenres: [],
		descriptors: [],
		filterGenreKeysSorted: ["acoustic blues", "blues"],
	};
	const filters = normalizeForLaterFilters({ genreKeys: ["blues"] });

	assert.equal(rowMatchesFilters(row, filters), true);
});

test("rowMatchesFilters matches genre in secondary only", () => {
	const row: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "matched",
		primaryGenres: [],
		secondaryGenres: [{ key: "slowcore" }],
		descriptors: [],
	};
	const filters = normalizeForLaterFilters({ genreKeys: ["slowcore"] });
	assert.equal(rowMatchesFilters(row, filters), true);
});

test("rowMatchesFilters matches genre in primary or secondary union", () => {
	const row: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "matched",
		primaryGenres: [{ key: "ambient" }],
		secondaryGenres: [{ key: "electronic" }],
		descriptors: [],
	};
	assert.equal(
		rowMatchesFilters(
			row,
			normalizeForLaterFilters({ genreKeys: ["ambient"] }),
		),
		true,
	);
	assert.equal(
		rowMatchesFilters(
			row,
			normalizeForLaterFilters({ genreKeys: ["electronic"] }),
		),
		true,
	);
	assert.equal(
		rowMatchesFilters(
			row,
			normalizeForLaterFilters({ genreKeys: ["ambient", "electronic"] }),
		),
		true,
	);
	assert.equal(
		rowMatchesFilters(row, normalizeForLaterFilters({ genreKeys: ["jazz"] })),
		false,
	);
});

test("rowMatchesFilters excludes not-on-RYM rows from scrape filters", () => {
	const row: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "unmatched",
		rymNotOnSite: true,
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
	};
	assert.equal(
		rowMatchesFilters(row, normalizeForLaterFilters({ rymStatus: "all" })),
		true,
	);
	assert.equal(
		rowMatchesFilters(
			row,
			normalizeForLaterFilters({ rymStatus: "no_scrape" }),
		),
		false,
	);
});

test("rowMatchesFilters excludes marked-as-single rows", () => {
	const single: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "unmatched",
		markedAsSingle: true,
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
	};
	const album: ForLaterAlbumRowFilterInput = {
		...single,
		markedAsSingle: undefined,
	};
	const filters = normalizeForLaterFilters({});
	assert.equal(rowMatchesFilters(single, filters), false);
	assert.equal(rowMatchesFilters(album, filters), true);
});

test("rowMatchesFilters excludes removed-from-for-later rows", () => {
	const removed: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "unmatched",
		removedFromForLater: true,
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
	};
	const visible: ForLaterAlbumRowFilterInput = {
		...removed,
		removedFromForLater: undefined,
	};
	const filters = normalizeForLaterFilters({});
	assert.equal(rowMatchesFilters(removed, filters), false);
	assert.equal(rowMatchesFilters(visible, filters), true);
});

test("rowMatchesFilters not_on_rym shows only not-on-RYM rows", () => {
	const notOnRym: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "unmatched",
		rymNotOnSite: true,
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
	};
	const onRym: ForLaterAlbumRowFilterInput = {
		...notOnRym,
		rymNotOnSite: false,
	};
	const filters = normalizeForLaterFilters({ rymStatus: "not_on_rym" });
	assert.equal(rowMatchesFilters(notOnRym, filters), true);
	assert.equal(rowMatchesFilters(onRym, filters), false);
});

test("deriveRymStatus is matched when a scrape is linked", () => {
	assert.equal(
		deriveRymStatus({
			rymScrapeId: "scrape_1",
		}),
		"matched",
	);
});

test("deriveRymStatus is unmatched without a scrape", () => {
	assert.equal(deriveRymStatus({ rymScrapeId: undefined }), "unmatched");
});

test("releaseYearMatchesForLaterFilter uses inclusive gte and lte bounds", () => {
	const filters = normalizeForLaterFilters({ yearMin: 1970, yearMax: 1979 });
	assert.equal(releaseYearMatchesForLaterFilter(1969, filters), false);
	assert.equal(releaseYearMatchesForLaterFilter(1970, filters), true);
	assert.equal(releaseYearMatchesForLaterFilter(1979, filters), true);
	assert.equal(releaseYearMatchesForLaterFilter(1980, filters), false);
	assert.equal(releaseYearMatchesForLaterFilter(undefined, filters), false);
});

test("rowMatchesFilters applies year range on releaseYear", () => {
	const row: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		releaseYear: 1975,
		hasListened: false,
		rymStatus: "matched",
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
	};
	const inRange = normalizeForLaterFilters({ yearMin: 1970, yearMax: 1979 });
	const outOfRange = normalizeForLaterFilters({ yearMin: 1980, yearMax: 1989 });
	assert.equal(rowMatchesFilters(row, inRange), true);
	assert.equal(rowMatchesFilters(row, outOfRange), false);
});

test("rowMatchesFilters applies duration range on durationMs", () => {
	const row: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "matched",
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
		durationMs: 40 * 60 * 1000,
	};
	const inRange = normalizeForLaterFilters({
		durationMinMinutes: 35,
		durationMaxMinutes: 55,
	});
	const outOfRange = normalizeForLaterFilters({
		durationMinMinutes: 56,
		durationMaxMinutes: 90,
	});
	assert.equal(rowMatchesFilters(row, inRange), true);
	assert.equal(rowMatchesFilters(row, outOfRange), false);
});

test("rowMatchesFilters applies duration bucket on durationMs", () => {
	const row: ForLaterAlbumRowFilterInput = {
		name: "x",
		artistName: "y",
		hasListened: false,
		rymStatus: "matched",
		primaryGenres: [],
		secondaryGenres: [],
		descriptors: [],
		durationMs: 45 * 60 * 1000,
	};
	const matchingBucket = normalizeForLaterFilters({ durationBucketKey: "40_50" });
	const otherBucket = normalizeForLaterFilters({ durationBucketKey: "50_60" });
	assert.equal(rowMatchesFilters(row, matchingBucket), true);
	assert.equal(rowMatchesFilters(row, otherBucket), false);
});

test("sortForLaterRows orders lastSeenAt, playlistAddedAt, then createdAt descending", () => {
	const rows = [
		{ id: "old", lastSeenAt: 10, playlistAddedAt: 100, createdAt: 1000 },
		{
			id: "new-created",
			lastSeenAt: 20,
			playlistAddedAt: 200,
			createdAt: 3000,
		},
		{
			id: "new-playlist",
			lastSeenAt: 20,
			playlistAddedAt: 300,
			createdAt: 2000,
		},
	];

	assert.deepEqual(
		sortForLaterRows(rows).map((row) => row.id),
		["new-playlist", "new-created", "old"],
	);
});

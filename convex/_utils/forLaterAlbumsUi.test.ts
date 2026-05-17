import assert from "node:assert/strict";
import test from "node:test";
import {
	type ForLaterAlbumRowFilterInput,
	deriveRymStatus,
	forLaterFiltersAllowIndexedScan,
	normalizeForLaterFilters,
	rowMatchesFilters,
	sortForLaterRows,
} from "./forLaterAlbumsUi";

test("normalizeForLaterFilters applies defaults", () => {
	const filters = normalizeForLaterFilters({});

	assert.deepEqual(filters, {
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		filterMatch: "all",
	});
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

test("forLaterFiltersAllowIndexedScan allows default residual-only filters", () => {
	assert.equal(
		forLaterFiltersAllowIndexedScan(normalizeForLaterFilters({})),
		true,
	);
	assert.equal(
		forLaterFiltersAllowIndexedScan(
			normalizeForLaterFilters({
				year: 1999,
				listened: "listened",
				rymStatus: "has_scrape",
			}),
		),
		true,
	);
});

test("forLaterFiltersAllowIndexedScan rejects genre, descriptor, search, or any-match", () => {
	assert.equal(
		forLaterFiltersAllowIndexedScan(
			normalizeForLaterFilters({ genreKeys: ["ambient"] }),
		),
		false,
	);
	assert.equal(
		forLaterFiltersAllowIndexedScan(
			normalizeForLaterFilters({ descriptorKeys: ["melodic"] }),
		),
		false,
	);
	assert.equal(
		forLaterFiltersAllowIndexedScan(
			normalizeForLaterFilters({ search: "  hello " }),
		),
		false,
	);
	assert.equal(
		forLaterFiltersAllowIndexedScan(
			normalizeForLaterFilters({ filterMatch: "any" }),
		),
		false,
	);
});

test("forLaterFiltersAllowIndexedScan allows whitespace-only search", () => {
	assert.equal(
		forLaterFiltersAllowIndexedScan(
			normalizeForLaterFilters({ search: "   " }),
		),
		true,
	);
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

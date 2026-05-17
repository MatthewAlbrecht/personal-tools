import assert from "node:assert/strict";
import test from "node:test";
import {
	FOR_LATER_POST_FILTER_SCAN_CAP,
	type ForLaterAlbumRowFilterInput,
	deriveRymStatus,
	forLaterFiltersAllowDescriptorFacetPagination,
	forLaterFiltersAllowGenreFacetPagination,
	forLaterFiltersAllowIndexedScan,
	forLaterPostFilterScanSize,
	normalizeForLaterFilters,
	rowMatchesFilters,
	sortForLaterRows,
} from "./forLaterAlbumsUi";

test("forLaterPostFilterScanSize overscans before in-memory filters", () => {
	assert.equal(forLaterPostFilterScanSize(25), 1000);
	assert.equal(forLaterPostFilterScanSize(30), FOR_LATER_POST_FILTER_SCAN_CAP);
	assert.equal(forLaterPostFilterScanSize(1), 120);
});

test("normalizeForLaterFilters applies defaults", () => {
	const filters = normalizeForLaterFilters({});

	assert.deepEqual(filters, {
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		year: undefined,
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

test("forLaterFiltersAllowIndexedScan rejects genre, descriptor, or search", () => {
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
			normalizeForLaterFilters({ genreMatch: "any" }),
		),
		true,
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

test("forLaterFiltersAllowGenreFacetPagination allows genre with ALL and extra facets", () => {
	assert.equal(
		forLaterFiltersAllowGenreFacetPagination(
			normalizeForLaterFilters({
				genreKeys: ["rock"],
				year: 1999,
				genreMatch: "all",
			}),
		),
		true,
	);
});

test("forLaterFiltersAllowGenreFacetPagination rejects search", () => {
	assert.equal(
		forLaterFiltersAllowGenreFacetPagination(
			normalizeForLaterFilters({ genreKeys: ["rock"], search: "x" }),
		),
		false,
	);
});

test("forLaterFiltersAllowGenreFacetPagination allows genre ANY with year and other facets (core AND)", () => {
	assert.equal(
		forLaterFiltersAllowGenreFacetPagination(
			normalizeForLaterFilters({
				genreKeys: ["rock"],
				year: 1999,
				genreMatch: "any",
				descriptorKeys: ["melodic"],
				descriptorMatch: "all",
			}),
		),
		true,
	);
});

test("forLaterFiltersAllowGenreFacetPagination rejects ANY with multiple genre keys", () => {
	assert.equal(
		forLaterFiltersAllowGenreFacetPagination(
			normalizeForLaterFilters({
				genreKeys: ["rock", "jazz"],
				genreMatch: "any",
			}),
		),
		false,
	);
});

test("forLaterFiltersAllowGenreFacetPagination allows ALL with multiple genre keys", () => {
	assert.equal(
		forLaterFiltersAllowGenreFacetPagination(
			normalizeForLaterFilters({
				genreKeys: ["rock", "jazz"],
				genreMatch: "all",
			}),
		),
		true,
	);
});

test("forLaterFiltersAllowDescriptorFacetPagination allows descriptor with ALL and core facets", () => {
	assert.equal(
		forLaterFiltersAllowDescriptorFacetPagination(
			normalizeForLaterFilters({
				descriptorKeys: ["melodic"],
				year: 1999,
				descriptorMatch: "all",
			}),
		),
		true,
	);
});

test("forLaterFiltersAllowDescriptorFacetPagination rejects search", () => {
	assert.equal(
		forLaterFiltersAllowDescriptorFacetPagination(
			normalizeForLaterFilters({
				descriptorKeys: ["sparse"],
				search: "x",
			}),
		),
		false,
	);
});

test("forLaterFiltersAllowDescriptorFacetPagination rejects ANY with multiple descriptor keys", () => {
	assert.equal(
		forLaterFiltersAllowDescriptorFacetPagination(
			normalizeForLaterFilters({
				descriptorKeys: ["a", "b"],
				descriptorMatch: "any",
			}),
		),
		false,
	);
});

test("forLaterFiltersAllowDescriptorFacetPagination allows when genre facet cannot (multi-genre ANY)", () => {
	assert.equal(
		forLaterFiltersAllowDescriptorFacetPagination(
			normalizeForLaterFilters({
				genreKeys: ["rock", "jazz"],
				genreMatch: "any",
				descriptorKeys: ["melodic"],
				descriptorMatch: "all",
			}),
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

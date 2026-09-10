import assert from "node:assert/strict";
import test from "node:test";
import {
	computeListenFilterFields,
	listenFilterFieldsNeedPatch,
} from "./albumListenDenormalized";
import {
	chooseListenFilterIndex,
	listenFilterNeedsPostFilter,
	listenMatchesAlbumListenFilters,
	listenMatchesDenormalizedFilters,
	listenMatchesFirstListenFilter,
	listenMatchesReleaseYearFilter,
	listenMatchesUnrankedFilter,
	listensFiltersAreActive,
	parseListenReleaseYear,
} from "./albumListenFilters";

test("listensFiltersAreActive detects any constraint", () => {
	assert.equal(
		listensFiltersAreActive({
			onlyUnranked: false,
			onlyFirstListens: false,
		}),
		false,
	);
	assert.equal(
		listensFiltersAreActive({
			onlyUnranked: true,
			onlyFirstListens: false,
		}),
		true,
	);
	assert.equal(
		listensFiltersAreActive({
			onlyUnranked: false,
			onlyFirstListens: false,
			yearMin: 1970,
		}),
		true,
	);
});

test("parseListenReleaseYear reads leading year", () => {
	assert.equal(parseListenReleaseYear("1975-06-01"), 1975);
	assert.equal(parseListenReleaseYear("1999"), 1999);
	assert.equal(parseListenReleaseYear(undefined), undefined);
	assert.equal(parseListenReleaseYear("abcd"), undefined);
});

test("unranked filter keeps unrated albums only when enabled", () => {
	assert.equal(listenMatchesUnrankedFilter(12, false), true);
	assert.equal(listenMatchesUnrankedFilter(12, true), false);
	assert.equal(listenMatchesUnrankedFilter(undefined, true), true);
});

test("first-listen filter requires listenedAt === firstListenedAt", () => {
	assert.equal(listenMatchesFirstListenFilter(100, 100, true), true);
	assert.equal(listenMatchesFirstListenFilter(200, 100, true), false);
	assert.equal(listenMatchesFirstListenFilter(100, undefined, true), false);
	assert.equal(listenMatchesFirstListenFilter(200, 100, false), true);
});

test("release year range is inclusive and drops missing years", () => {
	assert.equal(listenMatchesReleaseYearFilter("1975-01-01", 1970, 1979), true);
	assert.equal(listenMatchesReleaseYearFilter("1969-01-01", 1970, 1979), false);
	assert.equal(listenMatchesReleaseYearFilter("1981-01-01", 1970, 1979), false);
	assert.equal(listenMatchesReleaseYearFilter(undefined, 1970, 1979), false);
	assert.equal(
		listenMatchesReleaseYearFilter("1975-01-01", undefined, undefined),
		true,
	);
});

test("listenMatchesAlbumListenFilters composes all predicates", () => {
	const listen = { listenedAt: 100 };
	const userAlbum = { rating: undefined, firstListenedAt: 100 };
	const album = { releaseDate: "1975-06-01" };

	assert.equal(
		listenMatchesAlbumListenFilters(listen, userAlbum, album, {
			onlyUnranked: true,
			onlyFirstListens: true,
			yearMin: 1970,
			yearMax: 1979,
		}),
		true,
	);
	assert.equal(
		listenMatchesAlbumListenFilters(
			listen,
			{ rating: 8, firstListenedAt: 100 },
			album,
			{
				onlyUnranked: true,
				onlyFirstListens: true,
				yearMin: 1970,
				yearMax: 1979,
			},
		),
		false,
	);
});

test("chooseListenFilterIndex prefers first listen then unranked then exact year", () => {
	assert.deepEqual(
		chooseListenFilterIndex({
			onlyUnranked: true,
			onlyFirstListens: true,
			yearMin: 1975,
			yearMax: 1975,
		}),
		{ kind: "firstListen" },
	);
	assert.deepEqual(
		chooseListenFilterIndex({
			onlyUnranked: true,
			onlyFirstListens: false,
		}),
		{ kind: "unranked" },
	);
	assert.deepEqual(
		chooseListenFilterIndex({
			onlyUnranked: false,
			onlyFirstListens: false,
			yearMin: 1975,
			yearMax: 1975,
		}),
		{ kind: "releaseYear", year: 1975 },
	);
	assert.deepEqual(
		chooseListenFilterIndex({
			onlyUnranked: false,
			onlyFirstListens: false,
			yearMin: 1970,
			yearMax: 1979,
		}),
		{ kind: "listenedAt" },
	);
});

test("listenFilterNeedsPostFilter only for uncovered constraints", () => {
	assert.equal(
		listenFilterNeedsPostFilter(
			{ onlyUnranked: false, onlyFirstListens: true },
			{ kind: "firstListen" },
		),
		false,
	);
	assert.equal(
		listenFilterNeedsPostFilter(
			{
				onlyUnranked: true,
				onlyFirstListens: true,
				yearMin: 1970,
				yearMax: 1979,
			},
			{ kind: "firstListen" },
		),
		true,
	);
	assert.equal(
		listenFilterNeedsPostFilter(
			{ onlyUnranked: true, onlyFirstListens: false },
			{ kind: "unranked" },
		),
		false,
	);
});

test("listenMatchesDenormalizedFilters uses row fields without joins", () => {
	assert.equal(
		listenMatchesDenormalizedFilters(
			{ isFirstListen: true, hasRating: false, releaseYear: 1975 },
			{
				onlyUnranked: true,
				onlyFirstListens: true,
				yearMin: 1970,
				yearMax: 1979,
			},
		),
		true,
	);
	assert.equal(
		listenMatchesDenormalizedFilters(
			{ isFirstListen: true, hasRating: true, releaseYear: 1975 },
			{ onlyUnranked: true, onlyFirstListens: true },
		),
		false,
	);
	assert.equal(
		listenMatchesDenormalizedFilters(
			{ isFirstListen: false, hasRating: false },
			{ onlyUnranked: true, onlyFirstListens: true },
		),
		false,
	);
	assert.equal(
		listenMatchesDenormalizedFilters(
			{ hasRating: false },
			{ onlyUnranked: true, onlyFirstListens: false, yearMin: 1970 },
		),
		false,
	);
});

test("computeListenFilterFields denormalizes first/rating/year", () => {
	assert.deepEqual(
		computeListenFilterFields({
			listenedAt: 100,
			firstListenedAt: 100,
			rating: undefined,
			releaseDate: "1975-06-01",
		}),
		{ isFirstListen: true, hasRating: false, releaseYear: 1975 },
	);
	assert.deepEqual(
		computeListenFilterFields({
			listenedAt: 200,
			firstListenedAt: 100,
			rating: 12,
			releaseDate: undefined,
		}),
		{ isFirstListen: false, hasRating: true },
	);
});

test("listenFilterFieldsNeedPatch detects drift", () => {
	const fields = {
		isFirstListen: true,
		hasRating: false,
		releaseYear: 1975,
	};
	assert.equal(listenFilterFieldsNeedPatch({}, fields), true);
	assert.equal(
		listenFilterFieldsNeedPatch(
			{ isFirstListen: true, hasRating: false, releaseYear: 1975 },
			fields,
		),
		false,
	);
	assert.equal(
		listenFilterFieldsNeedPatch(
			{ isFirstListen: true, hasRating: true, releaseYear: 1975 },
			fields,
		),
		true,
	);
});

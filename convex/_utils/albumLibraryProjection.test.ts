import assert from "node:assert/strict";
import test from "node:test";
import {
	buildAlbumLibrarySearchText,
	buildAlbumLibrarySortKey,
	rowMatchesAlbumLibraryFilters,
} from "./albumLibraryRows";

test("buildAlbumLibrarySearchText normalizes album and artist text", () => {
	assert.equal(
		buildAlbumLibrarySearchText({
			name: "  Dragon New Warm Mountain  ",
			artistName: "Big Thief",
		}),
		"dragon new warm mountain\nbig thief",
	);
});

test("buildAlbumLibrarySortKey trims and lowercases values", () => {
	assert.equal(buildAlbumLibrarySortKey("  The Smile  "), "the smile");
});

test("rowMatchesAlbumLibraryFilters matches projection search text", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(
			{
				name: "Unrelated Album",
				artistName: "Different Artist",
				searchText: "dragon new warm mountain\nbig thief",
				releaseYear: 2022,
				albumType: "album",
				listenCount: 1,
				rymStatus: "linked",
				appearsInRobRankings: true,
			},
			{ search: "warm mountain", rymStatus: "linked" },
		),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(
			{
				name: "Unrelated Album",
				artistName: "Different Artist",
				searchText: "dragon new warm mountain\nbig thief",
				releaseYear: 2022,
				albumType: "album",
				listenCount: 1,
				rymStatus: "linked",
				appearsInRobRankings: true,
			},
			{ search: "not present" },
		),
		false,
	);
});

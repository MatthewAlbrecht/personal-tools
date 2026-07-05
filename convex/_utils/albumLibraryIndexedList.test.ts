import assert from "node:assert/strict";
import test from "node:test";
import {
	albumLibraryFiltersAllowIndexedScan,
	albumLibraryPostFilterScanSize,
	chooseIndexedAlbumLibraryScan,
} from "./albumLibraryIndexedList";

test("chooseIndexedAlbumLibraryScan prefers artist index when sorting by artist", () => {
	assert.deepEqual(
		chooseIndexedAlbumLibraryScan(
			{ albumType: "album", releaseYear: 2022 },
			"artist",
		),
		{ kind: "artist" },
	);
});

test("chooseIndexedAlbumLibraryScan uses release year for recent sort", () => {
	assert.deepEqual(
		chooseIndexedAlbumLibraryScan({ releaseYear: 2022 }, "recent"),
		{ kind: "year", year: 2022 },
	);
});

test("chooseIndexedAlbumLibraryScan uses album type when no tighter filter", () => {
	assert.deepEqual(
		chooseIndexedAlbumLibraryScan({ albumType: "single" }, "recent"),
		{ kind: "albumType", value: "single" },
	);
});

test("albumLibraryFiltersAllowIndexedScan rejects active search", () => {
	assert.equal(albumLibraryFiltersAllowIndexedScan({ search: "warm" }), false);
	assert.equal(albumLibraryFiltersAllowIndexedScan({}), true);
});

test("albumLibraryPostFilterScanSize overscans before search pagination", () => {
	assert.equal(albumLibraryPostFilterScanSize(50), 1024);
	assert.equal(albumLibraryPostFilterScanSize(1), 120);
});

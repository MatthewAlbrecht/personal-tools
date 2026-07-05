import assert from "node:assert/strict";
import test from "node:test";
import {
	type AlbumLibraryFilterInput,
	compareAlbumLibraryRowsByArtist,
	getAlbumLibraryAlbumType,
	getAlbumLibraryRymStatus,
	rowMatchesAlbumLibraryFilters,
} from "./albumLibraryRows";

function row(
	overrides: Partial<AlbumLibraryFilterInput> = {},
): AlbumLibraryFilterInput {
	return {
		name: "Imaginal Disk",
		artistName: "Magdalena Bay",
		releaseYear: 2024,
		albumType: "album",
		listenCount: 1,
		rymStatus: "linked",
		appearsInRobRankings: false,
		...overrides,
	};
}

test("getAlbumLibraryAlbumType classifies singles by track count", () => {
	assert.equal(getAlbumLibraryAlbumType(1), "single");
	assert.equal(getAlbumLibraryAlbumType(2), "single");
	assert.equal(getAlbumLibraryAlbumType(3), "album");
});

test("getAlbumLibraryRymStatus classifies linked albums", () => {
	assert.equal(getAlbumLibraryRymStatus(true), "linked");
	assert.equal(getAlbumLibraryRymStatus(false), "unlinked");
});

test("rowMatchesAlbumLibraryFilters filters by rymStatus", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(row(), { rymStatus: "linked" }),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ rymStatus: "unlinked" }), {
			rymStatus: "linked",
		}),
		false,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row(), { rymStatus: "all" }),
		true,
	);
});

test("rowMatchesAlbumLibraryFilters filters by Rob ranking membership", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ appearsInRobRankings: true }), {
			robRankingStatus: "appears",
		}),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row(), { robRankingStatus: "appears" }),
		false,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row(), { robRankingStatus: "not_appears" }),
		true,
	);
});

test("rowMatchesAlbumLibraryFilters filters by album type and listen status", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ albumType: "single" }), {
			albumType: "single",
			listenStatus: "listened",
		}),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row({ albumType: "album", listenCount: 0 }), {
			albumType: "single",
			listenStatus: "listened",
		}),
		false,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(
			row({ albumType: "single", listenCount: 1 }),
			{
				albumType: "single",
				listenStatus: "unlistened",
			},
		),
		false,
	);
});

test("rowMatchesAlbumLibraryFilters searches album and artist names", () => {
	assert.equal(
		rowMatchesAlbumLibraryFilters(row(), { search: "imaginal" }),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row(), { search: "magdalena" }),
		true,
	);
	assert.equal(
		rowMatchesAlbumLibraryFilters(row(), { search: "charli" }),
		false,
	);
});

test("compareAlbumLibraryRowsByArtist sorts by artist then release year then album name", () => {
	const rows = [
		{ artistName: "Radiohead", name: "OK Computer", releaseYear: 1997 },
		{ artistName: "Radiohead", name: "Kid A", releaseYear: 2000 },
		{ artistName: "Radiohead", name: "Amnesiac", releaseYear: 2001 },
		{ artistName: "Bjork", name: "Homogenic", releaseYear: 1997 },
	];

	const sorted = [...rows].sort(compareAlbumLibraryRowsByArtist);

	assert.deepEqual(
		sorted.map((row) => `${row.artistName} - ${row.name} (${row.releaseYear})`),
		[
			"Bjork - Homogenic (1997)",
			"Radiohead - OK Computer (1997)",
			"Radiohead - Kid A (2000)",
			"Radiohead - Amnesiac (2001)",
		],
	);
});

test("compareAlbumLibraryRowsByArtist puts albums without release year after dated albums", () => {
	const rows = [
		{ artistName: "Radiohead", name: "Unknown Album", releaseYear: undefined },
		{ artistName: "Radiohead", name: "OK Computer", releaseYear: 1997 },
	];

	const sorted = [...rows].sort(compareAlbumLibraryRowsByArtist);

	assert.equal(sorted[0]?.name, "OK Computer");
	assert.equal(sorted[1]?.name, "Unknown Album");
});

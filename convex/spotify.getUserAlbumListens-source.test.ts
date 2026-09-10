import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
	new URL("./spotify.ts", import.meta.url),
	"utf8",
);

function listUserAlbumListensPaginatedBody(): string {
	const start = source.indexOf("export const listUserAlbumListensPaginated");
	assert.ok(start >= 0);
	const end = source.indexOf("export const getUserAlbumListens", start);
	assert.ok(end > start);
	return source.slice(start, end);
}

test("listUserAlbumListensPaginated paginates before joining albums", () => {
	const body = listUserAlbumListensPaginatedBody();
	const paginateAt = body.indexOf(".paginate(");
	assert.ok(paginateAt >= 0, "expected .paginate(");
	const collectAt = body.indexOf(".collect(");
	assert.ok(
		collectAt === -1 || collectAt > paginateAt,
		"per-album listen collect must happen after paginate",
	);
	assert.match(body, /paginationOptsValidator/);
	assert.match(body, /enrichAlbumListensPage\(/);
});

test("listUserAlbumListensPaginated uses denormalized filter indexes", () => {
	const body = listUserAlbumListensPaginatedBody();
	assert.match(source, /convex-helpers\/server\/stream/);
	assert.match(body, /onlyUnranked/);
	assert.match(body, /onlyFirstListens/);
	assert.match(body, /yearMin/);
	assert.match(body, /yearMax/);
	assert.match(body, /chooseListenFilterIndex/);
	assert.match(body, /by_userId_isFirstListen_listenedAt/);
	assert.match(body, /by_userId_hasRating_listenedAt/);
	assert.match(body, /by_userId_releaseYear_listenedAt/);
	assert.match(body, /listenMatchesDenormalizedFilters/);
	assert.match(body, /LISTEN_FILTER_MAXIMUM_ROWS_READ/);
	assert.match(body, /maximumRowsRead/);
	assert.doesNotMatch(body, /listenMatchesAlbumListenFilters/);
	assert.doesNotMatch(body, /loadUserAlbum/);

	const filterAt = body.indexOf(".filterWith(");
	const filteredPaginateAt = body.lastIndexOf(".paginate(");
	assert.ok(filterAt >= 0, "expected .filterWith(");
	assert.ok(
		filteredPaginateAt > filterAt,
		"filterWith must precede filtered paginate",
	);
});

test("listUserAlbumListensPaginated does not use Date.now", () => {
	assert.doesNotMatch(listUserAlbumListensPaginatedBody(), /Date\.now\(/);
});

test("getUserAlbumListens still takes before joining albums", () => {
	const start = source.indexOf("export const getUserAlbumListens");
	assert.ok(start >= 0);
	const end = source.indexOf("const spotifyAlbumSearchResultValidator", start);
	const body = source.slice(start, end);
	const takeAt = body.indexOf(".take(");
	assert.ok(takeAt >= 0, "expected .take(");
	assert.match(body, /enrichAlbumListensPage\(/);
	assert.doesNotMatch(body, /Date\.now\(/);
});

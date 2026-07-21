import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

function loadRowsBody(): string {
	const start = source.indexOf("async function loadForLaterAlbumRows");
	const end = source.indexOf("export const upsertForLaterAlbumItem", start);
	assert.ok(start >= 0, "loadForLaterAlbumRows must exist");
	assert.ok(end > start, "loadForLaterAlbumRows body must be bounded");
	return source.slice(start, end);
}

test("For Later filters the stream before pagination", () => {
	const body = loadRowsBody();
	const filterIndex = body.indexOf(".filterWith(");
	const paginateIndex = body.indexOf(".paginate(");

	assert.match(source, /convex-helpers\/server\/stream/);
	assert.match(body, /\.query\("albumLibraryItems"\)/);
	assert.match(body, /by_userId_isActiveForLater_forLaterLastSeenAt/);
	assert.doesNotMatch(body, /by_userId_isActiveForLater_createdAt/);
	assert.ok(filterIndex >= 0, "filterWith must be present");
	assert.ok(paginateIndex > filterIndex, "filterWith must precede paginate");
	assert.match(body, /libraryRowMatchesForLaterFilters/);
	assert.match(body, /maximumRowsRead/);
});

test("For Later primary list does not select facet or overscan strategies", () => {
	const body = loadRowsBody();

	assert.doesNotMatch(body, /forLaterAlbumItems/);
	assert.doesNotMatch(body, /withSearchIndex/);
	assert.doesNotMatch(body, /forLaterAlbumGenreFacets/);
	assert.doesNotMatch(body, /forLaterAlbumDescriptorFacets/);
	assert.doesNotMatch(body, /forLaterAlbumDurationFacets/);
	assert.doesNotMatch(body, /forLaterPostFilterScanSize/);
	assert.doesNotMatch(body, /paginateForLaterAlbumItemsIndexed/);
});

test("For Later list exposes split pagination metadata", () => {
	const loadBody = loadRowsBody();
	const queryStart = source.indexOf("export const listForLaterAlbumRows");
	const queryEnd = source.indexOf(
		"export const listOpenableRymLinks",
		queryStart,
	);
	const queryBody = source.slice(queryStart, queryEnd);

	assert.match(loadBody, /result\.pageStatus/);
	assert.match(loadBody, /result\.splitCursor/);
	assert.match(queryBody, /pageStatus/);
	assert.match(queryBody, /splitCursor/);
});

test("For Later library hydration exposes canonical IDs and projected timestamps", () => {
	const start = source.indexOf("async function hydrateLibraryForLaterAlbumRow");
	const end = source.indexOf("async function loadForLaterAlbumRows", start);
	const body = source.slice(start, end);

	assert.ok(start >= 0, "library row hydration must exist");
	assert.match(body, /libraryItemId/);
	assert.match(body, /albumId/);
	assert.doesNotMatch(body, /albumItemId/);
	assert.match(body, /forLater\.lastSeenAt/);
	assert.match(body, /forLater\.playlistAddedAt/);
	assert.match(body, /forLater\.firstSeenAt/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

test("observation and dismissal paths patch library-owned state", () => {
	for (const exportName of [
		"upsertForLaterAlbumItem",
		"setForLaterAlbumRemovedFromForLater",
	]) {
		const start = source.indexOf(`export const ${exportName}`);
		const end = source.indexOf("\nexport const ", start + 1);
		const body = source.slice(start, end === -1 ? source.length : end);
		assert.match(body, /patchLibraryForLaterState/);
	}
});

test("source-removal mutation is deleted", () => {
	assert.doesNotMatch(source, /export const markForLaterAlbumsRemoved/);
});

function exportedFunctionBody(exportName: string): string {
	const start = source.indexOf(`export const ${exportName}`);
	const end = source.indexOf("\nexport const ", start + 1);
	assert.ok(start >= 0, `${exportName} must exist`);
	return source.slice(start, end === -1 ? source.length : end);
}

test("public For Later actions accept album identity", () => {
	for (const exportName of [
		"setForLaterAlbumRymNotOnSite",
		"setForLaterAlbumRemovedFromForLater",
		"associateForLaterAlbumWithRymScrape",
	]) {
		const body = exportedFunctionBody(exportName);
		assert.match(body, /albumId: v\.id\("spotifyAlbums"\)/);
		assert.doesNotMatch(body, /itemId: v\.id\("forLaterAlbumItems"\)/);
	}

	const queueBody = exportedFunctionBody("queueForLaterRymDiscovery");
	assert.match(queueBody, /albumIds: v\.array\(v\.id\("spotifyAlbums"\)\)/);
	assert.doesNotMatch(queueBody, /forLaterAlbumItemIds/);
});

test("public list rows expose canonical library and album IDs only", () => {
	const validatorStart = source.indexOf("const forLaterAlbumRowValidator");
	const validatorEnd = source.indexOf(
		"const recommendationResultFields",
		validatorStart,
	);
	const validator = source.slice(validatorStart, validatorEnd);

	assert.match(validator, /libraryItemId: v\.id\("albumLibraryItems"\)/);
	assert.match(validator, /albumId: v\.id\("spotifyAlbums"\)/);
	assert.doesNotMatch(validator, /albumItemId/);
});

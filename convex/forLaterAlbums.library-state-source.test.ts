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
		"setForLaterAlbumMarkedAsSingle",
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

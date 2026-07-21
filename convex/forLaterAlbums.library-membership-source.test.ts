import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

function sliceHandler(exportName: string): string {
	const start = source.indexOf(`export const ${exportName}`);
	assert.ok(start >= 0, `${exportName} must exist`);
	const next = source.indexOf("\nexport const ", start + 1);
	return source.slice(start, next === -1 ? undefined : next);
}

test("setForLaterAlbumMarkedAsSingle patches library membership", () => {
	const body = sliceHandler("setForLaterAlbumMarkedAsSingle");
	assert.match(body, /patchLibraryForLaterState/);
});

test("setForLaterAlbumRemovedFromForLater patches library membership", () => {
	const body = sliceHandler("setForLaterAlbumRemovedFromForLater");
	assert.match(body, /patchLibraryForLaterState/);
});

test("Spotify source absence is not reconciled", () => {
	assert.doesNotMatch(source, /export const markForLaterAlbumsRemoved/);
});

test("backfillMyAppearsInForLater refreshes library projections", () => {
	const body = sliceHandler("backfillMyAppearsInForLater");
	assert.match(body, /upsertAlbumLibraryProjection/);
});

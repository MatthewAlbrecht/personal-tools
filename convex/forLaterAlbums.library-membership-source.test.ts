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

test("setForLaterAlbumMarkedAsSingle refreshes library projection", () => {
	const body = sliceHandler("setForLaterAlbumMarkedAsSingle");
	assert.match(body, /upsertAlbumLibraryProjection/);
});

test("setForLaterAlbumRemovedFromForLater refreshes library projection", () => {
	const body = sliceHandler("setForLaterAlbumRemovedFromForLater");
	assert.match(body, /upsertAlbumLibraryProjection/);
});

test("markForLaterAlbumsRemoved refreshes library projection per removed item", () => {
	const body = sliceHandler("markForLaterAlbumsRemoved");
	assert.match(body, /upsertAlbumLibraryProjection/);
});

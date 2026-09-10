import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
	new URL("./spotify.ts", import.meta.url),
	"utf8",
);

function getUserAlbumListensBody(): string {
	const start = source.indexOf("export const getUserAlbumListens");
	assert.ok(start >= 0);
	const end = source.indexOf("const spotifyAlbumSearchResultValidator", start);
	return source.slice(start, end);
}

test("getUserAlbumListens takes before joining albums", () => {
	const body = getUserAlbumListensBody();
	const takeAt = body.indexOf(".take(");
	const collectAt = body.indexOf(".collect(");
	assert.ok(takeAt >= 0, "expected .take(");
	assert.equal(collectAt, -1, "must not .collect() all listens");
	const getAlbumAt = body.indexOf("ctx.db.get(");
	assert.ok(getAlbumAt > takeAt, "album joins must happen after take");
});

test("getUserAlbumListens enriches listenCount and isFirstListen", () => {
	const body = getUserAlbumListensBody();
	assert.match(body, /listenCount/);
	assert.match(body, /isFirstListen/);
	assert.match(body, /firstListenedAt/);
	assert.match(body, /by_userId_albumId/);
});

test("getUserAlbumListens does not use Date.now", () => {
	assert.doesNotMatch(getUserAlbumListensBody(), /Date\.now\(/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSource = readFileSync("convex/schema.ts", "utf8");
const spotifySource = readFileSync("convex/spotify.ts", "utf8");
const matchingSource = readFileSync("convex/_utils/albumMatching.ts", "utf8");

test("spotifyAlbums stores and indexes normalized album title keys", () => {
	assert.match(schemaSource, /albumTitleKey: v\.optional\(v\.string\(\)\)/);
	assert.match(
		schemaSource,
		/\.index\("by_albumTitleKey", \["albumTitleKey"\]\)/,
	);
});

test("Spotify album writes persist normalized album title keys", () => {
	assert.match(
		spotifySource,
		/const albumTitleKey = normalizeAlbumTitle\(args\.name\)/,
	);
	assert.match(spotifySource, /albumTitleKey,/);
	assert.match(spotifySource, /backfillSpotifyAlbumTitleKeys/);
});

test("RYM title artist matching uses the album title key index", () => {
	assert.match(matchingSource, /withIndex\("by_albumTitleKey"/);
	assert.doesNotMatch(
		matchingSource,
		/withIndex\("by_createdAt"[\s\S]*?take\(limit\)/,
	);
});

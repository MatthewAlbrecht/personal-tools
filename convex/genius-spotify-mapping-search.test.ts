import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
	new URL("./geniusAlbums.ts", import.meta.url),
	"utf8",
);
const handler = source.match(
	/export const searchSpotifyAlbumsForMapping[\s\S]*?\n\}\);\n/,
)?.[0];

test("mapping search uses the album library instead of the newest 500 Spotify albums", () => {
	assert.ok(handler);
	assert.match(handler, /search_albumLibraryItems/);
	assert.doesNotMatch(handler, /\.take\(500\)/);
	assert.doesNotMatch(handler, /withIndex\("by_createdAt"\)/);
});

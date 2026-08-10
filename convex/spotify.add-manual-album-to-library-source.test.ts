import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");

test("spotifyAlbums declares optional spotifyAlbumId and source union", () => {
	assert.match(schema, /spotifyAlbums:\s*defineTable\(\{[\s\S]*?spotifyAlbumId:\s*v\.optional\(v\.string\(\)\)/);
	assert.match(schema, /source:\s*v\.union\(\s*v\.literal\("spotify"\),\s*v\.literal\("manual"\)\s*\)/);
});

test("albumLibraryItems spotifyAlbumId is optional", () => {
	assert.match(
		schema,
		/albumLibraryItems:\s*defineTable\(\{[\s\S]*?spotifyAlbumId:\s*v\.optional\(v\.string\(\)\)/,
	);
});

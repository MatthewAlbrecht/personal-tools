import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const schema = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");

test("spotifyAlbums declares optional spotifyAlbumId and source union", () => {
	assert.match(
		schema,
		/spotifyAlbums:\s*defineTable\(\{[\s\S]*?spotifyAlbumId:\s*v\.optional\(v\.string\(\)\)/,
	);
	assert.match(
		schema,
		/source:\s*v\.union\(\s*v\.literal\("spotify"\),\s*v\.literal\("manual"\),\s*v\.literal\("bandcamp"\)\s*\)/,
	);
});

test("albumLibraryItems spotifyAlbumId is optional", () => {
	assert.match(
		schema,
		/albumLibraryItems:\s*defineTable\(\{[\s\S]*?spotifyAlbumId:\s*v\.optional\(v\.string\(\)\)/,
	);
});

const upsert = readFileSync(
	join(process.cwd(), "convex/_utils/upsertSpotifyAlbumRecord.ts"),
	"utf8",
);
const projection = readFileSync(
	join(process.cwd(), "convex/_utils/albumLibraryProjection.ts"),
	"utf8",
);

test("upsertSpotifyAlbumRecord sets source spotify on insert and patch", () => {
	assert.match(upsert, /source:\s*"spotify"/);
});

test("album library projection copies optional spotifyAlbumId from album", () => {
	assert.match(projection, /spotifyAlbumId:\s*album\.spotifyAlbumId/);
});

const spotify = readFileSync(join(process.cwd(), "convex/spotify.ts"), "utf8");
const manual = readFileSync(
	join(process.cwd(), "convex/_utils/manualAlbum.ts"),
	"utf8",
);

test("addManualAlbumToLibrary mutation exists", () => {
	assert.match(spotify, /export const addManualAlbumToLibrary = mutation\(/);
});

test("manualAlbum helpers cover duplicate find, insert, and listen", () => {
	assert.match(
		manual,
		/export async function findAlbumByNormalizedTitleArtist/,
	);
	assert.match(manual, /export async function insertManualAlbum/);
	assert.match(manual, /export async function recordManualListenForAlbum/);
	assert.match(manual, /source:\s*"manual"/);
});

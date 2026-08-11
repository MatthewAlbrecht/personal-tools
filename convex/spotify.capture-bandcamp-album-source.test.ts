import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const spotify = readFileSync(join(process.cwd(), "convex/spotify.ts"), "utf8");
const helper = readFileSync(
	join(process.cwd(), "convex/_utils/bandcampAlbum.ts"),
	"utf8",
);

test("captureBandcampAlbumToLibrary mutation exists", () => {
	assert.match(
		spotify,
		/export const captureBandcampAlbumToLibrary = mutation\(/,
	);
});

test("bandcamp upsert helper writes source bandcamp and never spotifyAlbumId", () => {
	assert.match(helper, /source:\s*"bandcamp"/);
	assert.doesNotMatch(helper, /spotifyAlbumId:/);
	assert.match(helper, /by_bandcampUrl/);
	assert.match(
		helper,
		/\.\.\.\(args\.imageUrl !== undefined \? \{ imageUrl: args\.imageUrl \} : \{\}\)/,
	);
	assert.match(
		helper,
		/\.\.\.\(args\.releaseDate !== undefined\s*\? \{ releaseDate: args\.releaseDate \}\s*: \{\}\)/,
	);
});

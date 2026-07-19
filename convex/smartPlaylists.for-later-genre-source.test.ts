import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "smartPlaylists.ts"),
	"utf8",
);

test("for-later matching loads library rows by appearsInForLater", () => {
	const start = source.indexOf("async function resolveForLaterMatches");
	const end = source.indexOf("async function resolveRankingsMatches", start);
	const body = source.slice(start, end);

	assert.match(body, /albumLibraryItems/);
	assert.match(body, /appearsInForLater/);
	assert.match(body, /primaryGenres/);
	assert.match(body, /secondaryGenres/);
	assert.doesNotMatch(body, /rateYourMusicSpotifyAlbumLinks/);
	assert.doesNotMatch(body, /loadGenreRoleKeysForScrape/);
	assert.doesNotMatch(body, /resolveRymScrapeIdForAlbum/);
});

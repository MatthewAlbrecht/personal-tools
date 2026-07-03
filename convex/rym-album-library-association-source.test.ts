import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spotifySource = readFileSync("convex/spotify.ts", "utf8");
const forLaterSource = readFileSync("convex/forLaterAlbums.ts", "utf8");

function getSourceBetween(source: string, start: string, end: string): string {
	const startIndex = source.indexOf(start);
	assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
	const endIndex = source.indexOf(end, startIndex);
	assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
	return source.slice(startIndex, endIndex);
}

test("album library RYM search can opt into mapped scrapes", () => {
	const body = getSourceBetween(
		forLaterSource,
		"export const searchUnmappedRymScrapes = query({",
		"export const associateForLaterAlbumWithRymScrape = mutation({",
	);

	assert.match(body, /includeMapped: v\.optional\(v\.boolean\(\)\)/);
	assert.match(body, /args\.includeMapped/);
	assert.match(body, /collectMappedRymScrapeIds\(ctx\)/);
});

test("album library manual association permits a scrape on multiple Spotify albums", () => {
	const body = getSourceBetween(
		spotifySource,
		"export const associateSpotifyAlbumWithRymScrape = mutation({",
		"// Upsert canonical track data",
	);

	assert.doesNotMatch(body, /already linked to another album/);
	assert.doesNotMatch(body, /by_scrapeId/);
	assert.match(body, /linkRymScrapeToSpotifyAlbum\(ctx/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/robRankings.ts", "utf8");

function getSourceBetween(
	sourceText: string,
	start: string,
	end: string,
): string {
	const startIndex = sourceText.indexOf(start);
	assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
	const endIndex = sourceText.indexOf(end, startIndex);
	assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
	return sourceText.slice(startIndex, endIndex);
}

test("rob rankings exposes published top-level genre counts query", () => {
	const body = getSourceBetween(
		source,
		"export const getPublishedTopLevelGenreCountsForYear = query({",
		"export const getPublishedAlbumsForYear = query({",
	);

	assert.match(body, /year: v\.number\(\)/);
	assert.match(body, /topCount: v\.optional\(robRankingTopCountValidator\)/);
	assert.match(body, /const topCount = args\.topCount \?\? 50/);
	assert.match(body, /getPublishedTopLevelGenreCountsForAllYears/);
	assert.match(body, /withIndex\("by_published"/);
	assert.match(body, /includeAlbumDetails: false/);
	assert.match(body, /robRankingAlbums/);
	assert.match(body, /withIndex\("by_yearId"/);
	assert.match(body, /ranking\.position <= topCount/);
	assert.match(body, /rateYourMusicSpotifyAlbumLinks/);
	assert.match(body, /withIndex\("by_albumId"/);
	assert.match(body, /rateYourMusicReleaseGenres/);
	assert.match(body, /withIndex\("by_scrapeId"/);
	assert.match(body, /role === "primary"/);
	assert.match(body, /resolveTopLevelGenreKeys/);
	assert.match(body, /resolveRankingAlbumDisplay/);
	assert.match(body, /albumName: display\.name/);
	assert.match(body, /artistName: display\.artistName/);
	assert.match(body, /throughGenreLabel: genre\.label/);
	assert.match(body, /buildRobRankingGenreCountSummary/);
});

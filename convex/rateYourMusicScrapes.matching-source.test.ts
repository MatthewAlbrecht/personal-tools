import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("convex/rateYourMusicScrapes.ts", "utf8");

function getSourceBetween(startMarker: string, endMarker: string): string {
	const startIndex = source.indexOf(startMarker);
	const endIndex = source.indexOf(endMarker, startIndex);

	assert.ok(startIndex >= 0, `${startMarker} must exist`);
	assert.ok(
		endIndex > startIndex,
		`${endMarker} must exist after ${startMarker}`,
	);

	return source.slice(startIndex, endIndex);
}

test("RYM scrape upsert imports explicit Spotify album matcher", () => {
	assert.match(
		source,
		/import \{ matchRymScrapeToSpotifyAlbums \} from "\.\/_utils\/albumMatching"/,
	);
});

test("RYM scrape upsert calls explicit Spotify album matcher after taxonomy sync", () => {
	const upsertSource = getSourceBetween(
		"export const upsertRateYourMusicScrape = mutation",
		"export const backfillRymScrapeSpotifyAlbumMatches = mutation",
	);
	const taxonomyIndex = upsertSource.indexOf("await syncReleaseTaxonomy");
	const matchIndex = upsertSource.indexOf(
		"await matchRymScrapeToSpotifyAlbums",
	);
	const refreshIndex = upsertSource.indexOf(
		"internal.forLaterAlbums.refreshFilterProjectionsForScrape",
	);

	assert.ok(taxonomyIndex >= 0, "taxonomy sync call must exist");
	assert.ok(
		matchIndex > taxonomyIndex,
		"Spotify album matching must run after taxonomy sync",
	);
	assert.ok(
		refreshIndex > matchIndex,
		"projection refresh must run after Spotify album link matching",
	);
});

test("manual backfill processes unmatched recent RYM scrapes with explicit matcher", () => {
	const backfillSource = getSourceBetween(
		"export const backfillRymScrapeSpotifyAlbumMatches = mutation",
		"export const listRateYourMusicScrapes = query",
	);

	assert.match(backfillSource, /matchRymScrapeToSpotifyAlbums/);
	assert.match(backfillSource, /withIndex\("by_updatedAt"\)/);
	assert.match(backfillSource, /take\(scanLimit\)/);
	assert.match(backfillSource, /withIndex\("by_scrapeId"/);
	assert.match(backfillSource, /if \(existingLink\)/);
	assert.match(backfillSource, /summaries\.length >= limit/);
});

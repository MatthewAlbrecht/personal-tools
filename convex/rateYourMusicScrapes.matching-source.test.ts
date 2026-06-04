import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "rateYourMusicScrapes.ts"),
	"utf8",
);

test("RYM scrape ingest imports For Later matching", () => {
	assert.match(source, /matchForLaterAlbumsForRymScrape/);
});

test("RYM scrape ingest matches after taxonomy sync", () => {
	const taxonomyIndex = source.indexOf(
		"await syncReleaseTaxonomy(ctx, scrapeId, args, now)",
	);
	const matchIndex = source.indexOf("await matchForLaterAlbumsForRymScrape");

	assert.ok(taxonomyIndex >= 0, "taxonomy sync call must exist");
	assert.ok(
		matchIndex > taxonomyIndex,
		"matching must run after taxonomy sync",
	);
	assert.match(source, /scrapeId/);
	assert.match(source, /spotifyAlbumId: args\.spotifyAlbumId/);
	assert.match(source, /albumTitle: args\.albumTitle/);
	assert.match(source, /artists: args\.artists/);
});

test("RYM scrape ingest refreshes For Later projections after album link matching", () => {
	const matchIndex = source.indexOf("await matchForLaterAlbumsForRymScrape");
	const refreshIndex = source.indexOf(
		"internal.forLaterAlbums.refreshFilterProjectionsForScrape",
	);

	assert.ok(matchIndex >= 0, "matching call must exist");
	assert.ok(refreshIndex >= 0, "projection refresh must exist");
	assert.ok(
		refreshIndex > matchIndex,
		"projection refresh must run after Spotify album link matching",
	);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

test("For Later album upsert imports RYM matching helpers", () => {
	assert.match(source, /matchRymForForLaterAlbum/);
	assert.match(source, /normalizeAlbumTitle/);
	assert.match(source, /buildArtistKeys/);
});

test("For Later album upsert calls RYM matching after item upsert", () => {
	const upsertIndex = source.indexOf("upsertForLaterAlbumItem");
	const matchIndex = source.indexOf("await matchRymForForLaterAlbum");

	assert.ok(upsertIndex >= 0, "upsertForLaterAlbumItem must exist");
	assert.ok(
		matchIndex > upsertIndex,
		"matchRymForForLaterAlbum must be called in the upsert flow",
	);
	assert.match(source, /rymMatch/);
});

test("recommendation genre counts use filterGenreKeysSorted not item.rymScrapeId", () => {
	assert.match(
		source,
		/recommendationFilterGenreKeysForItems[\s\S]*filterGenreKeysSorted/,
	);
	assert.doesNotMatch(
		source,
		/loadRecommendationAlbumGenreTagsForItems/,
	);
	assert.doesNotMatch(
		source,
		/collectForLaterRecommendationTagOptions[\s\S]*item\.rymScrapeId/,
	);
});

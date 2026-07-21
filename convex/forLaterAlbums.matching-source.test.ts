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

test("For Later album upsert seeds album library projection", () => {
	const start = source.indexOf("export const upsertForLaterAlbumItem");
	const end = source.indexOf("\nexport const ", start + 1);
	const body = source.slice(start, end === -1 ? undefined : end);

	assert.ok(start >= 0, "upsertForLaterAlbumItem must exist");
	assert.match(body, /patchLibraryForLaterState/);
});

test("recommendation genre counts use library filterGenreKeysSorted", () => {
	assert.match(source, /countBacklogGenreKeys/);
	assert.match(
		source,
		/countBacklogGenreKeys[\s\S]*filterGenreKeysSorted/,
	);
	assert.doesNotMatch(
		source,
		/loadRecommendationAlbumGenreTagsForItems/,
	);
	assert.doesNotMatch(
		source,
		/collectForLaterRecommendationGenreOptions[\s\S]*item\.rymScrapeId/,
	);
});

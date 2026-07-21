import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "forLaterAlbums.ts"),
	"utf8",
);

function sliceExport(exportName: string): string {
	const start = source.indexOf(`export const ${exportName}`);
	assert.ok(start >= 0, `${exportName} must exist`);
	const next = source.indexOf("\nexport const ", start + 1);
	return source.slice(start, next === -1 ? undefined : next);
}

test("summary counts active and dismissed library rows", () => {
	const body = sliceExport("getForLaterUiSummary");
	assert.match(body, /albumLibraryItems/);
	assert.match(body, /isActiveForLater/);
	assert.match(body, /dismissedAt/);
	assert.doesNotMatch(body, /forLaterAlbumItems/);
});

test("duration bucket counts and recommendation options use active library rows", () => {
	const durationBody = sliceExport("listForLaterDurationBucketCounts");
	assert.match(durationBody, /collectVisibleActiveLibraryForLaterRows/);
	assert.match(durationBody, /totalDurationMs/);

	const optionsBody = sliceExport("listForLaterRecommendationOptions");
	assert.match(optionsBody, /collectForLaterRecommendationGenreOptions/);
	assert.match(source, /collectVisibleActiveLibraryForLaterRows/);
	assert.match(
		source,
		/withIndex\("by_userId_isActiveForLater_forLaterLastSeenAt"/,
	);
});

test("recommendation saves use albumIds without legacy item IDs", () => {
	const body = sliceExport("createForLaterRecommendation");
	assert.match(body, /albumIds: albumRefs\.albumIds/);
	assert.doesNotMatch(body, /albumItemIds:/);
	assert.doesNotMatch(body, /requireLegacyForLaterItemByAlbum/);
});

test("recommendation candidates come from library rows", () => {
	const start = source.indexOf(
		"async function collectForLaterRecommendationCandidates",
	);
	const end = source.indexOf("function clampSwapRange", start);
	const body = source.slice(start, end);
	assert.match(body, /collectVisibleActiveLibraryForLaterRows/);
	assert.match(body, /recommendationCandidateFromLibraryRow/);
	assert.match(body, /hydrateLibraryForLaterAlbumRow/);
	assert.doesNotMatch(body, /forLaterAlbumItems/);
	assert.doesNotMatch(body, /hydrateForLaterAlbumRow/);
});

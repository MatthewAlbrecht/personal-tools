import assert from "node:assert/strict";
import test from "node:test";
import {
	ARTIST_STAT_TIER_CONFIG,
	type ArtistStatsRow,
	getArtistStatsListForTier,
	sortArtistStatsByTier,
} from "./artist-stats-table";

function makeRow(
	overrides: Partial<ArtistStatsRow> & Pick<ArtistStatsRow, "artistKey" | "displayName">,
): ArtistStatsRow {
	return {
		wins: 0,
		top3: 0,
		top5: 0,
		top10: 0,
		top25: 0,
		top50: 0,
		yearsAppeared: 0,
		...overrides,
	};
}

test("ARTIST_STAT_TIER_CONFIG defines tier-specific limits and min counts", () => {
	assert.deepEqual(ARTIST_STAT_TIER_CONFIG.wins, { limit: 15, minCount: 1 });
	assert.deepEqual(ARTIST_STAT_TIER_CONFIG.top3, { limit: 15, minCount: 1 });
	assert.deepEqual(ARTIST_STAT_TIER_CONFIG.top5, { limit: 15, minCount: 1 });
	assert.deepEqual(ARTIST_STAT_TIER_CONFIG.top10, { limit: 25, minCount: 2 });
	assert.deepEqual(ARTIST_STAT_TIER_CONFIG.top25, { limit: 35, minCount: 2 });
	assert.deepEqual(ARTIST_STAT_TIER_CONFIG.top50, { limit: 50, minCount: 2 });
});

test("sortArtistStatsByTier excludes artists below minCount", () => {
	const rows = [
		makeRow({ artistKey: "a", displayName: "Alpha", top10: 2 }),
		makeRow({ artistKey: "b", displayName: "Bravo", top10: 1 }),
		makeRow({ artistKey: "c", displayName: "Charlie", top10: 0 }),
	];

	assert.deepEqual(
		sortArtistStatsByTier(rows, "top10", 2).map((row) => row.artistKey),
		["a"],
	);
});

test("sortArtistStatsByTier keeps count > 0 artists when minCount is 1", () => {
	const rows = [
		makeRow({ artistKey: "a", displayName: "Alpha", wins: 1 }),
		makeRow({ artistKey: "b", displayName: "Bravo", wins: 0 }),
	];

	assert.deepEqual(
		sortArtistStatsByTier(rows, "wins", 1).map((row) => row.artistKey),
		["a"],
	);
});

test("sortArtistStatsByTier sorts by count desc then display name", () => {
	const rows = [
		makeRow({ artistKey: "b", displayName: "Bravo", top5: 2 }),
		makeRow({ artistKey: "a", displayName: "Alpha", top5: 2 }),
		makeRow({ artistKey: "c", displayName: "Charlie", top5: 3 }),
	];

	assert.deepEqual(
		sortArtistStatsByTier(rows, "top5", 1).map((row) => row.artistKey),
		["c", "a", "b"],
	);
});

test("getArtistStatsListForTier applies tier limit after filtering", () => {
	const top10Rows = Array.from({ length: 30 }, (_, index) =>
		makeRow({
			artistKey: `top10-${index}`,
			displayName: `Artist ${String(index).padStart(2, "0")}`,
			top10: 2,
		}),
	);
	const top50Rows = Array.from({ length: 30 }, (_, index) =>
		makeRow({
			artistKey: `top50-${index}`,
			displayName: `Artist ${String(index).padStart(2, "0")}`,
			top50: 2,
		}),
	);

	assert.equal(getArtistStatsListForTier(top10Rows, "top10").length, 25);
	assert.equal(getArtistStatsListForTier(top50Rows, "top50").length, 30);
	assert.equal(getArtistStatsListForTier(top10Rows, "wins").length, 0);
});

test("getArtistStatsListForTier excludes single-count artists for top10+", () => {
	const rows = [
		makeRow({ artistKey: "a", displayName: "Alpha", top25: 1 }),
		makeRow({ artistKey: "b", displayName: "Bravo", top25: 2 }),
	];

	assert.deepEqual(
		getArtistStatsListForTier(rows, "top25").map((row) => row.artistKey),
		["b"],
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	type ArtistFinishInput,
	buildArtistHighestPlacementRows,
	buildArtistOneTimePlacementRows,
	buildArtistStatsRows,
	buildArtistUniqueTierRows,
	resolveArtistNamesForRankingEntry,
	resolveArtistNamesFromRaw,
	resolveArtistNamesFromSpotifyAlbum,
	resolveSingleArtistName,
	splitArtistNames,
} from "./robRankingArtistStats";

test("splitArtistNames splits on comma-space", () => {
	assert.deepEqual(splitArtistNames("Big Thief, Adrianne Lenker"), [
		"Big Thief",
		"Adrianne Lenker",
	]);
});

test("single artist single win", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 1, artistNames: ["Big Thief"], year: 2024 },
	];

	const rows = buildArtistStatsRows(entries);
	assert.equal(rows.length, 1);
	assert.equal(rows[0]?.artistKey, "big thief");
	assert.equal(rows[0]?.displayName, "Big Thief");
	assert.equal(rows[0]?.wins, 1);
	assert.equal(rows[0]?.top3, 1);
	assert.equal(rows[0]?.top5, 1);
	assert.equal(rows[0]?.top10, 1);
	assert.equal(rows[0]?.top25, 1);
	assert.equal(rows[0]?.top50, 1);
	assert.equal(rows[0]?.yearsAppeared, 1);
});

test("multi-artist album credits each artist", () => {
	const entries: ArtistFinishInput[] = [
		{
			position: 5,
			artistNames: ["Phoebe Bridgers", "Lucy Dacus", "Julien Baker"],
			year: 2023,
		},
	];

	const rows = buildArtistStatsRows(entries);
	assert.equal(rows.length, 3);

	for (const row of rows) {
		assert.equal(row.wins, 0);
		assert.equal(row.top3, 0);
		assert.equal(row.top5, 1);
		assert.equal(row.top10, 1);
		assert.equal(row.top25, 1);
		assert.equal(row.top50, 1);
		assert.equal(row.yearsAppeared, 1);
	}
});

test("manual entry uses provided artist name", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 12, artistNames: ["SOPHIE"], year: 2021 },
	];

	const rows = buildArtistStatsRows(entries);
	assert.equal(rows.length, 1);
	assert.equal(rows[0]?.displayName, "SOPHIE");
	assert.equal(rows[0]?.top10, 0);
	assert.equal(rows[0]?.top25, 1);
});

test("top tier counts are cumulative", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 1, artistNames: ["Radiohead"], year: 2016 },
	];

	const rows = buildArtistStatsRows(entries);
	const row = rows[0];
	assert.ok(row);
	assert.equal(row.wins, 1);
	assert.equal(row.top3, 1);
	assert.equal(row.top5, 1);
	assert.equal(row.top10, 1);
	assert.equal(row.top25, 1);
	assert.equal(row.top50, 1);
});

test("position 10 counts top10 but not top5", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 10, artistNames: ["Weyes Blood"], year: 2019 },
	];

	const row = buildArtistStatsRows(entries)[0];
	assert.ok(row);
	assert.equal(row.wins, 0);
	assert.equal(row.top5, 0);
	assert.equal(row.top10, 1);
	assert.equal(row.top25, 1);
	assert.equal(row.top50, 1);
});

test("sorts by wins desc then top3 desc then name asc", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 1, artistNames: ["Zebra Artist"], year: 2020 },
		{ position: 1, artistNames: ["Alpha Artist"], year: 2021 },
		{ position: 2, artistNames: ["Alpha Artist"], year: 2022 },
		{ position: 1, artistNames: ["Beta Artist"], year: 2023 },
	];

	const rows = buildArtistStatsRows(entries);
	assert.deepEqual(
		rows.map((row) => row.displayName),
		["Alpha Artist", "Beta Artist", "Zebra Artist"],
	);
});

test("yearsAppeared counts distinct published years", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 3, artistNames: ["Big Thief"], year: 2020 },
		{ position: 15, artistNames: ["Big Thief"], year: 2022 },
		{ position: 40, artistNames: ["Big Thief"], year: 2022 },
	];

	const row = buildArtistStatsRows(entries)[0];
	assert.ok(row);
	assert.equal(row.yearsAppeared, 2);
});

test("display name prefers most recent year casing", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 5, artistNames: ["big thief"], year: 2020 },
		{ position: 10, artistNames: ["Big Thief"], year: 2024 },
	];

	const row = buildArtistStatsRows(entries)[0];
	assert.ok(row);
	assert.equal(row.displayName, "Big Thief");
});

test("resolveArtistNamesFromRaw dedupes normalized segments", () => {
	assert.deepEqual(
		resolveArtistNamesFromRaw("Big Thief, big thief, Adrianne Lenker"),
		["Big Thief", "Adrianne Lenker"],
	);
});

test("resolveSingleArtistName keeps comma-containing names intact", () => {
	assert.deepEqual(resolveSingleArtistName("Tyler, The Creator"), [
		"Tyler, The Creator",
	]);
});

test("resolveArtistNamesFromSpotifyAlbum uses rawData artists array", () => {
	const rawData = JSON.stringify({
		artists: [{ name: "Tyler, The Creator" }],
	});

	assert.deepEqual(
		resolveArtistNamesFromSpotifyAlbum({
			artistName: "Tyler, The Creator",
			rawData,
		}),
		["Tyler, The Creator"],
	);
});

test("resolveArtistNamesFromSpotifyAlbum credits each structured artist on collabs", () => {
	const rawData = JSON.stringify({
		artists: [
			{ name: "Phoebe Bridgers" },
			{ name: "Lucy Dacus" },
			{ name: "Julien Baker" },
		],
	});

	assert.deepEqual(
		resolveArtistNamesFromSpotifyAlbum({
			artistName: "Phoebe Bridgers, Lucy Dacus, Julien Baker",
			rawData,
		}),
		["Phoebe Bridgers", "Lucy Dacus", "Julien Baker"],
	);
});

test("resolveArtistNamesFromSpotifyAlbum falls back to comma split without rawData", () => {
	assert.deepEqual(
		resolveArtistNamesFromSpotifyAlbum({
			artistName: "Big Thief, Adrianne Lenker",
		}),
		["Big Thief", "Adrianne Lenker"],
	);
});

test("resolveArtistNamesForRankingEntry uses stored artistNames when present", () => {
	assert.deepEqual(
		resolveArtistNamesForRankingEntry(
			{ artistNames: ["Tyler, The Creator"] },
			{
				isManual: false,
				spotifyAlbum: { artistName: "Tyler, The Creator" },
			},
		),
		["Tyler, The Creator"],
	);
});

test("resolveArtistNamesForRankingEntry Tyler override wins over comma split fallback", () => {
	assert.deepEqual(
		resolveArtistNamesForRankingEntry(
			{ artistNames: ["Tyler, The Creator"] },
			{
				isManual: false,
				spotifyAlbum: { artistName: "Tyler, The Creator" },
			},
		),
		["Tyler, The Creator"],
	);

	assert.deepEqual(
		resolveArtistNamesForRankingEntry(
			{},
			{
				isManual: false,
				spotifyAlbum: { artistName: "Tyler, The Creator" },
			},
		),
		["Tyler", "The Creator"],
	);
});

test("resolveArtistNamesForRankingEntry dedupes stored artistNames", () => {
	assert.deepEqual(
		resolveArtistNamesForRankingEntry(
			{ artistNames: ["Big Thief", " big thief ", "Adrianne Lenker"] },
			{ isManual: false, spotifyAlbum: null },
		),
		["Big Thief", "Adrianne Lenker"],
	);
});

test("resolveArtistNamesForRankingEntry manual fallback keeps comma-containing names", () => {
	assert.deepEqual(
		resolveArtistNamesForRankingEntry(
			{ manualArtistName: "Tyler, The Creator" },
			{ isManual: true, spotifyAlbum: null },
		),
		["Tyler, The Creator"],
	);
});

test("buildArtistOneTimePlacementRows includes artists with exactly one finish", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 12, artistNames: ["Big Thief"], year: 2020 },
		{ position: 3, artistNames: ["Big Thief"], year: 2024 },
		{ position: 8, artistNames: ["Radiohead"], year: 2022 },
		{ position: 25, artistNames: ["Weyes Blood"], year: 2019 },
	];

	const rows = buildArtistOneTimePlacementRows(entries);
	assert.deepEqual(rows, [
		{
			artistKey: "radiohead",
			displayName: "Radiohead",
			bestPlacement: 8,
			bestPlacementYear: 2022,
		},
		{
			artistKey: "weyes blood",
			displayName: "Weyes Blood",
			bestPlacement: 25,
			bestPlacementYear: 2019,
		},
	]);
});

test("buildArtistHighestPlacementRows tracks best finish per artist", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 12, artistNames: ["Big Thief"], year: 2020 },
		{ position: 3, artistNames: ["Big Thief"], year: 2024 },
		{ position: 8, artistNames: ["Radiohead"], year: 2022 },
	];

	const rows = buildArtistHighestPlacementRows(entries);
	assert.deepEqual(rows, [
		{
			artistKey: "big thief",
			displayName: "Big Thief",
			bestPlacement: 3,
			bestPlacementYear: 2024,
		},
		{
			artistKey: "radiohead",
			displayName: "Radiohead",
			bestPlacement: 8,
			bestPlacementYear: 2022,
		},
	]);
});

test("buildArtistHighestPlacementRows prefers most recent year for tied best placement", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 5, artistNames: ["Weyes Blood"], year: 2019 },
		{ position: 5, artistNames: ["Weyes Blood"], year: 2022 },
	];

	const row = buildArtistHighestPlacementRows(entries)[0];
	assert.ok(row);
	assert.equal(row.bestPlacement, 5);
	assert.equal(row.bestPlacementYear, 2022);
});

test("buildArtistUniqueTierRows includes each artist once per tier", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 1, artistNames: ["Radiohead"], year: 2016 },
		{ position: 8, artistNames: ["Radiohead"], year: 2020 },
		{ position: 2, artistNames: ["Big Thief"], year: 2024 },
		{ position: 12, artistNames: ["Big Thief"], year: 2022 },
		{ position: 5, artistNames: ["Weyes Blood"], year: 2019 },
	];

	const top3Rows = buildArtistUniqueTierRows(entries, "top3");
	assert.deepEqual(
		top3Rows.map((row) => ({
			displayName: row.displayName,
			tierBestPlacement: row.tierBestPlacement,
		})),
		[
			{ displayName: "Radiohead", tierBestPlacement: 1 },
			{ displayName: "Big Thief", tierBestPlacement: 2 },
		],
	);
});

test("buildArtistUniqueTierRows uses best finish within tier range", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 7, artistNames: ["Radiohead"], year: 2020 },
		{ position: 4, artistNames: ["Radiohead"], year: 2018 },
		{ position: 10, artistNames: ["Radiohead"], year: 2022 },
	];

	const top5Rows = buildArtistUniqueTierRows(entries, "top5");
	assert.equal(top5Rows.length, 1);
	assert.equal(top5Rows[0]?.tierBestPlacement, 4);
});

test("buildArtistUniqueTierRows excludes artists outside tier range", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 15, artistNames: ["Weyes Blood"], year: 2019 },
	];

	assert.equal(buildArtistUniqueTierRows(entries, "top10").length, 0);
	assert.equal(buildArtistUniqueTierRows(entries, "top25").length, 1);
});

test("buildArtistUniqueTierRows wins tier only includes #1 finishes", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 1, artistNames: ["Alpha Artist"], year: 2021 },
		{ position: 2, artistNames: ["Beta Artist"], year: 2022 },
	];

	const winsRows = buildArtistUniqueTierRows(entries, "wins");
	assert.deepEqual(
		winsRows.map((row) => row.displayName),
		["Alpha Artist"],
	);
});

test("buildArtistUniqueTierRows sorts by tier best placement then name", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 3, artistNames: ["Zebra Artist"], year: 2020 },
		{ position: 1, artistNames: ["Beta Artist"], year: 2021 },
		{ position: 2, artistNames: ["Alpha Artist"], year: 2022 },
	];

	const top3Rows = buildArtistUniqueTierRows(entries, "top3");
	assert.deepEqual(
		top3Rows.map((row) => row.displayName),
		["Beta Artist", "Alpha Artist", "Zebra Artist"],
	);
});

test("buildArtistUniqueTierRows prefers most recent year for tied tier placement", () => {
	const entries: ArtistFinishInput[] = [
		{ position: 3, artistNames: ["Big Thief"], year: 2020 },
		{ position: 3, artistNames: ["Big Thief"], year: 2024 },
	];

	const row = buildArtistUniqueTierRows(entries, "top3")[0];
	assert.ok(row);
	assert.equal(row.tierBestPlacement, 3);
	assert.equal(row.tierBestPlacementYear, 2024);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	type ArtistFinishInput,
	buildArtistStatsRows,
	resolveArtistNamesFromRaw,
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

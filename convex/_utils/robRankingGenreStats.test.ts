import assert from "node:assert/strict";
import test from "node:test";
import { buildRobRankingGenreCountSummary } from "./robRankingGenreStats";

test("buildRobRankingGenreCountSummary counts albums by top-level genre", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2024,
		totalAlbums: 3,
		albumTopLevelGenres: [
			[{ key: "rock", label: "Rock" }],
			[{ key: "rock", label: "Rock" }],
			[{ key: "hip hop", label: "Hip Hop" }],
		],
	});

	assert.deepEqual(summary.genres, [
		{ genreKey: "rock", label: "Rock", count: 2 },
		{ genreKey: "hip hop", label: "Hip Hop", count: 1 },
	]);
});

test("buildRobRankingGenreCountSummary deduplicates duplicate top-level keys within one album", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2023,
		totalAlbums: 2,
		albumTopLevelGenres: [
			[
				{ key: "jazz", label: "Jazz" },
				{ key: "jazz", label: "Jazz" },
			],
			[{ key: "jazz", label: "Jazz" }],
		],
	});

	assert.deepEqual(summary.genres, [
		{ genreKey: "jazz", label: "Jazz", count: 2 },
	]);
});

test("buildRobRankingGenreCountSummary counts one album in multiple top-level genres when applicable", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2022,
		totalAlbums: 1,
		albumTopLevelGenres: [
			[
				{ key: "electronic", label: "Electronic" },
				{ key: "pop", label: "Pop" },
			],
		],
	});

	assert.deepEqual(summary.genres, [
		{ genreKey: "electronic", label: "Electronic", count: 1 },
		{ genreKey: "pop", label: "Pop", count: 1 },
	]);
	assert.equal(summary.albumsWithGenreData, 1);
});

test("buildRobRankingGenreCountSummary computes missing genre data from total albums and coverage", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2021,
		totalAlbums: 5,
		albumTopLevelGenres: [
			[{ key: "rock", label: "Rock" }],
			[],
			[{ key: "pop", label: "Pop" }],
		],
	});

	assert.equal(summary.year, 2021);
	assert.equal(summary.totalAlbums, 5);
	assert.equal(summary.albumsWithGenreData, 2);
	assert.equal(summary.albumsMissingGenreData, 3);
});

test("buildRobRankingGenreCountSummary sorts rows by count descending then label ascending", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2020,
		totalAlbums: 5,
		albumTopLevelGenres: [
			[{ key: "soul", label: "Soul" }],
			[{ key: "ambient", label: "Ambient" }],
			[{ key: "rock", label: "Rock" }],
			[{ key: "rock", label: "Rock" }],
			[{ key: "ambient", label: "Ambient" }],
		],
	});

	assert.deepEqual(summary.genres, [
		{ genreKey: "ambient", label: "Ambient", count: 2 },
		{ genreKey: "rock", label: "Rock", count: 2 },
		{ genreKey: "soul", label: "Soul", count: 1 },
	]);
});

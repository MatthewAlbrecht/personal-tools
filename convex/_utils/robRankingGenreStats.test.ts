import assert from "node:assert/strict";
import test from "node:test";
import { buildRobRankingGenreCountSummary } from "./robRankingGenreStats";

test("buildRobRankingGenreCountSummary counts albums by top-level genre", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2024,
		totalAlbums: 3,
		albumTopLevelGenres: [
			{
				album: {
					position: 2,
					albumName: "Second Album",
					artistName: "Artist B",
				},
				genres: [{ key: "rock", label: "Rock" }],
			},
			{
				album: {
					position: 1,
					albumName: "First Album",
					artistName: "Artist A",
				},
				genres: [{ key: "rock", label: "Rock" }],
			},
			{
				album: {
					position: 3,
					albumName: "Third Album",
					artistName: "Artist C",
				},
				genres: [{ key: "hip hop", label: "Hip Hop" }],
			},
		],
	});

	assert.deepEqual(summary.genres, [
		{
			genreKey: "rock",
			label: "Rock",
			count: 2,
			albums: [
				{
					position: 1,
					albumName: "First Album",
					artistName: "Artist A",
					throughGenres: ["Rock"],
				},
				{
					position: 2,
					albumName: "Second Album",
					artistName: "Artist B",
					throughGenres: ["Rock"],
				},
			],
		},
		{
			genreKey: "hip hop",
			label: "Hip Hop",
			count: 1,
			albums: [
				{
					position: 3,
					albumName: "Third Album",
					artistName: "Artist C",
					throughGenres: ["Hip Hop"],
				},
			],
		},
	]);
});

test("buildRobRankingGenreCountSummary deduplicates duplicate top-level keys within one album", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2023,
		totalAlbums: 2,
		albumTopLevelGenres: [
			{
				album: {
					position: 1,
					albumName: "A Love Supreme",
					artistName: "John Coltrane",
				},
				genres: [
					{ key: "jazz", label: "Jazz" },
					{ key: "jazz", label: "Jazz" },
				],
			},
			{
				album: {
					position: 2,
					albumName: "Head Hunters",
					artistName: "Herbie Hancock",
				},
				genres: [{ key: "jazz", label: "Jazz" }],
			},
		],
	});

	assert.deepEqual(summary.genres, [
		{
			genreKey: "jazz",
			label: "Jazz",
			count: 2,
			albums: [
				{
					position: 1,
					albumName: "A Love Supreme",
					artistName: "John Coltrane",
					throughGenres: ["Jazz"],
				},
				{
					position: 2,
					albumName: "Head Hunters",
					artistName: "Herbie Hancock",
					throughGenres: ["Jazz"],
				},
			],
		},
	]);
});

test("buildRobRankingGenreCountSummary counts one album in multiple top-level genres when applicable", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2022,
		totalAlbums: 1,
		albumTopLevelGenres: [
			{
				album: { position: 1, albumName: "Multi Genre", artistName: "Artist" },
				genres: [
					{ key: "electronic", label: "Electronic" },
					{ key: "pop", label: "Pop" },
				],
			},
		],
	});

	assert.deepEqual(summary.genres, [
		{
			genreKey: "electronic",
			label: "Electronic",
			count: 1,
			albums: [
				{
					position: 1,
					albumName: "Multi Genre",
					artistName: "Artist",
					throughGenres: ["Electronic"],
				},
			],
		},
		{
			genreKey: "pop",
			label: "Pop",
			count: 1,
			albums: [
				{
					position: 1,
					albumName: "Multi Genre",
					artistName: "Artist",
					throughGenres: ["Pop"],
				},
			],
		},
	]);
	assert.equal(summary.albumsWithGenreData, 1);
});

test("buildRobRankingGenreCountSummary records the direct genres that contributed each album row", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2022,
		totalAlbums: 1,
		albumTopLevelGenres: [
			{
				album: { position: 1, albumName: "Source Album", artistName: "Artist" },
				genres: [
					{ key: "pop", label: "Pop", throughGenreLabel: "Art Pop" },
					{ key: "pop", label: "Pop", throughGenreLabel: "Pop Soul" },
					{ key: "r&b", label: "R&B", throughGenreLabel: "Pop Soul" },
				],
			},
		],
	});

	assert.deepEqual(summary.genres, [
		{
			genreKey: "pop",
			label: "Pop",
			count: 1,
			albums: [
				{
					position: 1,
					albumName: "Source Album",
					artistName: "Artist",
					throughGenres: ["Art Pop", "Pop Soul"],
				},
			],
		},
		{
			genreKey: "r&b",
			label: "R&B",
			count: 1,
			albums: [
				{
					position: 1,
					albumName: "Source Album",
					artistName: "Artist",
					throughGenres: ["Pop Soul"],
				},
			],
		},
	]);
});

test("buildRobRankingGenreCountSummary computes missing genre data from total albums and coverage", () => {
	const summary = buildRobRankingGenreCountSummary({
		year: 2021,
		totalAlbums: 5,
		albumTopLevelGenres: [
			{
				album: { position: 1, albumName: "Rock Album", artistName: "Artist" },
				genres: [{ key: "rock", label: "Rock" }],
			},
			{ genres: [] },
			{
				album: { position: 3, albumName: "Pop Album", artistName: "Artist" },
				genres: [{ key: "pop", label: "Pop" }],
			},
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
			{ genres: [{ key: "soul", label: "Soul" }] },
			{ genres: [{ key: "ambient", label: "Ambient" }] },
			{ genres: [{ key: "rock", label: "Rock" }] },
			{ genres: [{ key: "rock", label: "Rock" }] },
			{ genres: [{ key: "ambient", label: "Ambient" }] },
		],
	});

	assert.deepEqual(
		summary.genres.map(({ genreKey, label, count }) => ({
			genreKey,
			label,
			count,
		})),
		[
			{ genreKey: "ambient", label: "Ambient", count: 2 },
			{ genreKey: "rock", label: "Rock", count: 2 },
			{ genreKey: "soul", label: "Soul", count: 1 },
		],
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	matchGeniusSongToSpotifyTrack,
	mergeSpotifyAlbumTrackDurations,
	normalizeTrackTitleForMatch,
	parseSpotifyAlbumRawDataTracks,
} from "./geniusSpotifyTrackDurations";

const spotifyTracks = [
	{ trackNumber: 1, trackName: "Theme", durationSeconds: 94 },
	{ trackNumber: 2, trackName: "Cold Blooded", durationSeconds: 183 },
	{ trackNumber: 3, trackName: "Fkn Dead", durationSeconds: 205 },
];

test("normalizeTrackTitleForMatch lowercases and collapses whitespace", () => {
	assert.equal(
		normalizeTrackTitleForMatch("  Cold   Blooded  "),
		"cold blooded",
	);
});

test("matchGeniusSongToSpotifyTrack prefers track number", () => {
	assert.deepEqual(
		matchGeniusSongToSpotifyTrack(
			{
				trackNumber: 2,
				songTitle: "Different Scraped Title",
				songTitleOverride: undefined,
			},
			spotifyTracks,
		),
		spotifyTracks[1],
	);
});

test("matchGeniusSongToSpotifyTrack falls back to normalized title", () => {
	assert.deepEqual(
		matchGeniusSongToSpotifyTrack(
			{
				trackNumber: 99,
				songTitle: "FKN DEAD",
				songTitleOverride: undefined,
			},
			spotifyTracks,
		),
		spotifyTracks[2],
	);
});

test("matchGeniusSongToSpotifyTrack uses title override when present", () => {
	assert.deepEqual(
		matchGeniusSongToSpotifyTrack(
			{
				trackNumber: 99,
				songTitle: "Wrong Title",
				songTitleOverride: "Theme",
			},
			spotifyTracks,
		),
		spotifyTracks[0],
	);
});

test("mergeSpotifyAlbumTrackDurations prefers canonical durations over rawData", () => {
	assert.deepEqual(
		mergeSpotifyAlbumTrackDurations(
			[{ trackNumber: 1, trackName: "Theme", durationSeconds: 94 }],
			[{ trackNumber: 1, trackName: "Theme", durationSeconds: 90 }],
		),
		[{ trackNumber: 1, trackName: "Theme", durationSeconds: 94 }],
	);
});

test("parseSpotifyAlbumRawDataTracks reads track durations from album rawData", () => {
	const rawData = JSON.stringify({
		tracks: {
			items: [
				{ name: "Theme", track_number: 1, duration_ms: 94000 },
				{ name: "Cold Blooded", track_number: 2, duration_ms: 183000 },
			],
		},
	});

	assert.deepEqual(parseSpotifyAlbumRawDataTracks(rawData), [
		{ trackNumber: 1, trackName: "Theme", durationSeconds: 94 },
		{ trackNumber: 2, trackName: "Cold Blooded", durationSeconds: 183 },
	]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildForLaterPlaylistAlbums } from "./forLaterAlbums";

test("buildForLaterPlaylistAlbums sums duration_ms per album", () => {
	const result = buildForLaterPlaylistAlbums([
		{
			added_at: "2024-01-01T00:00:00.000Z",
			track: {
				id: "track-a",
				duration_ms: 180_000,
				album: { id: "album-1" },
			},
		},
		{
			added_at: "2024-01-02T00:00:00.000Z",
			track: {
				id: "track-b",
				duration_ms: 240_000,
				album: { id: "album-1" },
			},
		},
		{
			added_at: "2024-01-03T00:00:00.000Z",
			track: {
				id: "track-c",
				duration_ms: 300_000,
				album: { id: "album-2" },
			},
		},
	]);

	assert.equal(result.length, 2);
	const album1 = result.find((album) => album.spotifyAlbumId === "album-1");
	const album2 = result.find((album) => album.spotifyAlbumId === "album-2");
	assert.equal(album1?.totalDurationMs, 420_000);
	assert.equal(album2?.totalDurationMs, 300_000);
});

test("buildForLaterPlaylistAlbums treats missing duration_ms as zero", () => {
	const result = buildForLaterPlaylistAlbums([
		{
			added_at: "2024-01-01T00:00:00.000Z",
			track: {
				id: "track-a",
				album: { id: "album-1" },
			},
		},
		{
			added_at: "2024-01-02T00:00:00.000Z",
			track: {
				id: "track-b",
				duration_ms: 120_000,
				album: { id: "album-1" },
			},
		},
	]);

	assert.equal(result.length, 1);
	assert.equal(result[0]?.totalDurationMs, 120_000);
});

test("buildForLaterPlaylistAlbums dedupes playlist tracks by Spotify album id", () => {
	const result = buildForLaterPlaylistAlbums([
		{
			added_at: "2024-01-01T00:00:00.000Z",
			track: {
				id: "track-a",
				duration_ms: 100_000,
				album: { id: "album-1" },
			},
		},
		{
			added_at: "2024-01-02T00:00:00.000Z",
			track: {
				id: "track-a",
				duration_ms: 100_000,
				album: { id: "album-1" },
			},
		},
	]);

	assert.equal(result.length, 1);
	assert.deepEqual(result[0]?.sourceTrackIds, ["track-a"]);
	assert.equal(result[0]?.totalDurationMs, 200_000);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildSpotifyAlbumListItems } from "./spotify-album-list";

test("buildSpotifyAlbumListItems omits heavy rawData and sorts newest first", () => {
	const albums = [
		{
			_id: "album_1",
			_creationTime: 1,
			spotifyAlbumId: "spotify_1",
			name: "Older Album",
			artistName: "Artist One",
			imageUrl: "https://example.com/older.jpg",
			releaseDate: "2023-01-01",
			totalTracks: 10,
			rawData: "x".repeat(5_000),
			createdAt: 100,
			updatedAt: 100,
		},
		{
			_id: "album_2",
			_creationTime: 2,
			spotifyAlbumId: "spotify_2",
			name: "Newer Album",
			artistName: "Artist Two",
			imageUrl: "https://example.com/newer.jpg",
			releaseDate: "2024-01-01",
			totalTracks: 12,
			rawData: "y".repeat(5_000),
			createdAt: 200,
			updatedAt: 200,
		},
	];

	const result = buildSpotifyAlbumListItems(albums);

	const newest = result[0];
	const oldest = result[1];
	assert.ok(newest);
	assert.ok(oldest);
	assert.equal(newest.name, "Newer Album");
	assert.equal(oldest.name, "Older Album");
	assert.equal("rawData" in newest, false);
	assert.equal("updatedAt" in newest, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseSpotifyAlbumId } from "./parse-spotify-album-id";

test("parseSpotifyAlbumId extracts ID from open.spotify.com URLs", () => {
	assert.equal(
		parseSpotifyAlbumId("https://open.spotify.com/album/4aawyAB9vmqNehf3FNRq"),
		"4aawyAB9vmqNehf3FNRq",
	);
});

test("parseSpotifyAlbumId extracts ID from spotify:album URIs", () => {
	assert.equal(
		parseSpotifyAlbumId("spotify:album:4aawyAB9vmqNehf3FNRq"),
		"4aawyAB9vmqNehf3FNRq",
	);
});

test("parseSpotifyAlbumId returns plain IDs unchanged", () => {
	assert.equal(parseSpotifyAlbumId("4aawyAB9vmqNehf3FNRq"), "4aawyAB9vmqNehf3FNRq");
});

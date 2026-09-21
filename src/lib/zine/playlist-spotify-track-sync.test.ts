import assert from "node:assert/strict";
import test from "node:test";
import {
	matchPlaylistItemsToSpotifyTracks,
	stripTrackTitleDecorations,
} from "./playlist-spotify-track-sync";

test("stripTrackTitleDecorations removes remaster parentheticals", () => {
	assert.equal(
		stripTrackTitleDecorations("Everything In Its Right Place (Remastered)"),
		"everything in its right place",
	);
});

test("matchPlaylistItemsToSpotifyTracks matches by title and returns duration + art", () => {
	const result = matchPlaylistItemsToSpotifyTracks({
		items: [
			{ itemId: "a", title: "Kid A" },
			{ itemId: "b", title: "Idioteque (Remastered)" },
			{ itemId: "c", title: "Missing Song" },
		],
		tracks: [
			{
				name: "Kid A",
				durationMs: 272000,
				albumArtUrl: "https://example.com/kid-a.jpg",
			},
			{
				name: "Idioteque",
				durationMs: 309500,
				albumArtUrl: "https://example.com/amnesiac.jpg",
			},
			{
				name: "Extra Track",
				durationMs: 120000,
			},
		],
	});

	assert.equal(result.matches.length, 2);
	assert.deepEqual(result.matches[0], {
		itemId: "a",
		durationSeconds: 272,
		albumArtUrl: "https://example.com/kid-a.jpg",
	});
	assert.deepEqual(result.matches[1], {
		itemId: "b",
		durationSeconds: 310,
		albumArtUrl: "https://example.com/amnesiac.jpg",
	});
	assert.equal(result.unmatchedItemCount, 1);
	assert.equal(result.unmatchedTrackCount, 1);
});

test("matchPlaylistItemsToSpotifyTracks does not reuse the same Spotify track twice", () => {
	const result = matchPlaylistItemsToSpotifyTracks({
		items: [
			{ itemId: "one", title: "Hello" },
			{ itemId: "two", title: "Hello" },
		],
		tracks: [{ name: "Hello", durationMs: 180000 }],
	});

	assert.equal(result.matches.length, 1);
	assert.equal(result.matches[0]?.itemId, "one");
	assert.equal(result.unmatchedItemCount, 1);
});

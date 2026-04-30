import assert from "node:assert/strict";
import test from "node:test";
import {
	buildPlaylistSongDisplay,
	normalizeGeniusSongUrl,
	sortPlaylistItems,
} from "./playlistLyrics";

test("normalizeGeniusSongUrl strips query string and hash", () => {
	const result = normalizeGeniusSongUrl(
		"https://genius.com/Kendrick-lamar-squabble-up-lyrics?utm_source=test#annotations",
	);

	assert.equal(result, "https://genius.com/Kendrick-lamar-squabble-up-lyrics");
});

test("normalizeGeniusSongUrl accepts www.genius.com and returns genius.com", () => {
	const result = normalizeGeniusSongUrl(
		"https://www.genius.com/Charli-xcx-360-lyrics/",
	);

	assert.equal(result, "https://genius.com/Charli-xcx-360-lyrics");
});

test("normalizeGeniusSongUrl rejects non-Genius URLs", () => {
	assert.throws(
		() => normalizeGeniusSongUrl("https://example.com/Song-lyrics"),
		/URL must be from genius.com/,
	);
});

test("normalizeGeniusSongUrl rejects Genius non-lyrics pages", () => {
	assert.throws(
		() => normalizeGeniusSongUrl("https://genius.com/albums/Charli-xcx/Brat"),
		/URL must be a Genius song lyrics page/,
	);
});

test("buildPlaylistSongDisplay uses overrides without mutating scrape defaults", () => {
	const scrape = {
		songTitle: "Default Title",
		artistName: "Default Artist",
		albumTitle: "Default Album",
	};
	const item = {
		songTitleOverride: "Override Title",
		artistNameOverride: "Override Artist",
		albumTitleOverride: "Override Album",
	};

	const result = buildPlaylistSongDisplay({ scrape, item });

	assert.deepEqual(result, {
		songTitle: "Override Title",
		artistName: "Override Artist",
		albumTitle: "Override Album",
	});
	assert.deepEqual(scrape, {
		songTitle: "Default Title",
		artistName: "Default Artist",
		albumTitle: "Default Album",
	});
});

test("sortPlaylistItems orders by position ascending", () => {
	const items = [
		{ id: "third", position: 30 },
		{ id: "first", position: 10 },
		{ id: "second", position: 20 },
	];

	const result = sortPlaylistItems(items);

	assert.deepEqual(
		result.map((item) => item.id),
		["first", "second", "third"],
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeZinePageRecommendations } from "./zinePageRecommendations";

test("normalizeZinePageRecommendations trims and keeps draft empty items", () => {
	const result = normalizeZinePageRecommendations([
		{
			albumTitle: " Kid A ",
			artistName: " Radiohead ",
			imageUrl: " https://example.com/kid-a.jpg ",
			pitch: "  Icy electronics with a wounded heart.  ",
			year: " 2000 ",
			spotifyAlbumId: " abc ",
		},
		{ albumTitle: "  ", artistName: "Skip" },
		{ albumTitle: "Amnesiac", artistName: "  " },
	]);

	assert.equal(result.length, 3);
	assert.deepEqual(result[0], {
		albumTitle: "Kid A",
		artistName: "Radiohead",
		imageUrl: "https://example.com/kid-a.jpg",
		pitch: "Icy electronics with a wounded heart.",
		year: "2000",
		spotifyAlbumId: "abc",
	});
	assert.deepEqual(result[1], {
		albumTitle: "",
		artistName: "Skip",
		imageUrl: undefined,
		pitch: undefined,
		year: undefined,
		spotifyAlbumId: undefined,
	});
	assert.deepEqual(result[2], {
		albumTitle: "Amnesiac",
		artistName: "",
		imageUrl: undefined,
		pitch: undefined,
		year: undefined,
		spotifyAlbumId: undefined,
	});
});

test("normalizeZinePageRecommendations caps at four items", () => {
	const result = normalizeZinePageRecommendations([
		{ albumTitle: "A", artistName: "One" },
		{ albumTitle: "B", artistName: "Two" },
		{ albumTitle: "C", artistName: "Three" },
		{ albumTitle: "D", artistName: "Four" },
		{ albumTitle: "E", artistName: "Five" },
	]);

	assert.equal(result.length, 4);
	assert.equal(result[3]?.albumTitle, "D");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	ZINE_PAGE_RECOMMENDATION_LIMITS,
	getPageRecommendationLayout,
	getVisiblePageRecommendations,
	isPageRecommendationVisible,
	resolveSongPageRecommendations,
} from "./zine-page-recommendations";

test("page recommendation limits cap at four", () => {
	assert.equal(ZINE_PAGE_RECOMMENDATION_LIMITS.maxItems, 4);
});

test("two recommendations use a pair row", () => {
	assert.equal(getPageRecommendationLayout(2), "pair");
	assert.equal(getPageRecommendationLayout(1), "stack");
	assert.equal(getPageRecommendationLayout(3), "stack");
});

test("visible recommendations require title and artist", () => {
	assert.equal(
		isPageRecommendationVisible({
			albumTitle: "Kid A",
			artistName: "Radiohead",
		}),
		true,
	);
	assert.equal(
		isPageRecommendationVisible({ albumTitle: "  ", artistName: "Radiohead" }),
		false,
	);
	assert.equal(
		isPageRecommendationVisible({ albumTitle: "Kid A", artistName: "  " }),
		false,
	);
});

test("getVisiblePageRecommendations drops blanks and caps at four", () => {
	const visible = getVisiblePageRecommendations([
		{ albumTitle: "  ", artistName: "X" },
		{ albumTitle: "A", artistName: "One" },
		{ albumTitle: "B", artistName: "Two" },
		{ albumTitle: "C", artistName: "Three" },
		{ albumTitle: "D", artistName: "Four" },
		{ albumTitle: "E", artistName: "Five" },
	]);

	assert.equal(visible.length, 4);
	assert.equal(visible[0]?.albumTitle, "A");
	assert.equal(visible[3]?.albumTitle, "D");
});

test("resolveSongPageRecommendations prefers track over global fallback", () => {
	const track = getVisiblePageRecommendations([
		{ albumTitle: "Track Rec", artistName: "A" },
	]);
	const global = getVisiblePageRecommendations([
		{ albumTitle: "Global Rec", artistName: "B" },
	]);

	assert.equal(
		resolveSongPageRecommendations(track, global)[0]?.albumTitle,
		"Track Rec",
	);
	assert.equal(
		resolveSongPageRecommendations([], global)[0]?.albumTitle,
		"Global Rec",
	);
	assert.equal(resolveSongPageRecommendations([], []).length, 0);
});

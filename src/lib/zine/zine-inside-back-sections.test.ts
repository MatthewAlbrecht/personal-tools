import assert from "node:assert/strict";
import test from "node:test";
import {
	ZINE_INSIDE_BACK_LIMITS,
	hasInsideBackContent,
} from "./zine-inside-back-sections";

test("hasInsideBackContent is false when sections empty", () => {
	assert.equal(hasInsideBackContent([]), false);
});

test("hasInsideBackContent is true when a discography item has album title", () => {
	assert.equal(
		hasInsideBackContent([
			{
				type: "discography",
				items: [{ albumTitle: "OK Computer", blurb: "Their best." }],
			},
		]),
		true,
	);
});

test("hasInsideBackContent ignores items with blank album title", () => {
	assert.equal(
		hasInsideBackContent([
			{
				type: "recommendations",
				items: [{ albumTitle: "  ", artistName: "Radiohead" }],
			},
		]),
		false,
	);
});

test("limits match spec caps", () => {
	assert.equal(ZINE_INSIDE_BACK_LIMITS.maxSections, 4);
	assert.equal(ZINE_INSIDE_BACK_LIMITS.maxDiscographyItems, 6);
	assert.equal(ZINE_INSIDE_BACK_LIMITS.maxRecommendationItems, 4);
});

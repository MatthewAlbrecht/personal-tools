import assert from "node:assert/strict";
import test from "node:test";
import { parseBandcampReleaseDate } from "./bandcampReleaseDate";

test("parseBandcampReleaseDate parses full month day year", () => {
	assert.equal(
		parseBandcampReleaseDate("released May 6, 2026"),
		"2026-05-06",
	);
});

test("parseBandcampReleaseDate falls back to year", () => {
	assert.equal(parseBandcampReleaseDate("released 2024"), "2024");
});

test("parseBandcampReleaseDate returns undefined for garbage", () => {
	assert.equal(parseBandcampReleaseDate("coming soon"), undefined);
});

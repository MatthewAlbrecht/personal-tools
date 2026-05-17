import assert from "node:assert/strict";
import test from "node:test";
import {
	buildFilterDescriptorKeysSorted,
	buildFilterGenreKeysSorted,
	buildFilterSearchText,
	parseReleaseYearFromIsoDate,
} from "./forLaterFilterProjection";

test("parseReleaseYearFromIsoDate reads YYYY prefix", () => {
	assert.equal(parseReleaseYearFromIsoDate("1972-03-01"), 1972);
	assert.equal(parseReleaseYearFromIsoDate("72-03-01"), undefined);
	assert.equal(parseReleaseYearFromIsoDate(undefined), undefined);
});

test("buildFilterGenreKeysSorted merges primary and secondary keys sorted unique", () => {
	assert.deepEqual(
		buildFilterGenreKeysSorted(
			[{ key: "z" }, { key: "a" }],
			[{ key: "m" }, { key: "a" }],
		),
		["a", "m", "z"],
	);
});

test("buildFilterDescriptorKeysSorted sorts unique", () => {
	assert.deepEqual(
		buildFilterDescriptorKeysSorted([{ key: "b" }, { key: "a" }, { key: "b" }]),
		["a", "b"],
	);
});

test("buildFilterSearchText joins trimmed album + artist", () => {
	assert.equal(
		buildFilterSearchText({ albumName: "  Hi  ", artistName: " Bye " }),
		"Hi\nBye",
	);
});

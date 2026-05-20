import assert from "node:assert/strict";
import test from "node:test";
import {
	buildDirectFilterGenreKeys,
	buildFilterDescriptorKeysSorted,
	buildFilterGenreKeysSortedWithAncestors,
	buildFilterSearchText,
	parseReleaseYearFromIsoDate,
} from "./forLaterFilterProjection";
import { buildParentKeysByChildKey } from "./rymGenreHierarchy";

test("parseReleaseYearFromIsoDate reads YYYY prefix", () => {
	assert.equal(parseReleaseYearFromIsoDate("1972-03-01"), 1972);
	assert.equal(parseReleaseYearFromIsoDate("72-03-01"), undefined);
	assert.equal(parseReleaseYearFromIsoDate(undefined), undefined);
});

test("buildDirectFilterGenreKeys merges primary and secondary keys sorted unique", () => {
	assert.deepEqual(
		buildDirectFilterGenreKeys(
			[{ key: "z" }, { key: "a" }],
			[{ key: "m" }, { key: "a" }],
		),
		["a", "m", "z"],
	);
});

test("buildFilterGenreKeysSortedWithAncestors adds parent keys for filters", () => {
	const parentKeysByChild = buildParentKeysByChildKey([
		{ parentKey: "blues", childKey: "acoustic blues" },
	]);

	assert.deepEqual(
		buildFilterGenreKeysSortedWithAncestors(
			["acoustic blues"],
			parentKeysByChild,
		),
		["acoustic blues", "blues"],
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

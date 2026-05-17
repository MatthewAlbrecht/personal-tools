import assert from "node:assert/strict";
import test from "node:test";
import { parseForLaterFilters, serializeForLaterFilters } from "./filter-state";

test("parseForLaterFilters returns defaults for an empty query", () => {
	assert.deepEqual(parseForLaterFilters(new URLSearchParams()), {
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		filterMatch: "all",
	});
});

test("parseForLaterFilters lowercases genre and descriptor URL params", () => {
	const params = new URLSearchParams("genre=Slowcore&descriptor=Melancholic");
	assert.deepEqual(parseForLaterFilters(params).genreKeys, ["slowcore"]);
	assert.deepEqual(parseForLaterFilters(params).descriptorKeys, ["melancholic"]);
});

test("parseForLaterFilters reads q, genres, descriptors, and match mode", () => {
	const params = new URLSearchParams(
		"genre=slowcore&genre=ambient&descriptor=melancholic&descriptor=sparse&q=blue+note&year=1971&listened=not_listened&rymStatus=has_candidate&match=any",
	);

	assert.deepEqual(parseForLaterFilters(params), {
		genreKeys: ["ambient", "slowcore"],
		descriptorKeys: ["melancholic", "sparse"],
		search: "blue note",
		year: 1971,
		listened: "not_listened",
		rymStatus: "has_candidate",
		filterMatch: "any",
	});
});

test("parseForLaterFilters merges legacy title and artist into search when q absent", () => {
	const params = new URLSearchParams("title=Blue&artist=Note");

	assert.deepEqual(parseForLaterFilters(params).search, "Blue Note");
});

test("serializeForLaterFilters omits default values", () => {
	const params = serializeForLaterFilters({
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		filterMatch: "all",
	});

	assert.equal(params.toString(), "");
});

test("serializeForLaterFilters repeats genre and descriptor keys and sets q", () => {
	const params = serializeForLaterFilters({
		genreKeys: ["ambient", "slowcore"],
		descriptorKeys: ["melancholic"],
		search: "coltrane",
		year: undefined,
		listened: "all",
		rymStatus: "all",
		filterMatch: "any",
	});

	const next = new URLSearchParams(params.toString());
	assert.deepEqual(next.getAll("genre"), ["ambient", "slowcore"]);
	assert.deepEqual(next.getAll("descriptor"), ["melancholic"]);
	assert.equal(next.get("q"), "coltrane");
	assert.equal(next.get("match"), "any");
});

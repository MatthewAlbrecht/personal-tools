import assert from "node:assert/strict";
import test from "node:test";
import { parseForLaterFilters, serializeForLaterFilters } from "./filter-state";

test("parseForLaterFilters returns defaults for an empty query", () => {
	assert.deepEqual(parseForLaterFilters(new URLSearchParams()), {
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		yearMin: undefined,
		yearMax: undefined,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
		durationBucketKey: undefined,
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});
});

test("parseForLaterFilters lowercases genre and descriptor URL params", () => {
	const params = new URLSearchParams("genre=Slowcore&descriptor=Melancholic");
	assert.deepEqual(parseForLaterFilters(params).genreKeys, ["slowcore"]);
	assert.deepEqual(parseForLaterFilters(params).descriptorKeys, [
		"melancholic",
	]);
});

test("parseForLaterFilters reads q, genres, descriptors, and taxonomy match modes", () => {
	const params = new URLSearchParams(
		"genre=slowcore&genre=ambient&descriptor=melancholic&descriptor=sparse&q=blue+note&yearMin=1971&yearMax=1971&listened=not_listened&rymStatus=not_on_rym&genreMatch=any&descriptorMatch=all",
	);

	assert.deepEqual(parseForLaterFilters(params), {
		genreKeys: ["ambient", "slowcore"],
		descriptorKeys: ["melancholic", "sparse"],
		search: "blue note",
		yearMin: 1971,
		yearMax: 1971,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
		durationBucketKey: undefined,
		listened: "not_listened",
		rymStatus: "not_on_rym",
		genreMatch: "any",
		descriptorMatch: "all",
	});
});

test("parseForLaterFilters legacy match applies when genreMatch and descriptorMatch omitted", () => {
	const params = new URLSearchParams("match=any");
	assert.equal(parseForLaterFilters(params).genreMatch, "any");
	assert.equal(parseForLaterFilters(params).descriptorMatch, "any");
});

test("parseForLaterFilters reads durationMin and durationMax URL params", () => {
	const params = new URLSearchParams("durationMin=35&durationMax=55");
	assert.deepEqual(parseForLaterFilters(params), {
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		yearMin: undefined,
		yearMax: undefined,
		durationMinMinutes: 35,
		durationMaxMinutes: 55,
		durationBucketKey: undefined,
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
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
		yearMin: undefined,
		yearMax: undefined,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
		durationBucketKey: undefined,
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});

	assert.equal(params.toString(), "");
});

test("parseForLaterFilters maps legacy year param to min and max", () => {
	const params = new URLSearchParams("year=1984");
	assert.deepEqual(parseForLaterFilters(params), {
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		yearMin: 1984,
		yearMax: 1984,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
		durationBucketKey: undefined,
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});
});

test("serializeForLaterFilters writes yearMin and yearMax", () => {
	const params = serializeForLaterFilters({
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		yearMin: 1970,
		yearMax: 1979,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
		durationBucketKey: undefined,
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});
	assert.equal(params.get("yearMin"), "1970");
	assert.equal(params.get("yearMax"), "1979");
});

test("parseForLaterFilters reads durationBucket URL param", () => {
	const params = new URLSearchParams("durationBucket=40_50");
	assert.equal(parseForLaterFilters(params).durationBucketKey, "40_50");
});

test("serializeForLaterFilters writes durationBucket", () => {
	const params = serializeForLaterFilters({
		genreKeys: [],
		descriptorKeys: [],
		search: undefined,
		yearMin: undefined,
		yearMax: undefined,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
		durationBucketKey: "50_60",
		listened: "all",
		rymStatus: "all",
		genreMatch: "all",
		descriptorMatch: "all",
	});
	assert.equal(params.get("durationBucket"), "50_60");
});

test("serializeForLaterFilters repeats genre and descriptor keys and sets q", () => {
	const params = serializeForLaterFilters({
		genreKeys: ["ambient", "slowcore"],
		descriptorKeys: ["melancholic"],
		search: "coltrane",
		yearMin: undefined,
		yearMax: undefined,
		durationMinMinutes: 35,
		durationMaxMinutes: 55,
		listened: "all",
		rymStatus: "all",
		genreMatch: "any",
		descriptorMatch: "all",
	});

	const next = new URLSearchParams(params.toString());
	assert.deepEqual(next.getAll("genre"), ["ambient", "slowcore"]);
	assert.deepEqual(next.getAll("descriptor"), ["melancholic"]);
	assert.equal(next.get("q"), "coltrane");
	assert.equal(next.get("genreMatch"), "any");
	assert.equal(next.get("descriptorMatch"), null);
	assert.equal(next.get("durationMin"), "35");
	assert.equal(next.get("durationMax"), "55");
});

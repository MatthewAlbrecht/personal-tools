import assert from "node:assert/strict";
import test from "node:test";
import { parseForLaterFilters, serializeForLaterFilters } from "./filter-state";

test("parseForLaterFilters returns Phase 4 defaults for an empty query", () => {
	assert.deepEqual(parseForLaterFilters(new URLSearchParams()), {
		genreKey: undefined,
		genreRole: "either",
		descriptorKey: undefined,
		title: undefined,
		artist: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		playlist: "active",
	});
});

test("parseForLaterFilters reads all supported filters", () => {
	const params = new URLSearchParams(
		"genre=slowcore&genreRole=primary&descriptor=melancholic&title=blue&artist=joni&year=1971&listened=not_listened&rymStatus=has_candidate&playlist=all",
	);

	assert.deepEqual(parseForLaterFilters(params), {
		genreKey: "slowcore",
		genreRole: "primary",
		descriptorKey: "melancholic",
		title: "blue",
		artist: "joni",
		year: 1971,
		listened: "not_listened",
		rymStatus: "has_candidate",
		playlist: "all",
	});
});

test("serializeForLaterFilters omits default values", () => {
	const params = serializeForLaterFilters({
		genreKey: undefined,
		genreRole: "either",
		descriptorKey: undefined,
		title: undefined,
		artist: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		playlist: "active",
	});

	assert.equal(params.toString(), "");
});

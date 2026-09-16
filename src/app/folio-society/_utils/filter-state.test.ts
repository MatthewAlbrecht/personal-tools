import assert from "node:assert/strict";
import test from "node:test";
import { parseFolioFilters, serializeFolioFilters } from "./filter-state";

const DEFAULT_FILTERS = {
	search: undefined,
	owned: false,
	want: false,
	le: false,
	signed: false,
	thisYear: false,
	coming: false,
	bundles: false,
};

test("parseFolioFilters returns defaults for empty params", () => {
	assert.deepEqual(parseFolioFilters(new URLSearchParams()), DEFAULT_FILTERS);
});

test("parseFolioFilters reads owned and want flags", () => {
	const params = new URLSearchParams("owned=1&want=1");

	assert.deepEqual(parseFolioFilters(params), {
		...DEFAULT_FILTERS,
		owned: true,
		want: true,
	});
});

test("serializeFolioFilters round-trips owned and want", () => {
	const filters = {
		...DEFAULT_FILTERS,
		owned: true,
		want: true,
	};
	const serialized = serializeFolioFilters(filters);

	assert.equal(serialized.get("owned"), "1");
	assert.equal(serialized.get("want"), "1");
	assert.deepEqual(parseFolioFilters(serialized), filters);
});

test("serializeFolioFilters omits bundles when false", () => {
	const params = serializeFolioFilters(DEFAULT_FILTERS);

	assert.equal(params.get("bundles"), null);
	assert.equal(params.toString(), "");
});

test("parseFolioFilters reads search from q", () => {
	const params = new URLSearchParams("q=murakami");

	assert.equal(parseFolioFilters(params).search, "murakami");
});

test("serializeFolioFilters sets q and omits empty search", () => {
	const withSearch = serializeFolioFilters({
		...DEFAULT_FILTERS,
		search: "kafka",
	});
	const withoutSearch = serializeFolioFilters(DEFAULT_FILTERS);

	assert.equal(withSearch.get("q"), "kafka");
	assert.equal(withoutSearch.get("q"), null);
});

test("serializeFolioFilters writes true flags as 1 and omits defaults", () => {
	const params = serializeFolioFilters({
		...DEFAULT_FILTERS,
		le: true,
		signed: true,
		thisYear: true,
		coming: true,
		bundles: true,
	});

	assert.equal(params.get("le"), "1");
	assert.equal(params.get("signed"), "1");
	assert.equal(params.get("thisYear"), "1");
	assert.equal(params.get("coming"), "1");
	assert.equal(params.get("bundles"), "1");
	assert.equal(params.get("owned"), null);
});

test("parseFolioFilters ignores non-1 flag values", () => {
	const params = new URLSearchParams("owned=0&want=yes&bundles=true");

	assert.deepEqual(parseFolioFilters(params), DEFAULT_FILTERS);
});

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForLaterFilters } from "./forLaterAlbumsUi";
import { chooseIndexedForLaterListScan } from "./forLaterIndexedList";

test("year wins over listened and rym", () => {
	const choice = chooseIndexedForLaterListScan(
		normalizeForLaterFilters({
			yearMin: 1999,
			yearMax: 1999,
			listened: "listened",
			rymStatus: "has_scrape",
		}),
	);
	assert.deepEqual(choice, { kind: "year", year: 1999 });
});

test("year range uses default indexed scan", () => {
	const choice = chooseIndexedForLaterListScan(
		normalizeForLaterFilters({
			yearMin: 1970,
			yearMax: 1979,
		}),
	);
	assert.deepEqual(choice, { kind: "default" });
});

test("listened wins over rym when no year", () => {
	const choice = chooseIndexedForLaterListScan(
		normalizeForLaterFilters({
			listened: "not_listened",
			rymStatus: "has_scrape",
		}),
	);
	assert.deepEqual(choice, { kind: "listened", value: false });
});

test("not_on_rym uses default indexed scan", () => {
	assert.deepEqual(
		chooseIndexedForLaterListScan(
			normalizeForLaterFilters({ rymStatus: "not_on_rym" }),
		),
		{ kind: "default" },
	);
});

test("rymMatched facet when listened all", () => {
	assert.deepEqual(
		chooseIndexedForLaterListScan(
			normalizeForLaterFilters({ rymStatus: "no_scrape" }),
		),
		{ kind: "rymMatched", value: false },
	);
});

test("default filters choose default indexed scan", () => {
	assert.deepEqual(
		chooseIndexedForLaterListScan(normalizeForLaterFilters({})),
		{ kind: "default" },
	);
});

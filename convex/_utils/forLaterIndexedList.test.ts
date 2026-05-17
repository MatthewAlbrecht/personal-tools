import assert from "node:assert/strict";
import test from "node:test";
import { normalizeForLaterFilters } from "./forLaterAlbumsUi";
import { chooseIndexedForLaterListScan } from "./forLaterIndexedList";

test("year wins over listened and rym", () => {
	const choice = chooseIndexedForLaterListScan(
		normalizeForLaterFilters({
			year: 1999,
			listened: "listened",
			rymStatus: "has_scrape",
		}),
	);
	assert.deepEqual(choice, { kind: "year", year: 1999 });
});

test("listened wins over rym when no year", () => {
	const choice = chooseIndexedForLaterListScan(
		normalizeForLaterFilters({
			listened: "not_listened",
			rymStatus: "has_candidate",
		}),
	);
	assert.deepEqual(choice, { kind: "listened", value: false });
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

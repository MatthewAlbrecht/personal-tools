import assert from "node:assert/strict";
import test from "node:test";
import {
	durationFiltersFromIndices,
	indicesFromDurationFilters,
} from "./duration-slider";

test("default both open", () => {
	assert.deepEqual(durationFiltersFromIndices(0, 71), {
		durationOpenLow: true,
		durationOpenHigh: true,
		durationMinMinutes: undefined,
		durationMaxMinutes: undefined,
	});
});

test("open low to 45", () => {
	const idx45 = 1 + (45 - 20); // 26
	assert.deepEqual(durationFiltersFromIndices(0, idx45), {
		durationOpenLow: true,
		durationOpenHigh: false,
		durationMinMinutes: undefined,
		durationMaxMinutes: 45,
	});
});

test("round-trip closed 30–60", () => {
	const low = 1 + (30 - 20);
	const high = 1 + (60 - 20);
	const filters = durationFiltersFromIndices(low, high);
	assert.deepEqual(indicesFromDurationFilters(filters), [low, high]);
});

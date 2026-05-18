import assert from "node:assert/strict";
import test from "node:test";
import {
	applyYearRangeClick,
	decadeBounds,
	formatYearRangeLabel,
	isDecadeFullyInSelection,
	isSingleDecadeFullySelected,
	isYearInSelection,
	selectionFromFilterBounds,
	selectionToFilterBounds,
} from "./year-range-selection";

const MAX_YEAR = 2026;

test("nothing selected then year click selects single year", () => {
	const next = applyYearRangeClick({}, { kind: "year", year: 1971 }, MAX_YEAR);
	assert.deepEqual(next, {
		min: 1971,
		max: 1971,
		lastClick: { kind: "year", year: 1971 },
	});
});

test("nothing selected then decade click selects full decade", () => {
	const next = applyYearRangeClick(
		{},
		{ kind: "decade", decadeStart: 1990 },
		MAX_YEAR,
	);
	assert.deepEqual(next, {
		min: 1990,
		max: 1999,
		lastClick: { kind: "decade", decadeStart: 1990 },
	});
});

test("current decade selects only through max year", () => {
	const next = applyYearRangeClick(
		{},
		{ kind: "decade", decadeStart: 2020 },
		MAX_YEAR,
	);
	assert.deepEqual(next, { min: 2020, max: 2026, lastClick: { kind: "decade", decadeStart: 2020 } });
});

test("one year selected then different year creates inclusive range", () => {
	const first = applyYearRangeClick({}, { kind: "year", year: 1971 }, MAX_YEAR);
	const next = applyYearRangeClick(first, { kind: "year", year: 1980 }, MAX_YEAR);
	assert.deepEqual(next, {
		min: 1971,
		max: 1980,
		lastClick: { kind: "year", year: 1980 },
	});
});

test("single decade fully selected then outside year extends range", () => {
	const decade = applyYearRangeClick(
		{},
		{ kind: "decade", decadeStart: 1990 },
		MAX_YEAR,
	);
	assert.equal(isSingleDecadeFullySelected(decade, MAX_YEAR), true);
	const next = applyYearRangeClick(decade, { kind: "year", year: 2005 }, MAX_YEAR);
	assert.deepEqual(next, {
		min: 1990,
		max: 2005,
		lastClick: { kind: "year", year: 2005 },
	});
});

test("single decade fully selected then outside decade extends range", () => {
	const decade = applyYearRangeClick(
		{},
		{ kind: "decade", decadeStart: 1980 },
		MAX_YEAR,
	);
	const next = applyYearRangeClick(
		decade,
		{ kind: "decade", decadeStart: 2000 },
		MAX_YEAR,
	);
	assert.deepEqual(next, {
		min: 1980,
		max: 2009,
		lastClick: { kind: "decade", decadeStart: 2000 },
	});
});

test("existing range then click resets to fresh single selection", () => {
	const range = { min: 1970, max: 1985, lastClick: { kind: "year", year: 1985 } as const };
	const next = applyYearRangeClick(range, { kind: "year", year: 2001 }, MAX_YEAR);
	assert.deepEqual(next, {
		min: 2001,
		max: 2001,
		lastClick: { kind: "year", year: 2001 },
	});
});

test("click same cell twice clears selection", () => {
	const first = applyYearRangeClick({}, { kind: "year", year: 1971 }, MAX_YEAR);
	const cleared = applyYearRangeClick(first, { kind: "year", year: 1971 }, MAX_YEAR);
	assert.deepEqual(cleared, {});
});

test("decade highlights when fully inside range", () => {
	const range = { min: 1985, max: 2005 };
	assert.equal(isDecadeFullyInSelection(1990, range, MAX_YEAR), true);
	assert.equal(isDecadeFullyInSelection(2000, range, MAX_YEAR), false);
	assert.equal(isDecadeFullyInSelection(2010, range, MAX_YEAR), false);
});

test("selection round-trips filter bounds", () => {
	assert.deepEqual(
		selectionToFilterBounds(selectionFromFilterBounds(1970, 1979)),
		{ yearMin: 1970, yearMax: 1979 },
	);
	assert.deepEqual(selectionToFilterBounds(selectionFromFilterBounds(1971)), {
		yearMin: 1971,
		yearMax: 1971,
	});
});

test("formatYearRangeLabel renders single year and ranges", () => {
	assert.equal(formatYearRangeLabel(1971, 1971), "1971");
	assert.equal(formatYearRangeLabel(1970, 1979), "1970–1979");
});

test("isYearInSelection respects inclusive bounds", () => {
	const range = { min: 1970, max: 1979 };
	assert.equal(isYearInSelection(1970, range), true);
	assert.equal(isYearInSelection(1980, range), false);
});

test("decadeBounds caps at max year", () => {
	assert.deepEqual(decadeBounds(2020, MAX_YEAR), { min: 2020, max: 2026 });
	assert.deepEqual(decadeBounds(1990, MAX_YEAR), { min: 1990, max: 1999 });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	calendarDateInTimeZone,
	computeStepDate,
	isValidBirthdayDate,
	nextBirthdayOccurrence,
	todayInMountainTime,
} from "./calendar";

test("isValidBirthdayDate rejects Feb 30 and accepts Feb 29", () => {
	assert.equal(isValidBirthdayDate(2, 30), false);
	assert.equal(isValidBirthdayDate(2, 29), true);
	assert.equal(isValidBirthdayDate(4, 31), false);
	assert.equal(isValidBirthdayDate(1, 31), true);
});

test("computeStepDate day_of and day_before", () => {
	assert.deepEqual(computeStepDate(7, 17, "day_of", 2026), {
		year: 2026,
		month: 7,
		day: 17,
	});
	assert.deepEqual(computeStepDate(7, 17, "day_before", 2026), {
		year: 2026,
		month: 7,
		day: 16,
	});
});

test("computeStepDate week is 7 days before", () => {
	assert.deepEqual(computeStepDate(7, 17, "week", 2026), {
		year: 2026,
		month: 7,
		day: 10,
	});
});

test("computeStepDate month clamps Jan 31 to Feb 28/29", () => {
	assert.deepEqual(computeStepDate(1, 31, "month", 2026), {
		year: 2025,
		month: 12,
		day: 31,
	});
	// Birthday Mar 31 → one month earlier = Feb 28 2026 (non-leap)
	assert.deepEqual(computeStepDate(3, 31, "month", 2026), {
		year: 2026,
		month: 2,
		day: 28,
	});
	assert.deepEqual(computeStepDate(3, 31, "month", 2024), {
		year: 2024,
		month: 2,
		day: 29,
	});
});

test("computeStepDate month for Jan 5 is Dec 5 prior year", () => {
	assert.deepEqual(computeStepDate(1, 5, "month", 2026), {
		year: 2025,
		month: 12,
		day: 5,
	});
});

test("todayInMountainTime uses America/Denver", () => {
	// 2026-07-17 18:00 UTC = noon MDT
	const noonMdt = Date.UTC(2026, 6, 17, 18, 0, 0);
	assert.deepEqual(todayInMountainTime(noonMdt), {
		year: 2026,
		month: 7,
		day: 17,
	});
	assert.deepEqual(
		calendarDateInTimeZone(noonMdt, "America/Denver"),
		todayInMountainTime(noonMdt),
	);
});

test("nextBirthdayOccurrence wraps to next year", () => {
	assert.deepEqual(
		nextBirthdayOccurrence(7, 17, { year: 2026, month: 7, day: 17 }),
		{ year: 2026, month: 7, day: 17 },
	);
	assert.deepEqual(
		nextBirthdayOccurrence(7, 17, { year: 2026, month: 7, day: 18 }),
		{ year: 2027, month: 7, day: 17 },
	);
});

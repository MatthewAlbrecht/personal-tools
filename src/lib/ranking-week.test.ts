import assert from "node:assert/strict";
import test from "node:test";
import { previousSundayUtcMs } from "./ranking-week";

function utcMs(
	year: number,
	month: number,
	day: number,
	hour = 0,
	minute = 0,
): number {
	return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

test("previousSundayUtcMs returns same Sunday at UTC midnight", () => {
	// 2026-03-08 is a Sunday
	const sundayMidnight = utcMs(2026, 3, 8);
	assert.equal(previousSundayUtcMs(sundayMidnight), sundayMidnight);
});

test("previousSundayUtcMs on Sunday afternoon returns that Sunday midnight", () => {
	const sundayNoon = utcMs(2026, 3, 8, 12, 30);
	const sundayMidnight = utcMs(2026, 3, 8);
	assert.equal(previousSundayUtcMs(sundayNoon), sundayMidnight);
});

test("previousSundayUtcMs on Monday returns prior Sunday midnight", () => {
	const monday = utcMs(2026, 3, 9, 8, 0);
	const priorSunday = utcMs(2026, 3, 8);
	assert.equal(previousSundayUtcMs(monday), priorSunday);
});

test("previousSundayUtcMs on Saturday returns prior Sunday midnight", () => {
	const saturday = utcMs(2026, 3, 14, 23, 59);
	const priorSunday = utcMs(2026, 3, 8);
	assert.equal(previousSundayUtcMs(saturday), priorSunday);
});

test("previousSundayUtcMs ignores time-of-day via UTC midnight floor", () => {
	const lateMonday = utcMs(2026, 1, 5, 23, 59);
	const priorSunday = utcMs(2026, 1, 4);
	assert.equal(previousSundayUtcMs(lateMonday), priorSunday);
});

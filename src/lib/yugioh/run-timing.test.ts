import { describe, expect, test } from "vitest";
import {
	type RunTiming,
	fullRunDue,
	hourOfWeek,
	learnRunTiming,
} from "./run-timing";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ZONE = "America/New_York";
/** Tuesday 20 October 2026, 8:00 AM in New York (EDT). */
const NOW = Date.UTC(2026, 9, 20, 12, 0);
/** Sunday 18 October 2026, 7:30 PM in New York: hour 19 of the week. */
const SUNDAY_EVENING = Date.UTC(2026, 9, 18, 23, 30);

describe("hour of the week", () => {
	test("counts from Sunday midnight in the time zone, on local time across DST", () => {
		expect(hourOfWeek(SUNDAY_EVENING, ZONE)).toBe(19);
		expect(hourOfWeek(NOW, ZONE)).toBe(2 * 24 + 8);
		// Sunday 8 November, after the clocks went back: 7:30 PM EST.
		expect(hourOfWeek(Date.UTC(2026, 10, 9, 0, 30), ZONE)).toBe(19);
	});
});

describe("learning busy hours", () => {
	const enough = { dataSince: NOW - 28 * DAY, timeZone: ZONE, now: NOW };
	const sundays = (count: number) =>
		Array.from({ length: count }, (_, week) => SUNDAY_EVENING - week * 7 * DAY);

	test("still learning until the first capture is 28 days old", () => {
		expect(
			learnRunTiming({
				...enough,
				dataSince: NOW - 27 * DAY,
				listedTimes: sundays(4),
			}),
		).toEqual({
			status: "learning",
			dataSince: NOW - 27 * DAY,
			timeZone: ZONE,
			busyHours: [],
		});
	});

	test("an hour is busy with 3 Listings in the 28 days, not 2", () => {
		expect(
			learnRunTiming({ ...enough, listedTimes: sundays(3) }).busyHours,
		).toEqual([19]);
		expect(
			learnRunTiming({ ...enough, listedTimes: sundays(2) }).busyHours,
		).toEqual([]);
	});

	test("Listings listed before the 28 days don't count", () => {
		const old = SUNDAY_EVENING - 5 * 7 * DAY;
		expect(
			learnRunTiming({
				...enough,
				listedTimes: [...sundays(2), old],
			}).busyHours,
		).toEqual([]);
	});

	test("an hour must be at least twice the average hour", () => {
		// 3 Listings in every hour of the week: nothing stands out.
		const everyHour = Array.from(
			{ length: 3 * 168 },
			(_, i) =>
				NOW - 30 * MINUTE - Math.floor(i / 3) * HOUR - (i % 3) * 7 * DAY,
		);
		expect(
			learnRunTiming({ ...enough, listedTimes: everyHour }).busyHours,
		).toEqual([]);
	});
});

describe("when a full run is due", () => {
	const learned: RunTiming = {
		status: "learned",
		dataSince: NOW - 30 * DAY,
		timeZone: ZONE,
		busyHours: [19],
	};
	const learning: RunTiming = { ...learned, status: "learning", busyHours: [] };

	test("every 3 hours while learning", () => {
		const due = (since: number) =>
			fullRunDue({ lastFullRunAt: NOW - since, timing: learning, now: NOW });
		expect(due(2 * HOUR + 50 * MINUTE)).toBe(false);
		expect(due(2 * HOUR + 55 * MINUTE)).toBe(true);
	});

	test("outside busy hours, two asks short of 6 hours, so an open run can't push it past 6", () => {
		const due = (since: number) =>
			fullRunDue({ lastFullRunAt: NOW - since, timing: learned, now: NOW });
		expect(due(5 * HOUR + 30 * MINUTE)).toBe(false);
		expect(due(5 * HOUR + 40 * MINUTE)).toBe(true);
	});

	test("hourly in a busy hour and the hour after, not the hour before", () => {
		const due = (now: number) =>
			fullRunDue({ lastFullRunAt: now - HOUR, timing: learned, now });
		expect(due(SUNDAY_EVENING - HOUR)).toBe(false);
		expect(due(SUNDAY_EVENING)).toBe(true);
		expect(due(SUNDAY_EVENING + HOUR)).toBe(true);
		expect(due(SUNDAY_EVENING + 2 * HOUR)).toBe(false);
	});
});

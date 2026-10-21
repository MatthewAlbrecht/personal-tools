import { describe, expect, test } from "vitest";
import {
	type RunTiming,
	fullRunDue,
	hourOfWeek,
	inOvernightPause,
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

	test("while learning, 2½ to 3¾ hours after the last, by its gap draw (half an ask's slack)", () => {
		const due = (since: number, gapDraw: number) =>
			fullRunDue({
				lastFullRunAt: NOW - since,
				gapDraw,
				timing: learning,
				now: NOW,
			});
		expect(due(2 * HOUR + 20 * MINUTE, 0)).toBe(false);
		expect(due(2 * HOUR + 25 * MINUTE, 0)).toBe(true);
		expect(due(3 * HOUR + 30 * MINUTE, 1)).toBe(false);
		expect(due(3 * HOUR + 40 * MINUTE, 1)).toBe(true);
		// The middle draw: 3 hours 7½ minutes.
		expect(due(3 * HOUR, 0.5)).toBe(false);
		expect(due(3 * HOUR + 5 * MINUTE, 0.5)).toBe(true);
	});

	test("outside busy hours, 5 hours to 5 hours 40, so an open run can't push it past 6", () => {
		const due = (since: number, gapDraw: number) =>
			fullRunDue({
				lastFullRunAt: NOW - since,
				gapDraw,
				timing: learned,
				now: NOW,
			});
		expect(due(4 * HOUR + 50 * MINUTE, 0)).toBe(false);
		expect(due(5 * HOUR, 0)).toBe(true);
		expect(due(5 * HOUR + 30 * MINUTE, 1)).toBe(false);
		expect(due(5 * HOUR + 40 * MINUTE, 1)).toBe(true);
	});

	test("in a busy hour and the hour after, 45 to 80 minutes apart; not the hour before", () => {
		const due = (now: number, since: number, gapDraw: number) =>
			fullRunDue({ lastFullRunAt: now - since, gapDraw, timing: learned, now });
		expect(due(SUNDAY_EVENING - HOUR, 80 * MINUTE, 0)).toBe(false);
		expect(due(SUNDAY_EVENING, 35 * MINUTE, 0)).toBe(false);
		expect(due(SUNDAY_EVENING, 40 * MINUTE, 0)).toBe(true);
		expect(due(SUNDAY_EVENING + HOUR, 70 * MINUTE, 1)).toBe(false);
		expect(due(SUNDAY_EVENING + HOUR, 75 * MINUTE, 1)).toBe(true);
		expect(due(SUNDAY_EVENING + 2 * HOUR, 80 * MINUTE, 0)).toBe(false);
	});

	test("none from 1 to 7 AM in my time zone, even past the cap or in a busy hour", () => {
		/** Wednesday 21 October 2026 in New York, at a local hour. */
		function wednesday(hour: number, minute = 0): number {
			return Date.UTC(2026, 9, 21, hour + 4, minute);
		}
		const busyAt3am: RunTiming = { ...learned, busyHours: [3 * 24 + 3] };
		const due = (now: number, timing: RunTiming) =>
			fullRunDue({ lastFullRunAt: now - 7 * HOUR, gapDraw: 0, timing, now });
		expect(due(wednesday(0, 50), learned)).toBe(true);
		expect(due(wednesday(1), learned)).toBe(false);
		expect(due(wednesday(3, 10), busyAt3am)).toBe(false);
		expect(due(wednesday(6, 50), learning)).toBe(false);
		// The first ask after 7 AM starts one.
		expect(due(wednesday(7), learned)).toBe(true);
		expect(
			fullRunDue({
				lastFullRunAt: null,
				gapDraw: 0,
				timing: learning,
				now: wednesday(4),
			}),
		).toBe(false);
	});

	test("the overnight pause follows the time zone", () => {
		// 3 AM in New York is midnight in Los Angeles.
		const at3amNewYork = Date.UTC(2026, 9, 21, 7, 0);
		expect(inOvernightPause(at3amNewYork, ZONE)).toBe(true);
		expect(inOvernightPause(at3amNewYork, "America/Los_Angeles")).toBe(false);
	});
});

import { describe, expect, test } from "vitest";
import {
	type RunSlot,
	dueSlot,
	localDate,
	planRunDay,
	takeSlot,
} from "./run-timing";

const ZONE = "America/New_York";

/** Draws handed out in order, as Math.random would. */
function drawsOf(...values: number[]): () => number {
	let next = 0;
	return () => {
		const value = values[next++];
		if (value === undefined) throw new Error("ran out of draws");
		return value;
	};
}

/** A local time on Wednesday 21 October 2026 in New York (EDT, UTC-4). */
function wednesday(hour: number, minute = 0): number {
	return Date.UTC(2026, 9, 21, hour + 4, minute);
}

describe("the local date", () => {
	test("is the calendar date in my time zone", () => {
		expect(localDate(wednesday(9), ZONE)).toBe("2026-10-21");
		// 11:30 PM Tuesday in New York is already Wednesday in UTC.
		expect(localDate(Date.UTC(2026, 9, 21, 3, 30), ZONE)).toBe("2026-10-20");
	});
});

describe("a day's plan of full runs", () => {
	test("the earliest first slot is 6 AM, then every 4 hours with no jitter at the middle draw", () => {
		const day = planRunDay("2026-10-21", ZONE, drawsOf(0, 0.5, 0.5, 0.5, 0.9));
		expect(day).toEqual({
			date: "2026-10-21",
			timeZone: ZONE,
			slots: [
				{ at: wednesday(6), status: "planned" },
				{ at: wednesday(10), status: "planned" },
				{ at: wednesday(14), status: "planned" },
				{ at: wednesday(18), status: "planned" },
			],
		});
	});

	test("the latest first slot is 9 AM; each gap is 4 hours give or take 25 minutes", () => {
		const day = planRunDay("2026-10-21", ZONE, drawsOf(1, 1, 0, 1, 0.9));
		expect(day.slots.map((slot) => slot.at)).toEqual([
			wednesday(9),
			wednesday(13, 25),
			wednesday(17),
			wednesday(21, 25),
		]);
	});

	test("about 1 day in 3, one slot picked at random is skipped", () => {
		// The skip draw is under 1/3, and the slot draw picks the third.
		const skipping = planRunDay(
			"2026-10-21",
			ZONE,
			drawsOf(0.5, 0.5, 0.5, 0.5, 0.2, 0.6),
		);
		expect(skipping.slots.map((slot) => slot.status)).toEqual([
			"planned",
			"planned",
			"skipped",
			"planned",
		]);
		// At 1/3 or over, nothing is skipped.
		const full = planRunDay(
			"2026-10-21",
			ZONE,
			drawsOf(0.5, 0.5, 0.5, 0.5, 0.34),
		);
		expect(full.slots.every((slot) => slot.status === "planned")).toBe(true);
	});

	test("slots are on local time across a DST change", () => {
		// Sunday 1 November 2026: clocks go back at 2 AM; 6 AM is EST (UTC-5).
		const day = planRunDay("2026-11-01", ZONE, drawsOf(0, 0.5, 0.5, 0.5, 0.9));
		expect(day.slots.map((slot) => slot.at)).toEqual([
			Date.UTC(2026, 10, 1, 11),
			Date.UTC(2026, 10, 1, 15),
			Date.UTC(2026, 10, 1, 19),
			Date.UTC(2026, 10, 1, 23),
		]);
	});
});

describe("which slot is due", () => {
	const slots: RunSlot[] = [
		{ at: wednesday(7), status: "planned" },
		{ at: wednesday(11), status: "planned" },
		{ at: wednesday(15), status: "planned" },
		{ at: wednesday(19), status: "planned" },
	];

	test("none before the first slot; the first once its time has passed", () => {
		expect(dueSlot(slots, null, wednesday(6, 50))).toBeNull();
		expect(dueSlot(slots, null, wednesday(7))).toBe(0);
		expect(dueSlot(slots, null, wednesday(10))).toBe(0);
	});

	test("a slot that ran, was skipped or passed is never due again", () => {
		const ran = takeSlot(slots, 0);
		expect(dueSlot(ran, null, wednesday(10, 50))).toBeNull();
		const skipped: RunSlot[] = slots.map((slot, index) =>
			index === 1 ? { ...slot, status: "skipped" } : slot,
		);
		expect(dueSlot(takeSlot(skipped, 0), null, wednesday(14))).toBeNull();
	});

	test("after sleeping through several slots, only the latest is due", () => {
		expect(dueSlot(slots, null, wednesday(16))).toBe(2);
	});

	test("slots before `notBefore` (a cool-down, or a full run that covered them) aren't due", () => {
		expect(dueSlot(slots, wednesday(12), wednesday(13))).toBeNull();
		expect(dueSlot(slots, wednesday(12), wednesday(15, 10))).toBe(2);
	});
});

describe("taking a slot", () => {
	test("marks it ran, and every earlier planned slot passed, so missed slots fold into one run", () => {
		const slots: RunSlot[] = [
			{ at: wednesday(7), status: "planned" },
			{ at: wednesday(11), status: "skipped" },
			{ at: wednesday(15), status: "planned" },
			{ at: wednesday(19), status: "planned" },
		];
		expect(takeSlot(slots, 2).map((slot) => slot.status)).toEqual([
			"passed",
			"skipped",
			"ran",
			"planned",
		]);
	});
});

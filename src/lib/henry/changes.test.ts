import { describe, expect, test } from "vitest";
import { CHANGE_WINDOWS, priceChange, priceChanges } from "./changes";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 30, 12);

describe("priceChange", () => {
	test("current price minus the price that many days ago", () => {
		const points = [
			{ at: NOW - 20 * DAY, price: 2700 },
			{ at: NOW - 10 * DAY, price: 2650 },
			{ at: NOW - 2 * DAY, price: 2600 },
		];
		expect(priceChange(points, 2600, NOW, 3)).toBe(-50);
		expect(priceChange(points, 2600, NOW, 7)).toBe(-50);
		expect(priceChange(points, 2600, NOW, 14)).toBe(-100);
	});

	test("a change exactly at the window's start counts as the price then", () => {
		const points = [
			{ at: NOW - 10 * DAY, price: 2700 },
			{ at: NOW - 3 * DAY, price: 2650 },
		];
		expect(priceChange(points, 2650, NOW, 3)).toBe(0);
	});

	test("a window longer than the unit's history measures from its first price", () => {
		const points = [
			{ at: NOW - 5 * DAY, price: 2590 },
			{ at: NOW - DAY, price: 2615 },
		];
		expect(priceChange(points, 2615, NOW, 3)).toBe(25);
		expect(priceChange(points, 2615, NOW, 7)).toBe(25);
		expect(priceChange(points, 2615, NOW, 14)).toBe(25);
	});

	test("no change is 0, and no history is 0", () => {
		expect(
			priceChange([{ at: NOW - 30 * DAY, price: 2656 }], 2656, NOW, 14),
		).toBe(0);
		expect(priceChange([], 2656, NOW, 14)).toBe(0);
	});

	test("ignores the order the points come in", () => {
		const points = [
			{ at: NOW - DAY, price: 2500 },
			{ at: NOW - 20 * DAY, price: 2700 },
		];
		expect(priceChange(points, 2500, NOW, 7)).toBe(-200);
	});
});

describe("priceChanges", () => {
	test("the 3, 7 and 14 day changes", () => {
		expect(CHANGE_WINDOWS).toEqual([3, 7, 14]);
		const points = [
			{ at: NOW - 13 * DAY, price: 2800 },
			{ at: NOW - 6 * DAY, price: 2750 },
			{ at: NOW - HOUR, price: 2790 },
		];
		expect(priceChanges(points, 2790, NOW)).toEqual({
			d3: 40,
			d7: -10,
			d14: -10,
		});
	});
});

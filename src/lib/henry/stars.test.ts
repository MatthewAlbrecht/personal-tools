import { describe, expect, test } from "vitest";
import {
	filterCounts,
	filterUnits,
	isStarred,
	pinStarred,
	planSummaries,
} from "./stars";

type Row = {
	number: string;
	floorPlan: string;
	beds: number;
	newDays: number | null;
	unitStarred: boolean;
	planStarred: boolean;
};

function unit(number: string, extra: Partial<Row> = {}): Row {
	return {
		number,
		floorPlan: "A1",
		beds: 1,
		newDays: null,
		unitStarred: false,
		planStarred: false,
		...extra,
	};
}

// Already in the current sort's order.
const SORTED = [
	unit("101"),
	unit("201", { planStarred: true, floorPlan: "B2", beds: 2 }),
	unit("301", { newDays: 2 }),
	unit("401", { unitStarred: true }),
	unit("501", { newDays: 0, unitStarred: true, planStarred: true }),
];

describe("isStarred", () => {
	test("a unit is starred directly, through its plan, or both", () => {
		expect(SORTED.map(isStarred)).toEqual([false, true, false, true, true]);
	});
});

describe("pinStarred", () => {
	test("moves starred units to the top and keeps the sort within each group", () => {
		expect(pinStarred(SORTED).map((u) => u.number)).toEqual([
			"201",
			"401",
			"501",
			"101",
			"301",
		]);
	});
});

describe("filterUnits", () => {
	test("All keeps everything, Starred keeps starred, New keeps units new this week", () => {
		expect(filterUnits(SORTED, "all")).toHaveLength(5);
		expect(filterUnits(SORTED, "starred").map((u) => u.number)).toEqual([
			"201",
			"401",
			"501",
		]);
		expect(filterUnits(SORTED, "new").map((u) => u.number)).toEqual([
			"301",
			"501",
		]);
	});

	test("counts each filter", () => {
		expect(filterCounts(SORTED)).toEqual({ all: 5, starred: 3, new: 2 });
	});
});

describe("planSummaries", () => {
	test("lists each plan on the market with its count, plus starred plans with none", () => {
		expect(planSummaries(SORTED, ["B2", "TH"])).toEqual([
			{ floorPlan: "A1", beds: 1, onMarket: 4, starred: false },
			{ floorPlan: "B2", beds: 2, onMarket: 1, starred: true },
			{ floorPlan: "TH", beds: null, onMarket: 0, starred: true },
		]);
	});
});

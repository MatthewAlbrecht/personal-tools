import { describe, expect, test } from "vitest";
import { DEFAULT_SORT, nextSort, sortUnits } from "./sort";

function unit(number: string, price: number, extra: Partial<Row> = {}): Row {
	return {
		number,
		price,
		sqft: 700,
		floor: 1,
		changes: { d3: 0, d7: 0, d14: 0 },
		...extra,
	};
}
type Row = {
	number: string;
	price: number;
	sqft: number;
	floor: number;
	changes: { d3: number; d7: number; d14: number };
};

const UNITS = [
	unit("301", 2500, {
		sqft: 900,
		floor: 3,
		changes: { d3: -50, d7: -50, d14: 10 },
	}),
	unit("101", 2100, { sqft: 600, floor: 1 }),
	unit("701", 2900, {
		sqft: 1100,
		floor: 7,
		changes: { d3: 25, d7: -120, d14: -120 },
	}),
];

function numbers(rows: Row[]): string[] {
	return rows.map((row) => row.number);
}

describe("sortUnits", () => {
	test("defaults to cheapest first", () => {
		expect(DEFAULT_SORT).toEqual({ key: "price", direction: "asc" });
		expect(numbers(sortUnits(UNITS, DEFAULT_SORT))).toEqual([
			"101",
			"301",
			"701",
		]);
	});

	test("sorts by sq ft, floor and each change window, both ways", () => {
		expect(
			numbers(sortUnits(UNITS, { key: "sqft", direction: "desc" })),
		).toEqual(["701", "301", "101"]);
		expect(
			numbers(sortUnits(UNITS, { key: "floor", direction: "asc" })),
		).toEqual(["101", "301", "701"]);
		// Biggest drop first.
		expect(numbers(sortUnits(UNITS, { key: "d3", direction: "asc" }))).toEqual([
			"301",
			"101",
			"701",
		]);
		expect(numbers(sortUnits(UNITS, { key: "d7", direction: "asc" }))).toEqual([
			"701",
			"301",
			"101",
		]);
		expect(
			numbers(sortUnits(UNITS, { key: "d14", direction: "desc" })),
		).toEqual(["301", "101", "701"]);
	});

	test("ties keep price order", () => {
		const rows = [unit("b", 2600), unit("a", 2400), unit("c", 2500)];
		expect(numbers(sortUnits(rows, { key: "d7", direction: "desc" }))).toEqual([
			"a",
			"c",
			"b",
		]);
	});

	test("doesn't change the input", () => {
		const rows = [...UNITS];
		sortUnits(rows, { key: "sqft", direction: "desc" });
		expect(rows).toEqual(UNITS);
	});
});

describe("nextSort", () => {
	test("a new column starts ascending; the same column flips", () => {
		expect(nextSort(DEFAULT_SORT, "sqft")).toEqual({
			key: "sqft",
			direction: "asc",
		});
		expect(nextSort(DEFAULT_SORT, "price")).toEqual({
			key: "price",
			direction: "desc",
		});
		expect(nextSort({ key: "price", direction: "desc" }, "price")).toEqual(
			DEFAULT_SORT,
		);
	});
});

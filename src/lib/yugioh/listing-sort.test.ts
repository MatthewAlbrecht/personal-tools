import { describe, expect, test } from "vitest";
import {
	type ListingSort,
	defaultListingSort,
	listingSortFromParams,
	sortListings,
	sortPhrase,
	toggledSort,
	withListingSort,
} from "./listing-sort";

type Row = { id: string; value: number | string | null };

function sorted(rows: Row[], sort: ListingSort): string[] {
	return sortListings(rows, sort, (row) => row.value).map((row) => row.id);
}

describe("sortListings", () => {
	const rows: Row[] = [
		{ id: "b", value: 20 },
		{ id: "none", value: null },
		{ id: "a", value: 10 },
		{ id: "c", value: 30 },
	];

	test("ascending and descending, with no value last either way", () => {
		expect(sorted(rows, { key: "price", direction: "asc" })).toEqual([
			"a",
			"b",
			"c",
			"none",
		]);
		expect(sorted(rows, { key: "price", direction: "desc" })).toEqual([
			"c",
			"b",
			"a",
			"none",
		]);
	});

	test("ties keep the order given (newest first)", () => {
		const tied: Row[] = [
			{ id: "newer", value: 5 },
			{ id: "older", value: 5 },
		];
		expect(sorted(tied, { key: "price", direction: "asc" })).toEqual([
			"newer",
			"older",
		]);
		expect(sorted(tied, { key: "price", direction: "desc" })).toEqual([
			"newer",
			"older",
		]);
	});

	test("text sorts A to Z, ignoring case", () => {
		const names: Row[] = [
			{ id: "mist", value: "mist Wurm" },
			{ id: "brionac", value: "Brionac" },
		];
		expect(sorted(names, { key: "card", direction: "asc" })).toEqual([
			"brionac",
			"mist",
		]);
	});
});

describe("defaults and toggling", () => {
	test("Available is newest first; Sold is the latest sale first", () => {
		expect(defaultListingSort("available")).toEqual({
			key: "seen",
			direction: "desc",
		});
		expect(defaultListingSort("sold")).toEqual({
			key: "date",
			direction: "desc",
		});
	});

	test("a new column starts in its natural direction; the same one flips", () => {
		const newest = defaultListingSort("available");
		expect(toggledSort(newest, "price", "available")).toEqual({
			key: "price",
			direction: "asc",
		});
		// Ending soonest first on Available; the latest sale first on Sold.
		expect(toggledSort(newest, "date", "available")).toEqual({
			key: "date",
			direction: "asc",
		});
		expect(toggledSort(newest, "date", "sold")).toEqual({
			key: "date",
			direction: "desc",
		});
		expect(toggledSort(newest, "seen", "available")).toEqual({
			key: "seen",
			direction: "asc",
		});
	});

	test("says the order in words", () => {
		expect(sortPhrase(defaultListingSort("available"), "available")).toBe(
			"newest first",
		);
		expect(sortPhrase(defaultListingSort("sold"), "sold")).toBe(
			"latest sale first",
		);
		expect(sortPhrase({ key: "date", direction: "asc" }, "available")).toBe(
			"ending soonest first",
		);
		expect(sortPhrase({ key: "price", direction: "asc" }, "sold")).toBe(
			"cheapest first",
		);
		expect(sortPhrase({ key: "grade", direction: "asc" }, "available")).toBe(
			"best deal first",
		);
	});
});

describe("the sort in the URL", () => {
	test("round-trips, and the view's default leaves no param", () => {
		const sort: ListingSort = { key: "grade", direction: "desc" };
		const params = withListingSort(
			new URLSearchParams("listing=abc"),
			sort,
			"available",
		);
		expect(params.toString()).toBe("listing=abc&sort=grade&order=desc");
		expect(listingSortFromParams(params, "available")).toEqual(sort);
		const reset = withListingSort(
			params,
			defaultListingSort("available"),
			"available",
		);
		expect(reset.toString()).toBe("listing=abc");
	});

	test("missing or unknown values fall back to the view's default", () => {
		expect(
			listingSortFromParams(new URLSearchParams("sort=bogus"), "sold"),
		).toEqual(defaultListingSort("sold"));
		expect(
			listingSortFromParams(new URLSearchParams("sort=price"), "sold"),
		).toEqual({ key: "price", direction: "asc" });
	});

	test("an old Ending soon link sorts Available by end time", () => {
		const params = new URLSearchParams("ending=1");
		expect(listingSortFromParams(params, "available")).toEqual({
			key: "date",
			direction: "asc",
		});
		expect(
			withListingSort(
				params,
				{ key: "price", direction: "asc" },
				"available",
			).toString(),
		).toBe("sort=price&order=asc");
	});
});

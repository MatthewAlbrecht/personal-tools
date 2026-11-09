// The Ledger's column sort. Client-side over the page query's units.

import type { PriceChanges } from "./changes";

export type SortKey = "price" | "sqft" | "floor" | "d3" | "d7" | "d14";
export type Sort = { key: SortKey; direction: "asc" | "desc" };

export const DEFAULT_SORT: Sort = { key: "price", direction: "asc" };

type Sortable = {
	price: number;
	sqft: number;
	floor: number;
	changes: PriceChanges;
};

/** A sorted copy. Ties fall back to cheapest first. */
export function sortUnits<T extends Sortable>(
	units: readonly T[],
	sort: Sort,
): T[] {
	const sign = sort.direction === "asc" ? 1 : -1;
	return [...units].sort(
		(a, b) =>
			(value(a, sort.key) - value(b, sort.key)) * sign || a.price - b.price,
	);
}

/** Clicking a column: a new one sorts ascending, the current one flips. */
export function nextSort(current: Sort, key: SortKey): Sort {
	if (current.key !== key) return { key, direction: "asc" };
	return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

function value(unit: Sortable, key: SortKey): number {
	switch (key) {
		case "price":
			return unit.price;
		case "sqft":
			return unit.sqft;
		case "floor":
			return unit.floor;
		default:
			return unit.changes[key];
	}
}

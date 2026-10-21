// How a Deck's Listings are ordered, kept in the URL next to the filters.
// Relative imports only (Convex imports this).

import type { ListingsView } from "./listing-filters";

/**
 * The columns Listings sort by: Per-copy price, Grade (% of the Reference
 * price), Card / Printing, date (the end time on Available, the sale date on
 * Sold), Seller, and Seen (when listed, else first captured).
 */
export const SORT_KEYS = [
	"price",
	"grade",
	"card",
	"date",
	"seller",
	"seen",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type ListingSort = { key: SortKey; direction: SortDirection };

/** Available: newest first. Sold: the latest sale first. */
export function defaultListingSort(view: ListingsView): ListingSort {
	return view === "sold"
		? { key: "date", direction: "desc" }
		: { key: "seen", direction: "desc" };
}

/** The direction a column starts in when first picked. */
function firstDirection(key: SortKey, view: ListingsView): SortDirection {
	if (key === "seen") return "desc";
	// Ending soonest first on Available; the latest sale first on Sold.
	if (key === "date") return view === "sold" ? "desc" : "asc";
	return "asc";
}

/** Picking a column: the same one flips; another starts in its natural direction. */
export function toggledSort(
	current: ListingSort,
	key: SortKey,
	view: ListingsView,
): ListingSort {
	if (current.key === key) {
		return { key, direction: current.direction === "asc" ? "desc" : "asc" };
	}
	return { key, direction: firstDirection(key, view) };
}

/**
 * `items` ordered by `columnValue` in the sort's direction. Items without a value
 * go last either way; ties keep the order given (newest first).
 */
export function sortListings<T>(
	items: readonly T[],
	sort: ListingSort,
	columnValue: (item: T) => number | string | null,
): T[] {
	const sign = sort.direction === "asc" ? 1 : -1;
	return items
		.map((item, index) => ({ item, index, value: columnValue(item) }))
		.sort((a, b) => {
			if (a.value === null || b.value === null) {
				if (a.value === b.value) return a.index - b.index;
				return a.value === null ? 1 : -1;
			}
			const order =
				typeof a.value === "string" || typeof b.value === "string"
					? String(a.value).localeCompare(String(b.value), "en", {
							sensitivity: "base",
						})
					: a.value - b.value;
			return order === 0 ? a.index - b.index : sign * order;
		})
		.map(({ item }) => item);
}

const PHRASES: Record<
	SortKey,
	Record<SortDirection, string | Record<ListingsView, string>>
> = {
	price: { asc: "cheapest first", desc: "priciest first" },
	grade: { asc: "best deal first", desc: "worst deal first" },
	card: { asc: "Card A to Z", desc: "Card Z to A" },
	date: {
		asc: { available: "ending soonest first", sold: "earliest sale first" },
		desc: { available: "ending latest first", sold: "latest sale first" },
	},
	seller: { asc: "seller A to Z", desc: "seller Z to A" },
	seen: { asc: "oldest first", desc: "newest first" },
};

/** The order in words, for the count line: "cheapest first". */
export function sortPhrase(sort: ListingSort, view: ListingsView): string {
	const phrase = PHRASES[sort.key][sort.direction];
	return typeof phrase === "string" ? phrase : phrase[view];
}

type ParamReader = { get(name: string): string | null };

/**
 * The sort a URL holds (`sort=price&order=asc`), else the view's default. An
 * old Ending soon link (`ending=1`) sorts Available by end time.
 */
export function listingSortFromParams(
	params: ParamReader,
	view: ListingsView,
): ListingSort {
	const key = SORT_KEYS.find((k) => k === params.get("sort"));
	if (key === undefined) {
		if (params.get("ending") === "1" && view === "available") {
			return { key: "date", direction: "asc" };
		}
		return defaultListingSort(view);
	}
	const direction =
		SORT_DIRECTIONS.find((d) => d === params.get("order")) ??
		firstDirection(key, view);
	return { key, direction };
}

/** `params` with the sort set; the view's default leaves no param. */
export function withListingSort(
	params: URLSearchParams,
	sort: ListingSort,
	view: ListingsView,
): URLSearchParams {
	const next = new URLSearchParams(params);
	next.delete("sort");
	next.delete("order");
	next.delete("ending");
	const fallback = defaultListingSort(view);
	if (sort.key !== fallback.key || sort.direction !== fallback.direction) {
		next.set("sort", sort.key);
		next.set("order", sort.direction);
	}
	return next;
}

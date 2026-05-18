import {
	forLaterSingleIndexedReleaseYear,
	type ForLaterUiFilters,
} from "./forLaterAlbumsUi";

export type IndexedForLaterListChoice =
	| { kind: "year"; year: number }
	| { kind: "listened"; value: boolean }
	| { kind: "rymMatched"; value: boolean }
	| { kind: "default" };

/** Which equality prefix drives the compound index; remaining scalars go through `.filter()`. */
export function chooseIndexedForLaterListScan(
	filters: ForLaterUiFilters,
): IndexedForLaterListChoice {
	const singleYear = forLaterSingleIndexedReleaseYear(filters);
	if (singleYear !== undefined) {
		return { kind: "year", year: singleYear };
	}
	if (filters.listened === "listened") {
		return { kind: "listened", value: true };
	}
	if (filters.listened === "not_listened") {
		return { kind: "listened", value: false };
	}
	if (filters.rymStatus === "has_scrape") {
		return { kind: "rymMatched", value: true };
	}
	if (filters.rymStatus === "no_scrape") {
		return { kind: "rymMatched", value: false };
	}
	return { kind: "default" };
}

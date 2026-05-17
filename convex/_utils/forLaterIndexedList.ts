import type { ForLaterUiFilters } from "./forLaterAlbumsUi";

export type IndexedForLaterListChoice =
	| { kind: "year"; year: number }
	| { kind: "listened"; value: boolean }
	| { kind: "rymMatched"; value: boolean }
	| { kind: "rymUrl"; value: boolean }
	| { kind: "default" };

/** Which equality prefix drives the compound index; remaining scalars go through `.filter()`. */
export function chooseIndexedForLaterListScan(
	filters: ForLaterUiFilters,
): IndexedForLaterListChoice {
	if (filters.year !== undefined) {
		return { kind: "year", year: filters.year };
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
	if (filters.rymStatus === "has_candidate") {
		return { kind: "rymUrl", value: true };
	}
	if (filters.rymStatus === "no_candidate") {
		return { kind: "rymUrl", value: false };
	}
	return { kind: "default" };
}

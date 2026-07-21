import type { Doc } from "../_generated/dataModel";
import {
	type ForLaterUiFilters,
	durationMsMatchesForLaterFilter,
	releaseYearMatchesForLaterFilter,
	taxonomyKeysPassAgainstSet,
} from "./forLaterAlbumsUi";

export function libraryRowMatchesForLaterFilters(
	row: Doc<"albumLibraryItems">,
	filters: ForLaterUiFilters,
): boolean {
	if (row.isActiveForLater !== true) {
		return false;
	}

	const search = filters.search?.trim().toLowerCase();
	if (search && !row.searchText.toLowerCase().includes(search)) {
		return false;
	}

	if (!releaseYearMatchesForLaterFilter(row.releaseYear, filters)) {
		return false;
	}

	if (!durationMsMatchesForLaterFilter(row.totalDurationMs, filters)) {
		return false;
	}

	if (filters.listened === "listened" && !row.filterHasListened) {
		return false;
	}
	if (filters.listened === "not_listened" && row.filterHasListened) {
		return false;
	}

	if (filters.rymStatus === "not_on_rym") {
		if (row.rymNotOnSite !== true) return false;
	} else if (filters.rymStatus !== "all") {
		if (row.rymNotOnSite === true) return false;
		if (filters.rymStatus === "has_scrape" && row.rymStatus !== "linked") {
			return false;
		}
		if (filters.rymStatus === "no_scrape" && row.rymStatus === "linked") {
			return false;
		}
	}

	const genreKeys = new Set(
		row.filterGenreKeysSorted && row.filterGenreKeysSorted.length > 0
			? row.filterGenreKeysSorted
			: [
					...row.primaryGenres.map((tag) => tag.key),
					...row.secondaryGenres.map((tag) => tag.key),
				],
	);
	const descriptorKeys = new Set(row.descriptors.map((tag) => tag.key));

	return (
		taxonomyKeysPassAgainstSet(
			filters.genreKeys,
			filters.genreMatch,
			genreKeys,
		) &&
		taxonomyKeysPassAgainstSet(
			filters.descriptorKeys,
			filters.descriptorMatch,
			descriptorKeys,
		)
	);
}

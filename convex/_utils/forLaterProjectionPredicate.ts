import type { Doc } from "../_generated/dataModel";
import {
	type ForLaterUiFilters,
	durationMsMatchesForLaterFilter,
	releaseYearMatchesForLaterFilter,
	taxonomyKeysPassAgainstSet,
} from "./forLaterAlbumsUi";

/**
 * Cheap filter check using denormalized projection fields on `forLaterAlbumItems`.
 * Mirrors {@link rowMatchesFilters} semantics when projections are in sync.
 *
 * When `skipSearchPredicate` is true (FTS already narrowed the candidate set), the
 * substring search predicate is skipped — hydrate still runs {@link rowMatchesFilters}.
 */
/** Soft-deleted rows are hidden from for-later list UIs but remain in the table. */
export function forLaterItemExcludedFromLists(
	doc: Doc<"forLaterAlbumItems">,
): boolean {
	return (
		doc.filterMarkedAsSingle === true || doc.filterRemovedFromForLater === true
	);
}

export function projectionMatchesFilters(
	doc: Doc<"forLaterAlbumItems">,
	filters: ForLaterUiFilters,
	options?: { skipSearchPredicate?: boolean },
): boolean {
	if (forLaterItemExcludedFromLists(doc)) {
		return false;
	}

	type DocPred = (d: Doc<"forLaterAlbumItems">) => boolean;
	const preds: DocPred[] = [];

	const search = filters.search?.trim();
	if (search && !options?.skipSearchPredicate) {
		const q = search.toLowerCase();
		const blob = (doc.filterSearchText ?? "").toLowerCase();
		preds.push(() => blob.includes(q));
	}

	if (filters.yearMin !== undefined || filters.yearMax !== undefined) {
		preds.push((d) =>
			releaseYearMatchesForLaterFilter(d.filterReleaseYear, filters),
		);
	}

	if (
		filters.durationBucketKey !== undefined ||
		filters.durationMinMinutes !== undefined ||
		filters.durationMaxMinutes !== undefined
	) {
		preds.push((d) =>
			durationMsMatchesForLaterFilter(d.filterDurationMs, filters),
		);
	}

	if (filters.listened === "listened") {
		preds.push((d) => d.filterHasListened === true);
	} else if (filters.listened === "not_listened") {
		preds.push((d) => d.filterHasListened !== true);
	}

	const rym = filters.rymStatus;
	if (rym === "not_on_rym") {
		preds.push((d) => d.filterRymNotOnSite === true);
	} else if (rym !== "all") {
		preds.push((d) => d.filterRymNotOnSite !== true);
		if (rym === "has_scrape") {
			preds.push((d) => d.filterRymMatched === true);
		} else if (rym === "no_scrape") {
			preds.push((d) => d.filterRymMatched !== true);
		}
	}

	if (!preds.every((p) => p(doc))) {
		return false;
	}

	return (
		taxonomyKeysPassAgainstSet(
			filters.genreKeys,
			filters.genreMatch,
			new Set(doc.filterGenreKeysSorted ?? []),
		) &&
		taxonomyKeysPassAgainstSet(
			filters.descriptorKeys,
			filters.descriptorMatch,
			new Set(doc.filterDescriptorKeysSorted ?? []),
		)
	);
}

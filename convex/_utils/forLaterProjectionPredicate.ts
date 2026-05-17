import type { Doc } from "../_generated/dataModel";
import {
	type ForLaterUiFilters,
	taxonomyKeysPassAgainstSet,
} from "./forLaterAlbumsUi";

/**
 * Cheap filter check using denormalized projection fields on `forLaterAlbumItems`.
 * Mirrors {@link rowMatchesFilters} semantics when projections are in sync.
 *
 * When `skipSearchPredicate` is true (FTS already narrowed the candidate set), the
 * substring search predicate is skipped — hydrate still runs {@link rowMatchesFilters}.
 */
export function projectionMatchesFilters(
	doc: Doc<"forLaterAlbumItems">,
	filters: ForLaterUiFilters,
	options?: { skipSearchPredicate?: boolean },
): boolean {
	type DocPred = (d: Doc<"forLaterAlbumItems">) => boolean;
	const preds: DocPred[] = [];

	const search = filters.search?.trim();
	if (search && !options?.skipSearchPredicate) {
		const q = search.toLowerCase();
		const blob = (doc.filterSearchText ?? "").toLowerCase();
		preds.push(() => blob.includes(q));
	}

	if (filters.year !== undefined) {
		const y = filters.year;
		preds.push((d) => d.filterReleaseYear === y);
	}

	if (filters.listened === "listened") {
		preds.push((d) => d.filterHasListened === true);
	} else if (filters.listened === "not_listened") {
		preds.push((d) => d.filterHasListened !== true);
	}

	const rym = filters.rymStatus;
	if (rym === "has_scrape") {
		preds.push((d) => d.filterRymMatched === true);
	} else if (rym === "no_scrape") {
		preds.push((d) => d.filterRymMatched !== true);
	} else if (rym === "has_candidate") {
		preds.push((d) => d.filterHasRymUrl === true);
	} else if (rym === "no_candidate") {
		preds.push((d) => d.filterHasRymUrl !== true);
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

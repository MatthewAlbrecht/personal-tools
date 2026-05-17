export type ForLaterListenedFilter = "all" | "listened" | "not_listened";
export type ForLaterRymFilter =
	| "all"
	| "has_scrape"
	| "no_scrape"
	| "has_candidate"
	| "no_candidate";
export type ForLaterFilterMatch = "all" | "any";
export type ForLaterDerivedRymStatus =
	| "matched"
	| "candidate"
	| "searching"
	| "not_found"
	| "failed"
	| "not_started";

export type ForLaterUiFilters = {
	genreKeys: string[];
	descriptorKeys: string[];
	search?: string;
	year?: number;
	listened: ForLaterListenedFilter;
	rymStatus: ForLaterRymFilter;
	/** Among selected genre tags: every tag ("all") vs at least one ("any"). */
	genreMatch: ForLaterFilterMatch;
	/** Among selected descriptor tags: every tag ("all") vs at least one ("any"). */
	descriptorMatch: ForLaterFilterMatch;
};

/** Accept legacy `filterMatch` when normalizing Convex / bookmarked URLs. */
export type ForLaterFiltersNormalizeInput = Partial<ForLaterUiFilters> & {
	filterMatch?: ForLaterFilterMatch;
};

function sortUniqueTrimmedKeys(keys: string[] | undefined): string[] {
	if (!keys?.length) {
		return [];
	}
	const seen = new Set<string>();
	for (const raw of keys) {
		const t = raw.trim().toLowerCase();
		if (t) {
			seen.add(t);
		}
	}
	return [...seen].sort();
}

function resolveTaxonomyMatch(
	specific: ForLaterFilterMatch | undefined,
	legacy: ForLaterFilterMatch | undefined,
): ForLaterFilterMatch {
	return specific ?? legacy ?? "all";
}

export function normalizeForLaterFilters(
	input: ForLaterFiltersNormalizeInput,
): ForLaterUiFilters {
	const legacy = input.filterMatch;
	return {
		genreKeys: sortUniqueTrimmedKeys(input.genreKeys),
		descriptorKeys: sortUniqueTrimmedKeys(input.descriptorKeys),
		search: normalizeOptionalString(input.search),
		year: input.year,
		listened: input.listened ?? "all",
		rymStatus: input.rymStatus ?? "all",
		genreMatch: resolveTaxonomyMatch(input.genreMatch, legacy),
		descriptorMatch: resolveTaxonomyMatch(input.descriptorMatch, legacy),
	};
}

export function taxonomyKeysPassAgainstSet(
	keys: string[],
	match: ForLaterFilterMatch,
	subjectKeys: Set<string>,
): boolean {
	if (keys.length === 0) {
		return true;
	}
	if (match === "any") {
		return keys.some((k) => subjectKeys.has(k));
	}
	return keys.every((k) => subjectKeys.has(k));
}

/** Upper bound on {@link forLaterPostFilterScanSize} to contain read costs. */
export const FOR_LATER_POST_FILTER_SCAN_CAP = 1024;

/**
 * Raw rows to read per `.paginate()` when filters are applied **after** the query
 * (genre/descriptor/search). Convex allows only one paginate per request, so sparse
 * matches need a wide scan or early pages look empty.
 */
export function forLaterPostFilterScanSize(requested: number): number {
	const n = Math.max(
		1,
		Math.floor(Number.isFinite(requested) ? requested : 25),
	);
	const overscan = Math.max(n * 40, 120);
	return Math.min(overscan, FOR_LATER_POST_FILTER_SCAN_CAP);
}

/** True when list pagination can use denormalized projection indexes (no genre/descriptor/search). */
export function forLaterFiltersAllowIndexedScan(
	filters: ForLaterUiFilters,
): boolean {
	if (
		filters.genreKeys.length > 0 ||
		filters.descriptorKeys.length > 0 ||
		Boolean(filters.search?.trim())
	) {
		return false;
	}
	return true;
}

/**
 * True when we can paginate `forLaterAlbumGenreFacets` so `isDone` reflects albums
 * with the selected genre(s), not the whole playlist.
 *
 * Skipped when search is active (FTS path). Skipped when genreMatch is `"any"` and
 * multiple genre keys are selected — Convex allows only **one** `.paginate()` per
 * query, so a facet-stream union cannot run inside `listForLaterAlbumRows`; those
 * filters use the legacy `by_userId_lastSeenAt` path instead.
 */
export function forLaterFiltersAllowGenreFacetPagination(
	filters: ForLaterUiFilters,
): boolean {
	if (filters.search?.trim()) {
		return false;
	}
	if (filters.genreKeys.length === 0) {
		return false;
	}
	if (filters.genreMatch === "any" && filters.genreKeys.length > 1) {
		return false;
	}
	return true;
}

/**
 * True when we can paginate `forLaterAlbumDescriptorFacets` so `isDone` reflects
 * albums matching the selected descriptor slice, not the whole playlist.
 *
 * Used when genre facet pagination does not apply (e.g. descriptor-only filters, or
 * genre ANY with multiple keys while a single descriptor dimension can narrow).
 *
 * Skipped when search is active. Skipped when descriptorMatch is `"any"` and
 * multiple descriptor keys are selected (same single-`.paginate()` constraint).
 */
export function forLaterFiltersAllowDescriptorFacetPagination(
	filters: ForLaterUiFilters,
): boolean {
	if (filters.search?.trim()) {
		return false;
	}
	if (filters.descriptorKeys.length === 0) {
		return false;
	}
	if (filters.descriptorMatch === "any" && filters.descriptorKeys.length > 1) {
		return false;
	}
	return true;
}

export type ForLaterAlbumRowFilterInput = {
	name: string;
	artistName: string;
	releaseYear?: number;
	hasListened: boolean;
	rymStatus: string;
	rymUrl?: string;
	primaryGenres: Array<{ key: string }>;
	secondaryGenres: Array<{ key: string }>;
	descriptors: Array<{ key: string }>;
};

function albumGenreKeySet(r: ForLaterAlbumRowFilterInput): Set<string> {
	return new Set([
		...r.primaryGenres.map((t) => t.key),
		...r.secondaryGenres.map((t) => t.key),
	]);
}

export function rowMatchesFilters(
	row: ForLaterAlbumRowFilterInput,
	filters: ForLaterUiFilters,
): boolean {
	type RowPred = (r: ForLaterAlbumRowFilterInput) => boolean;
	const preds: RowPred[] = [];

	const search = filters.search?.trim();
	if (search) {
		const q = search.toLowerCase();
		preds.push(
			(r) =>
				r.name.toLowerCase().includes(q) ||
				r.artistName.toLowerCase().includes(q),
		);
	}

	if (filters.year !== undefined) {
		const y = filters.year;
		preds.push((r) => r.releaseYear === y);
	}

	if (filters.listened === "listened") {
		preds.push((r) => r.hasListened);
	} else if (filters.listened === "not_listened") {
		preds.push((r) => !r.hasListened);
	}

	const rym = filters.rymStatus;
	if (rym === "has_scrape") {
		preds.push((r) => r.rymStatus === "matched");
	} else if (rym === "no_scrape") {
		preds.push((r) => r.rymStatus !== "matched");
	} else if (rym === "has_candidate") {
		preds.push((r) => Boolean(r.rymUrl));
	} else if (rym === "no_candidate") {
		preds.push((r) => !r.rymUrl);
	}

	if (!preds.every((p) => p(row))) {
		return false;
	}

	return (
		taxonomyKeysPassAgainstSet(
			filters.genreKeys,
			filters.genreMatch,
			albumGenreKeySet(row),
		) &&
		taxonomyKeysPassAgainstSet(
			filters.descriptorKeys,
			filters.descriptorMatch,
			new Set(row.descriptors.map((t) => t.key)),
		)
	);
}

export function deriveRymStatus(args: {
	rymScrapeId?: unknown;
	rymCandidateUrl?: string;
	rymDiscoveryStatus:
		| "not_started"
		| "queued"
		| "searching"
		| "found"
		| "not_found"
		| "failed";
}): ForLaterDerivedRymStatus {
	if (args.rymScrapeId) {
		return "matched";
	}
	if (args.rymCandidateUrl || args.rymDiscoveryStatus === "found") {
		return "candidate";
	}
	if (
		args.rymDiscoveryStatus === "queued" ||
		args.rymDiscoveryStatus === "searching"
	) {
		return "searching";
	}
	if (args.rymDiscoveryStatus === "not_found") {
		return "not_found";
	}
	if (args.rymDiscoveryStatus === "failed") {
		return "failed";
	}
	return "not_started";
}

export function sortForLaterRows<
	T extends {
		lastSeenAt: number;
		playlistAddedAt?: number;
		createdAt: number;
	},
>(rows: T[]): T[] {
	return [...rows].sort((a, b) => {
		const lastSeenDiff = b.lastSeenAt - a.lastSeenAt;
		if (lastSeenDiff !== 0) return lastSeenDiff;

		const playlistDiff = (b.playlistAddedAt ?? 0) - (a.playlistAddedAt ?? 0);
		if (playlistDiff !== 0) return playlistDiff;

		return b.createdAt - a.createdAt;
	});
}

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

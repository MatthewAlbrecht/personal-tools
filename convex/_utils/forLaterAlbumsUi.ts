import type { ForLaterDurationBucketKey } from "./forLaterDurationBuckets";
import {
	durationBucketKeyFromMinutes,
	durationBucketMatches,
} from "./forLaterDurationBuckets";

export type ForLaterListenedFilter = "all" | "listened" | "not_listened";
export type ForLaterRymFilter =
	| "all"
	| "has_scrape"
	| "no_scrape"
	| "not_on_rym";
export type ForLaterFilterMatch = "all" | "any";
export type ForLaterDerivedRymStatus = "matched" | "unmatched";

export type ForLaterUiFilters = {
	genreKeys: string[];
	descriptorKeys: string[];
	search?: string;
	yearMin?: number;
	yearMax?: number;
	/** @deprecated Use yearMin/yearMax; still accepted for backward compatibility. */
	year?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationBucketKey?: ForLaterDurationBucketKey;
	listened: ForLaterListenedFilter;
	rymStatus: ForLaterRymFilter;
	/** Among selected genre tags: every tag ("all") vs at least one ("any"). */
	genreMatch: ForLaterFilterMatch;
	/** Among selected descriptor tags: every tag ("all") vs at least one ("any"). */
	descriptorMatch: ForLaterFilterMatch;
};

/** Accept legacy `filterMatch` when normalizing Convex / bookmarked URLs. */
export type ForLaterFiltersNormalizeInput = Omit<
	Partial<ForLaterUiFilters>,
	"durationBucketKey"
> & {
	durationBucketKey?: ForLaterDurationBucketKey | string;
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
		yearMin: input.yearMin ?? input.year,
		yearMax: input.yearMax ?? input.year,
		durationMinMinutes: input.durationMinMinutes,
		durationMaxMinutes: input.durationMaxMinutes,
		durationBucketKey: durationBucketKeyFromMinutes(input.durationBucketKey),
		listened: input.listened ?? "all",
		rymStatus: input.rymStatus ?? "all",
		genreMatch: resolveTaxonomyMatch(input.genreMatch, legacy),
		descriptorMatch: resolveTaxonomyMatch(input.descriptorMatch, legacy),
	};
}

export function forLaterSingleIndexedReleaseYear(
	filters: ForLaterUiFilters,
): number | undefined {
	if (filters.yearMin === undefined || filters.yearMax === undefined) {
		return undefined;
	}
	if (filters.yearMin !== filters.yearMax) {
		return undefined;
	}
	return filters.yearMin;
}

export function releaseYearMatchesForLaterFilter(
	releaseYear: number | undefined,
	filters: ForLaterUiFilters,
): boolean {
	if (filters.yearMin === undefined && filters.yearMax === undefined) {
		return true;
	}
	if (releaseYear === undefined) {
		return false;
	}
	if (filters.yearMin !== undefined && releaseYear < filters.yearMin) {
		return false;
	}
	if (filters.yearMax !== undefined && releaseYear > filters.yearMax) {
		return false;
	}
	return true;
}

const MINUTE_MS = 60 * 1000;

export function durationMsMatchesForLaterFilter(
	durationMs: number | undefined,
	filters: ForLaterUiFilters,
): boolean {
	if (filters.durationBucketKey !== undefined) {
		return durationBucketMatches(durationMs, filters.durationBucketKey);
	}

	if (
		filters.durationMinMinutes === undefined &&
		filters.durationMaxMinutes === undefined
	) {
		return true;
	}
	if (durationMs === undefined) {
		return false;
	}
	if (
		filters.durationMinMinutes !== undefined &&
		durationMs < filters.durationMinMinutes * MINUTE_MS
	) {
		return false;
	}
	if (
		filters.durationMaxMinutes !== undefined &&
		durationMs > filters.durationMaxMinutes * MINUTE_MS
	) {
		return false;
	}
	return true;
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

export type ForLaterAlbumRowFilterInput = {
	name: string;
	artistName: string;
	releaseYear?: number;
	hasListened: boolean;
	rymStatus: string;
	rymUrl?: string;
	rymNotOnSite?: boolean;
	markedAsSingle?: boolean;
	removedFromForLater?: boolean;
	primaryGenres: Array<{ key: string }>;
	secondaryGenres: Array<{ key: string }>;
	descriptors: Array<{ key: string }>;
	/** Denormalized scrape tags plus ancestor keys; preferred for genre filters. */
	filterGenreKeysSorted?: string[];
	durationMs?: number;
};

function albumGenreKeySet(r: ForLaterAlbumRowFilterInput): Set<string> {
	if (r.filterGenreKeysSorted && r.filterGenreKeysSorted.length > 0) {
		return new Set(r.filterGenreKeysSorted);
	}

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

	preds.push((r) => r.markedAsSingle !== true);
	preds.push((r) => r.removedFromForLater !== true);

	const search = filters.search?.trim();
	if (search) {
		const q = search.toLowerCase();
		preds.push(
			(r) =>
				r.name.toLowerCase().includes(q) ||
				r.artistName.toLowerCase().includes(q),
		);
	}

	if (filters.yearMin !== undefined || filters.yearMax !== undefined) {
		preds.push((r) => releaseYearMatchesForLaterFilter(r.releaseYear, filters));
	}

	if (
		filters.durationBucketKey !== undefined ||
		filters.durationMinMinutes !== undefined ||
		filters.durationMaxMinutes !== undefined
	) {
		preds.push((r) => durationMsMatchesForLaterFilter(r.durationMs, filters));
	}

	if (filters.listened === "listened") {
		preds.push((r) => r.hasListened);
	} else if (filters.listened === "not_listened") {
		preds.push((r) => !r.hasListened);
	}

	const rym = filters.rymStatus;
	if (rym === "not_on_rym") {
		preds.push((r) => r.rymNotOnSite === true);
	} else if (rym !== "all") {
		preds.push((r) => r.rymNotOnSite !== true);
		if (rym === "has_scrape") {
			preds.push((r) => r.rymStatus === "matched");
		} else if (rym === "no_scrape") {
			preds.push((r) => r.rymStatus !== "matched");
		}
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
}): ForLaterDerivedRymStatus {
	return args.rymScrapeId ? "matched" : "unmatched";
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

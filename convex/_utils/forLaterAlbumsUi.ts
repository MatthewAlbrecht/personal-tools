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
	filterMatch: ForLaterFilterMatch;
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

export function normalizeForLaterFilters(
	input: Partial<ForLaterUiFilters>,
): ForLaterUiFilters {
	return {
		genreKeys: sortUniqueTrimmedKeys(input.genreKeys),
		descriptorKeys: sortUniqueTrimmedKeys(input.descriptorKeys),
		search: normalizeOptionalString(input.search),
		year: input.year,
		listened: input.listened ?? "all",
		rymStatus: input.rymStatus ?? "all",
		filterMatch: input.filterMatch ?? "all",
	};
}

/** True when list pagination can use denormalized projection indexes (no genre/descriptor/search or "any" match). */
export function forLaterFiltersAllowIndexedScan(
	filters: ForLaterUiFilters,
): boolean {
	if (filters.filterMatch !== "all") {
		return false;
	}
	if (
		filters.genreKeys.length > 0 ||
		filters.descriptorKeys.length > 0 ||
		Boolean(filters.search?.trim())
	) {
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

	if (filters.genreKeys.length > 0) {
		const keys = filters.genreKeys;
		preds.push((r) => {
			const genres = albumGenreKeySet(r);
			return keys.every((genreKey) => genres.has(genreKey));
		});
	}

	if (filters.descriptorKeys.length > 0) {
		const keys = filters.descriptorKeys;
		preds.push((r) => {
			const descriptors = new Set(r.descriptors.map((t) => t.key));
			return keys.every((descriptorKey) => descriptors.has(descriptorKey));
		});
	}

	if (preds.length === 0) {
		return true;
	}

	const mode = filters.filterMatch;
	if (mode === "any") {
		return preds.some((p) => p(row));
	}
	return preds.every((p) => p(row));
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

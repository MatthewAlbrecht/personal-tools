import type { AlbumLibraryFilters } from "./albumLibraryRows";

export type IndexedAlbumLibraryListChoice =
	| { kind: "artist" }
	| { kind: "year"; year: number }
	| { kind: "listened"; value: boolean }
	| { kind: "rymStatus"; value: "linked" | "unlinked" }
	| { kind: "albumType"; value: "album" | "single" }
	| { kind: "robRanking"; value: boolean }
	| { kind: "default" };

export type AlbumLibrarySort = "recent" | "artist";

/** Upper bound on {@link albumLibraryPostFilterScanSize} to contain read costs. */
export const ALBUM_LIBRARY_POST_FILTER_SCAN_CAP = 1024;

/**
 * Raw rows to read per `.paginate()` when search narrows candidates after the query.
 * Convex allows only one paginate per request, so sparse matches need a wide scan.
 */
export function albumLibraryPostFilterScanSize(requested: number): number {
	const n = Math.max(
		1,
		Math.floor(Number.isFinite(requested) ? requested : 25),
	);
	const overscan = Math.max(n * 40, 120);
	return Math.min(overscan, ALBUM_LIBRARY_POST_FILTER_SCAN_CAP);
}

export function albumLibraryFiltersAllowIndexedScan(
	filters: AlbumLibraryFilters,
): boolean {
	return !filters.search?.trim();
}

/** Which equality prefix drives the compound index; remaining scalars go through `.filter()`. */
export function chooseIndexedAlbumLibraryScan(
	filters: AlbumLibraryFilters,
	sortBy: AlbumLibrarySort,
): IndexedAlbumLibraryListChoice {
	if (sortBy === "artist") {
		return { kind: "artist" };
	}

	if (filters.releaseYear !== undefined) {
		return { kind: "year", year: filters.releaseYear };
	}
	if (filters.listenStatus === "listened") {
		return { kind: "listened", value: true };
	}
	if (filters.listenStatus === "unlistened") {
		return { kind: "listened", value: false };
	}
	if (filters.rymStatus === "linked" || filters.rymStatus === "unlinked") {
		return { kind: "rymStatus", value: filters.rymStatus };
	}
	if (filters.albumType === "album" || filters.albumType === "single") {
		return { kind: "albumType", value: filters.albumType };
	}
	if (filters.robRankingStatus === "appears") {
		return { kind: "robRanking", value: true };
	}
	if (filters.robRankingStatus === "not_appears") {
		return { kind: "robRanking", value: false };
	}

	return { kind: "default" };
}

export function appendAlbumLibrarySearchIndexFilters(
	filters: AlbumLibraryFilters,
	// biome-ignore lint/suspicious/noExplicitAny: Convex search index builder lacks one exported type.
	qb: any,
	// biome-ignore lint/suspicious/noExplicitAny: same
): any {
	let out = qb;
	if (filters.releaseYear !== undefined) {
		out = out.eq("releaseYear", filters.releaseYear);
	}
	if (filters.listenStatus === "listened") {
		out = out.eq("filterHasListened", true);
	} else if (filters.listenStatus === "unlistened") {
		out = out.eq("filterHasListened", false);
	}
	if (filters.rymStatus === "linked" || filters.rymStatus === "unlinked") {
		out = out.eq("rymStatus", filters.rymStatus);
	}
	if (filters.albumType === "album" || filters.albumType === "single") {
		out = out.eq("albumType", filters.albumType);
	}
	if (filters.robRankingStatus === "appears") {
		out = out.eq("appearsInRobRankings", true);
	} else if (filters.robRankingStatus === "not_appears") {
		out = out.eq("appearsInRobRankings", false);
	}
	return out;
}

export function appendAlbumLibraryProjectionFilters(
	filters: AlbumLibraryFilters,
	options: {
		skipYear?: boolean;
		skipListened?: boolean;
		skipRym?: boolean;
		skipAlbumType?: boolean;
		skipRobRanking?: boolean;
	},
	// biome-ignore lint/suspicious/noExplicitAny: Convex indexed `.filter` chains lack one exported builder type.
	q: any,
	// biome-ignore lint/suspicious/noExplicitAny: same
): any {
	let out = q;

	if (!options.skipYear && filters.releaseYear !== undefined) {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("releaseYear"), filters.releaseYear),
		);
	}

	if (!options.skipListened && filters.listenStatus === "listened") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("filterHasListened"), true),
		);
	} else if (!options.skipListened && filters.listenStatus === "unlistened") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("filterHasListened"), false),
		);
	}

	if (!options.skipRym && filters.rymStatus === "linked") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("rymStatus"), "linked"),
		);
	} else if (!options.skipRym && filters.rymStatus === "unlinked") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("rymStatus"), "unlinked"),
		);
	}

	if (!options.skipAlbumType && filters.albumType === "album") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("albumType"), "album"),
		);
	} else if (!options.skipAlbumType && filters.albumType === "single") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("albumType"), "single"),
		);
	}

	if (!options.skipRobRanking && filters.robRankingStatus === "appears") {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("appearsInRobRankings"), true),
		);
	} else if (
		!options.skipRobRanking &&
		filters.robRankingStatus === "not_appears"
	) {
		out = out.filter(
			(fb: {
				eq: (a: unknown, b: unknown) => unknown;
				field: (name: string) => unknown;
			}) => fb.eq(fb.field("appearsInRobRankings"), false),
		);
	}

	return out;
}

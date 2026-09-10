/** Bound stream scans when post-filtering listens so pages stay full. */
export const LISTEN_FILTER_MAXIMUM_ROWS_READ = 2_000;

export type AlbumListenFilterOpts = {
	onlyUnranked: boolean;
	onlyFirstListens: boolean;
	yearMin?: number;
	yearMax?: number;
};

export type ListenFilterIndexChoice =
	| { kind: "firstListen" }
	| { kind: "unranked" }
	| { kind: "releaseYear"; year: number }
	| { kind: "listenedAt" };

export function listensFiltersAreActive(opts: AlbumListenFilterOpts): boolean {
	return (
		opts.onlyUnranked ||
		opts.onlyFirstListens ||
		opts.yearMin !== undefined ||
		opts.yearMax !== undefined
	);
}

export function parseListenReleaseYear(
	releaseDate: string | undefined,
): number | undefined {
	if (!releaseDate || releaseDate.length < 4) {
		return undefined;
	}
	const yearStr = releaseDate.slice(0, 4);
	if (!/^\d{4}$/.test(yearStr)) {
		return undefined;
	}
	const year = Number.parseInt(yearStr, 10);
	return Number.isFinite(year) ? year : undefined;
}

export function listenMatchesUnrankedFilter(
	rating: number | undefined,
	onlyUnranked: boolean,
): boolean {
	if (!onlyUnranked) {
		return true;
	}
	return rating === undefined;
}

export function listenMatchesFirstListenFilter(
	listenedAt: number,
	firstListenedAt: number | undefined,
	onlyFirstListens: boolean,
): boolean {
	if (!onlyFirstListens) {
		return true;
	}
	return firstListenedAt !== undefined && listenedAt === firstListenedAt;
}

export function listenMatchesReleaseYearFilter(
	releaseDate: string | undefined,
	yearMin: number | undefined,
	yearMax: number | undefined,
): boolean {
	if (yearMin === undefined && yearMax === undefined) {
		return true;
	}
	const year = parseListenReleaseYear(releaseDate);
	if (year === undefined) {
		return false;
	}
	if (yearMin !== undefined && year < yearMin) {
		return false;
	}
	if (yearMax !== undefined && year > yearMax) {
		return false;
	}
	return true;
}

export function listenMatchesAlbumListenFilters(
	listen: { listenedAt: number },
	userAlbum: { rating?: number; firstListenedAt?: number } | null | undefined,
	album: { releaseDate?: string } | null | undefined,
	opts: AlbumListenFilterOpts,
): boolean {
	if (!listenMatchesUnrankedFilter(userAlbum?.rating, opts.onlyUnranked)) {
		return false;
	}
	if (
		!listenMatchesFirstListenFilter(
			listen.listenedAt,
			userAlbum?.firstListenedAt,
			opts.onlyFirstListens,
		)
	) {
		return false;
	}
	if (
		!listenMatchesReleaseYearFilter(
			album?.releaseDate,
			opts.yearMin,
			opts.yearMax,
		)
	) {
		return false;
	}
	return true;
}

/**
 * Prefer the most selective equality index; remaining constraints use cheap
 * denormalized field checks (no joins).
 */
export function chooseListenFilterIndex(
	opts: AlbumListenFilterOpts,
): ListenFilterIndexChoice {
	if (opts.onlyFirstListens) {
		return { kind: "firstListen" };
	}
	if (opts.onlyUnranked) {
		return { kind: "unranked" };
	}
	if (
		opts.yearMin !== undefined &&
		opts.yearMax !== undefined &&
		opts.yearMin === opts.yearMax
	) {
		return { kind: "releaseYear", year: opts.yearMin };
	}
	return { kind: "listenedAt" };
}

export function listenFilterNeedsPostFilter(
	opts: AlbumListenFilterOpts,
	indexChoice: ListenFilterIndexChoice,
): boolean {
	if (opts.onlyUnranked && indexChoice.kind !== "unranked") {
		return true;
	}
	if (opts.onlyFirstListens && indexChoice.kind !== "firstListen") {
		return true;
	}
	if (
		(opts.yearMin !== undefined || opts.yearMax !== undefined) &&
		indexChoice.kind !== "releaseYear"
	) {
		return true;
	}
	return false;
}

/** Match using denormalized fields on the listen row (no joins). */
export function listenMatchesDenormalizedFilters(
	listen: {
		isFirstListen?: boolean;
		hasRating?: boolean;
		releaseYear?: number;
	},
	opts: AlbumListenFilterOpts,
): boolean {
	if (opts.onlyUnranked && listen.hasRating !== false) {
		return false;
	}
	if (opts.onlyFirstListens && listen.isFirstListen !== true) {
		return false;
	}
	if (opts.yearMin !== undefined || opts.yearMax !== undefined) {
		if (listen.releaseYear === undefined) {
			return false;
		}
		if (opts.yearMin !== undefined && listen.releaseYear < opts.yearMin) {
			return false;
		}
		if (opts.yearMax !== undefined && listen.releaseYear > opts.yearMax) {
			return false;
		}
	}
	return true;
}

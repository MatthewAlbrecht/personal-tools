export type GenreRole = "primary" | "secondary" | "either";
export type GenreClause = {
	genreKey: string;
	mode: "include" | "exclude";
	role: GenreRole;
};

export type SmartPlaylistFiltersV2 = {
	genreClauses: GenreClause[];
	genreMatch: "all" | "any";
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin: number;
	ratingMax: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
	addedWindow?:
		| { type: "absolute"; afterMs?: number; beforeMs?: number }
		| { type: "relative"; unit: "days" | "months"; amount: number }
		| { type: "calendar_month"; year: number; month: number };
	excludedAlbumIds: string[];
};

export type LegacySmartPlaylistFilters = {
	genreKeys: string[];
	genreMatch: "all" | "any";
	primaryGenresOnly: boolean;
	descriptorKeys: string[];
	descriptorMatch: "all" | "any";
	ratingMin?: number;
	ratingMax?: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationBucketKey?: string;
	addedWindow?: SmartPlaylistFiltersV2["addedWindow"];
};

export const EMPTY_SMART_PLAYLIST_FILTERS: SmartPlaylistFiltersV2 = {
	genreClauses: [],
	genreMatch: "any",
	descriptorKeys: [],
	descriptorMatch: "any",
	ratingMin: 1,
	ratingMax: 15,
	durationOpenLow: true,
	durationOpenHigh: true,
	excludedAlbumIds: [],
};

export function isLegacySmartPlaylistFilters(
	filters: LegacySmartPlaylistFilters | SmartPlaylistFiltersV2,
): filters is LegacySmartPlaylistFilters {
	return "genreKeys" in filters && Array.isArray(filters.genreKeys);
}

export function migrateLegacySmartPlaylistFilters(
	legacy: LegacySmartPlaylistFilters,
): SmartPlaylistFiltersV2 {
	const role = legacy.primaryGenresOnly ? "primary" : "either";
	return {
		genreClauses: legacy.genreKeys.map((genreKey) => ({
			genreKey,
			mode: "include",
			role,
		})),
		genreMatch: legacy.genreMatch,
		descriptorKeys: legacy.descriptorKeys,
		descriptorMatch: legacy.descriptorMatch,
		ratingMin: legacy.ratingMin ?? 1,
		ratingMax: legacy.ratingMax ?? 15,
		yearMin: legacy.yearMin,
		yearMax: legacy.yearMax,
		durationMinMinutes: legacy.durationMinMinutes,
		durationMaxMinutes: legacy.durationMaxMinutes,
		durationOpenLow:
			legacy.durationMinMinutes === undefined &&
			legacy.durationBucketKey === undefined,
		durationOpenHigh: legacy.durationMaxMinutes === undefined,
		addedWindow: legacy.addedWindow,
		excludedAlbumIds: [],
	};
}

export function normalizeSmartPlaylistFilters(
	filters: LegacySmartPlaylistFilters | SmartPlaylistFiltersV2,
): SmartPlaylistFiltersV2 {
	if (isLegacySmartPlaylistFilters(filters)) {
		return migrateLegacySmartPlaylistFilters(filters);
	}
	return {
		...EMPTY_SMART_PLAYLIST_FILTERS,
		...filters,
		genreClauses: filters.genreClauses ?? [],
		excludedAlbumIds: filters.excludedAlbumIds ?? [],
		ratingMin: filters.ratingMin ?? 1,
		ratingMax: filters.ratingMax ?? 15,
	};
}

export function isRatingFilterActive(filters: {
	ratingMin: number;
	ratingMax: number;
}): boolean {
	return !(filters.ratingMin === 1 && filters.ratingMax === 15);
}

export function durationBoundsFromFilters(filters: {
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
}): { minMinutes?: number; maxMinutes?: number; active: boolean } {
	const openLow = filters.durationOpenLow === true;
	const openHigh = filters.durationOpenHigh === true;
	if (openLow && openHigh) {
		return { minMinutes: undefined, maxMinutes: undefined, active: false };
	}
	return {
		minMinutes: openLow ? undefined : filters.durationMinMinutes,
		maxMinutes: openHigh ? undefined : filters.durationMaxMinutes,
		active: true,
	};
}

export function albumMatchesDurationFilter(
	durationMs: number | undefined,
	filters: {
		durationMinMinutes?: number;
		durationMaxMinutes?: number;
		durationOpenLow?: boolean;
		durationOpenHigh?: boolean;
	},
): boolean {
	const bounds = durationBoundsFromFilters(filters);
	if (!bounds.active) {
		return true;
	}
	if (durationMs === undefined) {
		return false;
	}
	const minutes = durationMs / 60_000;
	if (bounds.minMinutes !== undefined && minutes < bounds.minMinutes) {
		return false;
	}
	if (bounds.maxMinutes !== undefined && minutes > bounds.maxMinutes) {
		return false;
	}
	return true;
}

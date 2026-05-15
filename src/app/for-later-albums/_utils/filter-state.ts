import type {
	ForLaterFilters,
	ForLaterGenreRoleFilter,
	ForLaterListenedFilter,
	ForLaterPlaylistFilter,
	ForLaterRymFilter,
} from "./types";

const LISTENED_VALUES = new Set<ForLaterListenedFilter>([
	"all",
	"listened",
	"not_listened",
]);
const RYM_VALUES = new Set<ForLaterRymFilter>([
	"all",
	"has_scrape",
	"no_scrape",
	"has_candidate",
	"no_candidate",
]);
const PLAYLIST_VALUES = new Set<ForLaterPlaylistFilter>([
	"active",
	"removed",
	"all",
]);
const GENRE_ROLE_VALUES = new Set<ForLaterGenreRoleFilter>([
	"primary",
	"secondary",
	"either",
]);

export function parseForLaterFilters(params: URLSearchParams): ForLaterFilters {
	const year = params.get("year");
	return {
		genreKey: optionalString(params.get("genre")),
		genreRole: parseEnum(params.get("genreRole"), GENRE_ROLE_VALUES, "either"),
		descriptorKey: optionalString(params.get("descriptor")),
		title: optionalString(params.get("title")),
		artist: optionalString(params.get("artist")),
		year: year && /^\d{4}$/.test(year) ? Number.parseInt(year, 10) : undefined,
		listened: parseEnum(params.get("listened"), LISTENED_VALUES, "all"),
		rymStatus: parseEnum(params.get("rymStatus"), RYM_VALUES, "all"),
		playlist: parseEnum(params.get("playlist"), PLAYLIST_VALUES, "active"),
	};
}

export function serializeForLaterFilters(
	filters: ForLaterFilters,
): URLSearchParams {
	const params = new URLSearchParams();
	setIfPresent(params, "genre", filters.genreKey);
	setIfNotDefault(params, "genreRole", filters.genreRole, "either");
	setIfPresent(params, "descriptor", filters.descriptorKey);
	setIfPresent(params, "title", filters.title);
	setIfPresent(params, "artist", filters.artist);
	if (filters.year !== undefined) {
		params.set("year", String(filters.year));
	}
	setIfNotDefault(params, "listened", filters.listened, "all");
	setIfNotDefault(params, "rymStatus", filters.rymStatus, "all");
	setIfNotDefault(params, "playlist", filters.playlist, "active");
	return params;
}

function optionalString(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseEnum<T extends string>(
	value: string | null,
	allowed: Set<T>,
	fallback: T,
): T {
	if (value && allowed.has(value as T)) {
		return value as T;
	}
	return fallback;
}

function setIfPresent(
	params: URLSearchParams,
	key: string,
	value: string | undefined,
): void {
	if (value?.trim()) {
		params.set(key, value.trim());
	}
}

function setIfNotDefault<T extends string>(
	params: URLSearchParams,
	key: string,
	value: T,
	defaultValue: T,
): void {
	if (value !== defaultValue) {
		params.set(key, value);
	}
}

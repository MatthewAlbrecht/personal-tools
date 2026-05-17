import type {
	ForLaterFilterMatch,
	ForLaterFilters,
	ForLaterListenedFilter,
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
const FILTER_MATCH_VALUES = new Set<ForLaterFilterMatch>(["all", "any"]);

function normalizeTaxonomyFilterKey(raw: string): string {
	return raw.trim().toLowerCase();
}

export function parseKeyList(params: URLSearchParams, key: string): string[] {
	const seen = new Set<string>();
	for (const raw of params.getAll(key)) {
		const normalized = normalizeTaxonomyFilterKey(raw);
		if (normalized) {
			seen.add(normalized);
		}
	}
	return [...seen].sort();
}

export function addUniqueSortedKey(keys: string[], add: string): string[] {
	const normalized = normalizeTaxonomyFilterKey(add);
	if (!normalized) {
		return keys;
	}
	const next = new Set(keys.map((k) => normalizeTaxonomyFilterKey(k)));
	next.add(normalized);
	return [...next].sort();
}

export function parseForLaterFilters(params: URLSearchParams): ForLaterFilters {
	const year = params.get("year");
	const q = optionalString(params.get("q"));
	const legacyTitle = optionalString(params.get("title"));
	const legacyArtist = optionalString(params.get("artist"));
	const legacySearch =
		q ??
		([legacyTitle, legacyArtist].filter(Boolean).join(" ").trim() || undefined);
	return {
		genreKeys: parseKeyList(params, "genre"),
		descriptorKeys: parseKeyList(params, "descriptor"),
		search: legacySearch,
		year: year && /^\d{4}$/.test(year) ? Number.parseInt(year, 10) : undefined,
		listened: parseEnum(params.get("listened"), LISTENED_VALUES, "all"),
		rymStatus: parseEnum(params.get("rymStatus"), RYM_VALUES, "all"),
		filterMatch: parseEnum(params.get("match"), FILTER_MATCH_VALUES, "all"),
	};
}

export function serializeForLaterFilters(
	filters: ForLaterFilters,
): URLSearchParams {
	const params = new URLSearchParams();
	for (const key of filters.genreKeys) {
		params.append("genre", key);
	}
	for (const key of filters.descriptorKeys) {
		params.append("descriptor", key);
	}
	setIfPresent(params, "q", filters.search);
	if (filters.year !== undefined) {
		params.set("year", String(filters.year));
	}
	setIfNotDefault(params, "listened", filters.listened, "all");
	setIfNotDefault(params, "rymStatus", filters.rymStatus, "all");
	setIfNotDefault(params, "match", filters.filterMatch, "all");
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

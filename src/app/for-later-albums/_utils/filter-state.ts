import type {
	ForLaterFilters,
	ForLaterListenedFilter,
	ForLaterRymFilter,
	ForLaterTaxonomyMatch,
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
	"not_on_rym",
]);
const TAXONOMY_MATCH_VALUES = new Set<ForLaterTaxonomyMatch>(["all", "any"]);

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

function parseTaxonomyMatch(primary: string | null, legacy: string | null) {
	const parsedPrimary =
		primary && TAXONOMY_MATCH_VALUES.has(primary as ForLaterTaxonomyMatch)
			? (primary as ForLaterTaxonomyMatch)
			: undefined;
	const parsedLegacy =
		legacy && TAXONOMY_MATCH_VALUES.has(legacy as ForLaterTaxonomyMatch)
			? (legacy as ForLaterTaxonomyMatch)
			: undefined;
	return parsedPrimary ?? parsedLegacy ?? "all";
}

function parseYearBound(
	params: URLSearchParams,
	key: string,
): number | undefined {
	const raw = params.get(key);
	if (!raw || !/^\d{4}$/.test(raw)) {
		return undefined;
	}
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : undefined;
}

function parseDurationBound(
	params: URLSearchParams,
	key: string,
): number | undefined {
	const raw = params.get(key);
	if (!raw || !/^\d+$/.test(raw)) {
		return undefined;
	}
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function parseForLaterFilters(params: URLSearchParams): ForLaterFilters {
	const legacyYear = params.get("year");
	const yearMin =
		parseYearBound(params, "yearMin") ??
		(legacyYear && /^\d{4}$/.test(legacyYear)
			? Number.parseInt(legacyYear, 10)
			: undefined);
	const yearMax =
		parseYearBound(params, "yearMax") ??
		(legacyYear && /^\d{4}$/.test(legacyYear)
			? Number.parseInt(legacyYear, 10)
			: undefined);
	const q = optionalString(params.get("q"));
	const legacyTitle = optionalString(params.get("title"));
	const legacyArtist = optionalString(params.get("artist"));
	const legacySearch =
		q ??
		([legacyTitle, legacyArtist].filter(Boolean).join(" ").trim() || undefined);
	const legacyMatch = params.get("match");
	return {
		genreKeys: parseKeyList(params, "genre"),
		descriptorKeys: parseKeyList(params, "descriptor"),
		search: legacySearch,
		yearMin,
		yearMax,
		durationMinMinutes: parseDurationBound(params, "durationMin"),
		durationMaxMinutes: parseDurationBound(params, "durationMax"),
		listened: parseEnum(params.get("listened"), LISTENED_VALUES, "all"),
		rymStatus: parseEnum(params.get("rymStatus"), RYM_VALUES, "all"),
		genreMatch: parseTaxonomyMatch(params.get("genreMatch"), legacyMatch),
		descriptorMatch: parseTaxonomyMatch(
			params.get("descriptorMatch"),
			legacyMatch,
		),
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
	if (filters.yearMin !== undefined) {
		params.set("yearMin", String(filters.yearMin));
	}
	if (filters.yearMax !== undefined) {
		params.set("yearMax", String(filters.yearMax));
	}
	if (filters.durationMinMinutes !== undefined) {
		params.set("durationMin", String(filters.durationMinMinutes));
	}
	if (filters.durationMaxMinutes !== undefined) {
		params.set("durationMax", String(filters.durationMaxMinutes));
	}
	setIfNotDefault(params, "listened", filters.listened, "all");
	setIfNotDefault(params, "rymStatus", filters.rymStatus, "all");
	setIfNotDefault(params, "genreMatch", filters.genreMatch, "all");
	setIfNotDefault(params, "descriptorMatch", filters.descriptorMatch, "all");
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

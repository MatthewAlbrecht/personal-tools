import type { SmartPlaylistFilters, SmartPlaylistSource } from "./types";

const SOURCE_LABELS: Record<SmartPlaylistSource, string> = {
	forLater: "For Later",
	rankings: "Rankings",
};

const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

export function formatRuleSummary({
	source,
	filters,
	genreLabels,
}: {
	source: SmartPlaylistSource;
	filters: SmartPlaylistFilters;
	genreLabels?: Record<string, string>;
}): string {
	const segments: string[] = [SOURCE_LABELS[source]];

	const genreSegment = formatGenreSegment(filters, genreLabels);
	if (genreSegment) segments.push(genreSegment);

	const ratingSegment = formatRatingSegment(filters);
	if (ratingSegment) segments.push(ratingSegment);

	const yearSegment = formatYearSegment(filters);
	if (yearSegment) segments.push(yearSegment);

	const durationSegment = formatDurationSegment(filters);
	if (durationSegment) segments.push(durationSegment);

	const addedSegment = formatAddedSegment(filters);
	if (addedSegment) segments.push(addedSegment);

	return segments.join(" · ");
}

function formatGenreSegment(
	filters: SmartPlaylistFilters,
	genreLabels?: Record<string, string>,
): string | undefined {
	if (filters.genreKeys.length === 0) return undefined;

	const labels = filters.genreKeys.map((key) => genreLabels?.[key] ?? key);
	const genreStr = labels.join(", ");
	return filters.primaryGenresOnly ? `${genreStr} (primary)` : genreStr;
}

function formatRatingSegment(
	filters: SmartPlaylistFilters,
): string | undefined {
	const { ratingMin, ratingMax } = filters;
	if (ratingMin !== undefined && ratingMax !== undefined) {
		return `rating ${ratingMin}–${ratingMax}`;
	}
	if (ratingMin !== undefined) return `rating ${ratingMin}+`;
	if (ratingMax !== undefined) return `rating ≤${ratingMax}`;
	return undefined;
}

function formatYearSegment(filters: SmartPlaylistFilters): string | undefined {
	const { yearMin, yearMax } = filters;
	if (yearMin !== undefined && yearMax !== undefined) {
		return yearMin === yearMax ? String(yearMin) : `${yearMin}–${yearMax}`;
	}
	if (yearMin !== undefined) return `${yearMin}+`;
	if (yearMax !== undefined) return `≤${yearMax}`;
	return undefined;
}

function formatDurationSegment(
	filters: SmartPlaylistFilters,
): string | undefined {
	const { durationMinMinutes, durationMaxMinutes } = filters;
	if (durationMinMinutes !== undefined && durationMaxMinutes !== undefined) {
		return `${durationMinMinutes}–${durationMaxMinutes}m`;
	}
	if (durationMaxMinutes !== undefined) return `under ${durationMaxMinutes}m`;
	if (durationMinMinutes !== undefined) return `${durationMinMinutes}m+`;
	return undefined;
}

function formatAddedSegment(filters: SmartPlaylistFilters): string | undefined {
	const window = filters.addedWindow;
	if (!window) return undefined;

	switch (window.type) {
		case "calendar_month":
			return `added ${MONTH_NAMES[window.month - 1]} ${window.year}`;
		case "relative":
			return `added last ${window.amount} ${window.unit}`;
		case "absolute":
			if (window.afterMs !== undefined || window.beforeMs !== undefined) {
				return "added (custom range)";
			}
			return undefined;
	}
}

import { getTierLabel } from "~/lib/album-tiers";
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

	if (filters.excludedAlbumIds.length > 0) {
		segments.push(`−${filters.excludedAlbumIds.length} excluded`);
	}

	return segments.join(" · ");
}

function formatGenreSegment(
	filters: SmartPlaylistFilters,
	genreLabels?: Record<string, string>,
): string | undefined {
	if (filters.genreClauses.length === 0) return undefined;

	const parts = filters.genreClauses.map((c) => {
		const label = genreLabels?.[c.genreKey] ?? c.genreKey;
		const role = c.role === "either" ? "" : ` (${c.role})`;
		return c.mode === "exclude" ? `!${label}${role}` : `${label}${role}`;
	});

	return parts.join(filters.genreMatch === "all" ? " + " : ", ");
}

function formatRatingSegment(
	filters: SmartPlaylistFilters,
): string | undefined {
	const { ratingMin, ratingMax } = filters;
	if (ratingMin === 1 && ratingMax === 15) return undefined;

	if (ratingMin === ratingMax) {
		return getTierLabel(ratingMin);
	}

	return `rating ${ratingMin}–${ratingMax}`;
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
	if (filters.durationOpenLow && filters.durationOpenHigh) return undefined;

	if (filters.durationOpenLow && filters.durationMaxMinutes !== undefined) {
		return `under ${filters.durationMaxMinutes}m`;
	}

	if (filters.durationOpenHigh && filters.durationMinMinutes !== undefined) {
		return `${filters.durationMinMinutes}m+`;
	}

	if (
		filters.durationMinMinutes !== undefined &&
		filters.durationMaxMinutes !== undefined
	) {
		return `${filters.durationMinMinutes}–${filters.durationMaxMinutes}m`;
	}

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

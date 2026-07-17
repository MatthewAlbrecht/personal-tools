export const DURATION_SLIDER_MAX_INDEX = 71;

export type DurationFilterPatch = {
	durationOpenLow: boolean;
	durationOpenHigh: boolean;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
};

export function durationFiltersFromIndices(
	low: number,
	high: number,
): DurationFilterPatch {
	const lo = Math.min(low, high);
	const hi = Math.max(low, high);
	return {
		durationOpenLow: lo === 0,
		durationOpenHigh: hi === DURATION_SLIDER_MAX_INDEX,
		durationMinMinutes: lo === 0 ? undefined : 20 + (lo - 1),
		durationMaxMinutes:
			hi === DURATION_SLIDER_MAX_INDEX ? undefined : 20 + (hi - 1),
	};
}

export function indicesFromDurationFilters(filters: {
	durationOpenLow?: boolean;
	durationOpenHigh?: boolean;
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
}): [number, number] {
	const low =
		filters.durationOpenLow === true || filters.durationMinMinutes === undefined
			? 0
			: 1 + (filters.durationMinMinutes - 20);
	const high =
		filters.durationOpenHigh === true ||
		filters.durationMaxMinutes === undefined
			? DURATION_SLIDER_MAX_INDEX
			: 1 + (filters.durationMaxMinutes - 20);
	return [low, high];
}

export function formatDurationHandleLabel(index: number): string {
	if (index === 0) return "<20m";
	if (index === DURATION_SLIDER_MAX_INDEX) return "1h30m+";
	const minutes = 20 + (index - 1);
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? `${h}h${m.toString().padStart(2, "0")}m` : `${m}m`;
}

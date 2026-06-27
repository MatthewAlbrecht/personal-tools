import type { RecommendationTagOption } from "./forLaterRecommendations";

export type ForLaterDurationBucketKey =
	| "under_20"
	| "20_30"
	| "30_40"
	| "40_50"
	| "50_60"
	| "60_70"
	| "70_plus";

export type DurationBucketAnswer = ForLaterDurationBucketKey | "any";

const MINUTE_MS = 60 * 1000;

type DurationBucketDefinition = {
	key: ForLaterDurationBucketKey;
	label: string;
	minMinutes: number;
	maxMinutes?: number;
};

export const FOR_LATER_DURATION_BUCKET_DEFINITIONS: readonly DurationBucketDefinition[] =
	[
		{ key: "under_20", label: "< 20 min", minMinutes: 0, maxMinutes: 20 },
		{ key: "20_30", label: "20–30 min", minMinutes: 20, maxMinutes: 30 },
		{ key: "30_40", label: "30–40 min", minMinutes: 30, maxMinutes: 40 },
		{ key: "40_50", label: "40–50 min", minMinutes: 40, maxMinutes: 50 },
		{ key: "50_60", label: "50–60 min", minMinutes: 50, maxMinutes: 60 },
		{ key: "60_70", label: "60–70 min", minMinutes: 60, maxMinutes: 70 },
		{ key: "70_plus", label: "70+ min", minMinutes: 70 },
	];

export const FOR_LATER_DURATION_BUCKET_KEYS: readonly ForLaterDurationBucketKey[] =
	FOR_LATER_DURATION_BUCKET_DEFINITIONS.map((definition) => definition.key);

const DURATION_BUCKET_KEY_SET = new Set<string>(FOR_LATER_DURATION_BUCKET_KEYS);

export const FOR_LATER_DURATION_BUCKET_OPTIONS: readonly RecommendationTagOption[] =
	FOR_LATER_DURATION_BUCKET_DEFINITIONS.map((definition) => ({
		key: definition.key,
		label: definition.label,
		count: 0,
	}));

export function durationBucketKeyFromMinutes(
	value: string | undefined,
): ForLaterDurationBucketKey | undefined {
	const trimmed = value?.trim();
	if (!trimmed || !DURATION_BUCKET_KEY_SET.has(trimmed)) {
		return undefined;
	}
	return trimmed as ForLaterDurationBucketKey;
}

export function durationMsToBucketKey(
	durationMs: number | undefined,
): ForLaterDurationBucketKey | undefined {
	if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
		return undefined;
	}

	const durationMinutes = durationMs / MINUTE_MS;

	for (const definition of FOR_LATER_DURATION_BUCKET_DEFINITIONS) {
		if (durationMinutes < definition.minMinutes) {
			continue;
		}
		if (
			definition.maxMinutes !== undefined &&
			durationMinutes >= definition.maxMinutes
		) {
			continue;
		}
		return definition.key;
	}

	return undefined;
}

export function durationBucketMatches(
	filterDurationMs: number | undefined,
	durationBucket: DurationBucketAnswer,
): boolean {
	if (durationBucket === "any") {
		return true;
	}

	if (filterDurationMs === undefined) {
		return false;
	}

	return durationMsToBucketKey(filterDurationMs) === durationBucket;
}

export function buildDurationBucketCounts(
	items: readonly { filterDurationMs?: number }[],
): RecommendationTagOption[] {
	const counts = new Map<ForLaterDurationBucketKey, number>(
		FOR_LATER_DURATION_BUCKET_KEYS.map((key) => [key, 0]),
	);

	for (const item of items) {
		const bucketKey = durationMsToBucketKey(item.filterDurationMs);
		if (bucketKey === undefined) {
			continue;
		}
		counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
	}

	return FOR_LATER_DURATION_BUCKET_DEFINITIONS.map((definition) => ({
		key: definition.key,
		label: definition.label,
		count: counts.get(definition.key) ?? 0,
	}));
}

export function durationBucketFilterBounds(bucketKey: ForLaterDurationBucketKey): {
	durationMinMinutes?: number;
	durationMaxMinutes?: number;
} {
	const definition = FOR_LATER_DURATION_BUCKET_DEFINITIONS.find(
		(entry) => entry.key === bucketKey,
	);
	if (!definition) {
		return {};
	}

	if (definition.maxMinutes === undefined) {
		return { durationMinMinutes: definition.minMinutes };
	}

	return {
		durationMinMinutes: definition.minMinutes,
		durationMaxMinutes: definition.maxMinutes - 1,
	};
}

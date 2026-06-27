import { resolveTopLevelGenreKey } from "./rymGenreHierarchy";

export type AddedTimeframeAnswer =
	| "day"
	| "week"
	| "month"
	| "two_months"
	| "older_than_two_months"
	| "any";

export type ReleaseTimeAnswer =
	| "new_release"
	| "recent"
	| "modern"
	| "old"
	| "any";

export type RatingTierAnswer = "holy_moly" | "really_enjoyed" | "good" | "any";

export type DurationTierAnswer = "short" | "medium" | "long" | "any";

export type ForLaterRecommendationCandidate = {
	id: string;
	playlistAddedAt?: number;
	firstSeenAt?: number;
	createdAt: number;
	releaseYear?: number;
	filterDurationMs?: number;
	filterGenreKeysSorted: string[];
	filterDescriptorKeysSorted: string[];
	rating?: number;
	markedAsSingle?: boolean;
	removedFromForLater?: boolean;
};

export type ForLaterRecommendationAnswers = {
	addedTimeframe: AddedTimeframeAnswer;
	genreKey: string;
	releaseTime: ReleaseTimeAnswer;
	descriptorKey: string;
	ratingTier: RatingTierAnswer;
	durationTier: DurationTierAnswer;
	count: number;
};

export type RecommendationTagInput = {
	key: string;
	label: string;
};

export type RecommendationTagOption = RecommendationTagInput & {
	count: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SHORT_DURATION_MAX_MS = 35 * MINUTE_MS;
const LONG_DURATION_MIN_MS = 55 * MINUTE_MS;
const MIN_RECOMMENDATION_COUNT = 1;
const MAX_RECOMMENDATION_COUNT = 5;

export function normalizeRecommendationCount(count?: number): number {
	if (count === undefined) {
		return MIN_RECOMMENDATION_COUNT;
	}

	if (!Number.isFinite(count)) {
		return count > MAX_RECOMMENDATION_COUNT
			? MAX_RECOMMENDATION_COUNT
			: MIN_RECOMMENDATION_COUNT;
	}

	const integerCount = Math.trunc(count);

	if (integerCount < MIN_RECOMMENDATION_COUNT) {
		return MIN_RECOMMENDATION_COUNT;
	}

	if (integerCount > MAX_RECOMMENDATION_COUNT) {
		return MAX_RECOMMENDATION_COUNT;
	}

	return integerCount;
}

export function recommendationAddedAt(
	candidate: ForLaterRecommendationCandidate,
): number {
	return (
		candidate.playlistAddedAt ?? candidate.firstSeenAt ?? candidate.createdAt
	);
}

export function addedTimeframeMatches(
	candidate: ForLaterRecommendationCandidate,
	addedTimeframe: AddedTimeframeAnswer,
	now: number,
): boolean {
	if (addedTimeframe === "any") {
		return true;
	}

	const ageMs = now - recommendationAddedAt(candidate);

	if (ageMs < 0) {
		return false;
	}

	switch (addedTimeframe) {
		case "day":
			return ageMs <= DAY_MS;
		case "week":
			return ageMs > DAY_MS && ageMs <= 7 * DAY_MS;
		case "month":
			return ageMs > 7 * DAY_MS && ageMs <= 30 * DAY_MS;
		case "two_months":
			return ageMs > 30 * DAY_MS && ageMs <= 60 * DAY_MS;
		case "older_than_two_months":
			return ageMs > 60 * DAY_MS;
	}
}

export function releaseTimeMatches(
	candidate: ForLaterRecommendationCandidate,
	releaseTime: ReleaseTimeAnswer,
	now: number,
): boolean {
	if (releaseTime === "any") {
		return true;
	}

	if (candidate.releaseYear === undefined) {
		return false;
	}

	const currentYear = new Date(now).getUTCFullYear();
	const releaseAge = currentYear - candidate.releaseYear;

	if (releaseAge < 0) {
		return false;
	}

	switch (releaseTime) {
		case "new_release":
			return releaseAge <= 1;
		case "recent":
			return releaseAge >= 2 && releaseAge <= 5;
		case "modern":
			return releaseAge >= 6 && releaseAge <= 20;
		case "old":
			return releaseAge > 20;
	}
}

export function ratingTierMatches(
	rating: number | undefined,
	ratingTier: RatingTierAnswer,
): boolean {
	if (ratingTier === "any") {
		return true;
	}

	if (rating === undefined) {
		return false;
	}

	switch (ratingTier) {
		case "holy_moly":
			return rating >= 13 && rating <= 15;
		case "really_enjoyed":
			return rating >= 10 && rating <= 12;
		case "good":
			return rating >= 7 && rating <= 9;
	}
}

export function durationTierMatches(
	filterDurationMs: number | undefined,
	durationTier: DurationTierAnswer,
): boolean {
	if (durationTier === "any") {
		return true;
	}

	if (filterDurationMs === undefined) {
		return false;
	}

	switch (durationTier) {
		case "short":
			return filterDurationMs < SHORT_DURATION_MAX_MS;
		case "medium":
			return (
				filterDurationMs >= SHORT_DURATION_MAX_MS &&
				filterDurationMs <= LONG_DURATION_MIN_MS
			);
		case "long":
			return filterDurationMs > LONG_DURATION_MIN_MS;
	}
}

export function candidateMatchesRecommendationAnswers(
	candidate: ForLaterRecommendationCandidate,
	answers: ForLaterRecommendationAnswers,
	now: number,
): boolean {
	if (candidate.markedAsSingle || candidate.removedFromForLater) {
		return false;
	}

	if (!addedTimeframeMatches(candidate, answers.addedTimeframe, now)) {
		return false;
	}

	if (!releaseTimeMatches(candidate, answers.releaseTime, now)) {
		return false;
	}

	if (!durationTierMatches(candidate.filterDurationMs, answers.durationTier)) {
		return false;
	}

	if (!ratingTierMatches(candidate.rating, answers.ratingTier)) {
		return false;
	}

	if (
		answers.genreKey !== "any" &&
		!candidate.filterGenreKeysSorted.includes(answers.genreKey)
	) {
		return false;
	}

	if (
		answers.descriptorKey !== "any" &&
		!candidate.filterDescriptorKeysSorted.includes(answers.descriptorKey)
	) {
		return false;
	}

	return true;
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
	const shuffled = [...items];
	const random = createSeededRandom(seed);

	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[shuffled[index], shuffled[swapIndex]] = [
			shuffled[swapIndex] as T,
			shuffled[index] as T,
		];
	}

	return shuffled;
}

export function chooseRecommendationRows<
	T extends ForLaterRecommendationCandidate,
>(rows: readonly T[], count: number, seed: string): T[] {
	return seededShuffle(rows, seed).slice(
		0,
		normalizeRecommendationCount(count),
	);
}

export function buildTopLevelGenreCounts(args: {
	albumPrimaryGenreKeys: readonly (readonly string[])[];
	topLevelGenreKeys: ReadonlySet<string>;
	parentKeysByChild: ReadonlyMap<string, readonly string[]>;
}): Map<string, number> {
	const counts = new Map<string, number>();

	for (const primaryGenreKeys of args.albumPrimaryGenreKeys) {
		const topLevelsForAlbum = new Set<string>();

		for (const genreKey of primaryGenreKeys) {
			const topLevelKey = resolveTopLevelGenreKey(
				genreKey,
				args.parentKeysByChild,
				args.topLevelGenreKeys,
			);
			if (topLevelKey !== undefined) {
				topLevelsForAlbum.add(topLevelKey);
			}
		}

		for (const topLevelKey of topLevelsForAlbum) {
			counts.set(topLevelKey, (counts.get(topLevelKey) ?? 0) + 1);
		}
	}

	return counts;
}

export function buildSubgenreCountsForTopLevel(args: {
	albumAllGenreKeys: readonly (readonly string[])[];
	topLevelGenreKey: string;
	descendantGenreKeys: ReadonlySet<string>;
	limit: number;
}): RecommendationTagOption[] {
	const counts = new Map<string, number>();

	for (const genreKeys of args.albumAllGenreKeys) {
		const seenInAlbum = new Set<string>();

		for (const genreKey of genreKeys) {
			if (
				genreKey === args.topLevelGenreKey ||
				!args.descendantGenreKeys.has(genreKey) ||
				seenInAlbum.has(genreKey)
			) {
				continue;
			}

			seenInAlbum.add(genreKey);
			counts.set(genreKey, (counts.get(genreKey) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.map(([key, count]) => ({
			key,
			label: key,
			count,
		}))
		.sort((left, right) => {
			if (right.count !== left.count) {
				return right.count - left.count;
			}

			return left.key.localeCompare(right.key);
		})
		.slice(0, Math.max(0, Math.trunc(args.limit)));
}

export function sortRecommendationTagOptionsByCount(
	options: readonly RecommendationTagOption[],
): RecommendationTagOption[] {
	return [...options].sort((left, right) => {
		if (right.count !== left.count) {
			return right.count - left.count;
		}

		return left.label.localeCompare(right.label);
	});
}

export function selectRandomTagOptions(
	tags: readonly RecommendationTagInput[],
	seed: string,
	limit: number,
): RecommendationTagOption[] {
	const optionsByKey = new Map<string, RecommendationTagOption>();

	for (const tag of tags) {
		const option = optionsByKey.get(tag.key);

		if (option !== undefined) {
			option.count += 1;
			continue;
		}

		optionsByKey.set(tag.key, {
			key: tag.key,
			label: tag.label,
			count: 1,
		});
	}

	return seededShuffle([...optionsByKey.values()], seed).slice(
		0,
		Math.max(0, Math.trunc(limit)),
	);
}

export function buildSavedRecommendationAlbumRefs<AlbumItemId, AlbumId>(
	rows: readonly {
		albumItemId: AlbumItemId;
		albumId: AlbumId;
		spotifyAlbumId: string;
	}[],
): {
	albumItemIds: AlbumItemId[];
	albumIds: AlbumId[];
	spotifyAlbumIds: string[];
} {
	return {
		albumItemIds: rows.map((row) => row.albumItemId),
		albumIds: rows.map((row) => row.albumId),
		spotifyAlbumIds: rows.map((row) => row.spotifyAlbumId),
	};
}

function createSeededRandom(seed: string): () => number {
	let state = hashSeed(seed);

	return function random(): number {
		state += 0x6d2b79f5;

		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function hashSeed(seed: string): number {
	let hash = 2166136261;

	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
}

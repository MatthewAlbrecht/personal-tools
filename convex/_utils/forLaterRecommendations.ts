import { buildDurationBucketCounts } from "./forLaterDurationBuckets";
import { resolveTopLevelGenreKey } from "./rymGenreHierarchy";

export type ListenedAnswer = "any" | "heard" | "not_yet";
export type GenreMatchAnswer = "any" | "all";

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
	hasListened?: boolean;
	markedAsSingle?: boolean;
	removedFromForLater?: boolean;
};

export type ForLaterRecommendationAnswers = {
	addedDaysMin: number;
	addedDaysMax: number;
	yearMin?: number;
	yearMax?: number;
	durationMinMs: number;
	durationMaxMs: number;
	ratingMin: number;
	ratingMax: number;
	listened: ListenedAnswer;
	genreKeys: string[];
	genreMatch: GenreMatchAnswer;
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
const ADDED_DAYS_MIN = 0;
/** Earliest for-later `playlistAddedAt` observed on production (2026-05-02T21:13:32.000Z). */
export const FOR_LATER_EARLIEST_PLAYLIST_ADDED_AT_MS = 1_777_756_412_000;
const DURATION_MINUTES_MIN = 0;
const DURATION_MINUTES_MAX = 120;
const RATING_MIN = 1;
const RATING_MAX = 15;
const MIN_RECOMMENDATION_COUNT = 1;
const MAX_RECOMMENDATION_COUNT = 5;
/** How many matching albums to shuffle/select per fetch for client-side re-roll. */
export const RECOMMENDATION_POOL_SIZE = 10;

export {
	ADDED_DAYS_MIN,
	DURATION_MINUTES_MIN,
	DURATION_MINUTES_MAX,
	RATING_MIN,
	RATING_MAX,
};

/** Days from the earliest prod For Later add through `now` (slider upper bound). */
export function getAddedDaysMax(now: number): number {
	return Math.max(
		ADDED_DAYS_MIN,
		Math.floor((now - FOR_LATER_EARLIEST_PLAYLIST_ADDED_AT_MS) / DAY_MS),
	);
}

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

/** Clamp a fetch pool size to 1..RECOMMENDATION_POOL_SIZE (not the UI page size). */
export function normalizeRecommendationPoolSize(count?: number): number {
	if (count === undefined) {
		return RECOMMENDATION_POOL_SIZE;
	}

	if (!Number.isFinite(count)) {
		return count > RECOMMENDATION_POOL_SIZE
			? RECOMMENDATION_POOL_SIZE
			: MIN_RECOMMENDATION_COUNT;
	}

	const integerCount = Math.trunc(count);

	if (integerCount < MIN_RECOMMENDATION_COUNT) {
		return MIN_RECOMMENDATION_COUNT;
	}

	if (integerCount > RECOMMENDATION_POOL_SIZE) {
		return RECOMMENDATION_POOL_SIZE;
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

export function isAddedDaysRangeUnconstrained(
	min: number,
	max: number,
	now: number,
): boolean {
	return min === ADDED_DAYS_MIN && max === getAddedDaysMax(now);
}

export function isDurationRangeUnconstrained(
	minMs: number,
	maxMs: number,
): boolean {
	return (
		minMs === DURATION_MINUTES_MIN * MINUTE_MS &&
		maxMs === DURATION_MINUTES_MAX * MINUTE_MS
	);
}

export function isRatingRangeUnconstrained(min: number, max: number): boolean {
	return min === RATING_MIN && max === RATING_MAX;
}

export function addedDaysRangeMatches(
	candidate: ForLaterRecommendationCandidate,
	min: number,
	max: number,
	now: number,
): boolean {
	if (isAddedDaysRangeUnconstrained(min, max, now)) {
		return true;
	}

	const ageMs = now - recommendationAddedAt(candidate);
	if (ageMs < 0) {
		return false;
	}

	const ageDays = Math.floor(ageMs / DAY_MS);
	return ageDays >= min && ageDays <= max;
}

export function yearRangeMatches(
	candidate: ForLaterRecommendationCandidate,
	yearMin?: number,
	yearMax?: number,
): boolean {
	if (yearMin === undefined && yearMax === undefined) {
		return true;
	}

	if (candidate.releaseYear === undefined) {
		return false;
	}

	if (yearMin !== undefined && candidate.releaseYear < yearMin) {
		return false;
	}

	if (yearMax !== undefined && candidate.releaseYear > yearMax) {
		return false;
	}

	return true;
}

export function durationRangeMatches(
	filterDurationMs: number | undefined,
	minMs: number,
	maxMs: number,
): boolean {
	if (isDurationRangeUnconstrained(minMs, maxMs)) {
		return true;
	}

	if (filterDurationMs === undefined) {
		return false;
	}

	return filterDurationMs >= minMs && filterDurationMs <= maxMs;
}

export function ratingRangeMatches(
	rating: number | undefined,
	min: number,
	max: number,
): boolean {
	if (isRatingRangeUnconstrained(min, max)) {
		return true;
	}

	if (rating === undefined) {
		return false;
	}

	return rating >= min && rating <= max;
}

export function listenedMatches(
	hasListened: boolean | undefined,
	listened: ListenedAnswer,
): boolean {
	if (listened === "any") {
		return true;
	}

	const heard = hasListened === true;
	if (listened === "heard") {
		return heard;
	}

	return !heard;
}

export function genreKeysMatch(
	filterGenreKeysSorted: readonly string[],
	genreKeys: readonly string[],
	genreMatch: GenreMatchAnswer,
): boolean {
	if (genreKeys.length === 0) {
		return true;
	}

	const albumKeys = new Set(filterGenreKeysSorted);

	if (genreMatch === "all") {
		return genreKeys.every((key) => albumKeys.has(key));
	}

	return genreKeys.some((key) => albumKeys.has(key));
}

export function candidateMatchesRecommendationAnswers(
	candidate: ForLaterRecommendationCandidate,
	answers: ForLaterRecommendationAnswers,
	now: number,
): boolean {
	if (candidate.markedAsSingle || candidate.removedFromForLater) {
		return false;
	}

	if (
		!addedDaysRangeMatches(
			candidate,
			answers.addedDaysMin,
			answers.addedDaysMax,
			now,
		)
	) {
		return false;
	}

	if (!yearRangeMatches(candidate, answers.yearMin, answers.yearMax)) {
		return false;
	}

	if (
		!durationRangeMatches(
			candidate.filterDurationMs,
			answers.durationMinMs,
			answers.durationMaxMs,
		)
	) {
		return false;
	}

	if (
		answers.listened === "heard" &&
		!ratingRangeMatches(candidate.rating, answers.ratingMin, answers.ratingMax)
	) {
		return false;
	}

	if (!listenedMatches(candidate.hasListened, answers.listened)) {
		return false;
	}

	if (
		!genreKeysMatch(
			candidate.filterGenreKeysSorted,
			answers.genreKeys,
			answers.genreMatch,
		)
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
		normalizeRecommendationPoolSize(count),
	);
}

export function buildDurationBucketRecommendationOptions(
	items: readonly { filterDurationMs?: number }[],
): RecommendationTagOption[] {
	return buildDurationBucketCounts(items);
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

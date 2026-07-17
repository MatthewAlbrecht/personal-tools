import { getTierShortLabel } from "~/lib/album-tiers";

export type ListenedAnswer = "any" | "heard" | "not_yet";
export type GenreMatchAnswer = "any" | "all";

export type RecommendationAnswers = {
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

export type RecommendationFormFieldId =
	| "added"
	| "year"
	| "duration"
	| "rating"
	| "listened"
	| "genre"
	| "count";

export type RecommendationProseClause = {
	id: RecommendationFormFieldId;
	text: string;
};

export const ADDED_DAYS_MIN = 0;
/** Earliest for-later `playlistAddedAt` observed on production (2026-05-02T21:13:32.000Z). */
export const FOR_LATER_EARLIEST_PLAYLIST_ADDED_AT_MS = 1_777_756_412_000;
export const DURATION_MINUTES_MIN = 0;
export const DURATION_MINUTES_MAX = 120;
export const RATING_MIN = 1;
export const RATING_MAX = 15;
export const RECOMMENDATION_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function getAddedDaysMax(nowMs: number = Date.now()): number {
	return Math.max(
		ADDED_DAYS_MIN,
		Math.floor((nowMs - FOR_LATER_EARLIEST_PLAYLIST_ADDED_AT_MS) / DAY_MS),
	);
}

export function createDefaultRecommendationAnswers(
	nowMs: number = Date.now(),
): RecommendationAnswers {
	return {
		addedDaysMin: ADDED_DAYS_MIN,
		addedDaysMax: getAddedDaysMax(nowMs),
		durationMinMs: DURATION_MINUTES_MIN * MINUTE_MS,
		durationMaxMs: DURATION_MINUTES_MAX * MINUTE_MS,
		ratingMin: RATING_MIN,
		ratingMax: RATING_MAX,
		listened: "any",
		genreKeys: [],
		genreMatch: "any",
		count: 1,
	};
}

export function answersToMutationPayload(
	answers: RecommendationAnswers,
): RecommendationAnswers {
	return {
		addedDaysMin: answers.addedDaysMin,
		addedDaysMax: answers.addedDaysMax,
		...(answers.yearMin !== undefined ? { yearMin: answers.yearMin } : {}),
		...(answers.yearMax !== undefined ? { yearMax: answers.yearMax } : {}),
		durationMinMs: answers.durationMinMs,
		durationMaxMs: answers.durationMaxMs,
		ratingMin: answers.ratingMin,
		ratingMax: answers.ratingMax,
		listened: answers.listened,
		genreKeys: [...answers.genreKeys],
		genreMatch: answers.genreMatch,
		count: answers.count,
	};
}

export function isAddedDaysConstrained(
	answers: RecommendationAnswers,
	nowMs: number = Date.now(),
): boolean {
	return !(
		answers.addedDaysMin === ADDED_DAYS_MIN &&
		answers.addedDaysMax === getAddedDaysMax(nowMs)
	);
}

export function isYearConstrained(answers: RecommendationAnswers): boolean {
	return answers.yearMin !== undefined || answers.yearMax !== undefined;
}

export function isDurationConstrained(answers: RecommendationAnswers): boolean {
	return !(
		answers.durationMinMs === DURATION_MINUTES_MIN * MINUTE_MS &&
		answers.durationMaxMs === DURATION_MINUTES_MAX * MINUTE_MS
	);
}

export function isRatingConstrained(answers: RecommendationAnswers): boolean {
	return !(
		answers.ratingMin === RATING_MIN && answers.ratingMax === RATING_MAX
	);
}

export function isListenedConstrained(answers: RecommendationAnswers): boolean {
	return answers.listened !== "any";
}

export function isGenreConstrained(answers: RecommendationAnswers): boolean {
	return answers.genreKeys.length > 0;
}

export function minutesFromMs(ms: number): number {
	return Math.round(ms / MINUTE_MS);
}

export function msFromMinutes(minutes: number): number {
	return minutes * MINUTE_MS;
}

export function formatDurationMinutesLabel(
	minutes: number,
	{ isMaxBound = false }: { isMaxBound?: boolean } = {},
): string {
	if (isMaxBound && minutes >= DURATION_MINUTES_MAX) {
		return "2 hours+";
	}

	if (minutes < 60) {
		return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	if (remainingMinutes === 0) {
		return hours === 1 ? "1 hour" : `${hours} hours`;
	}

	return `${hours}h ${remainingMinutes}m`;
}

export function formatDurationRangeLabel(
	minMinutes: number,
	maxMinutes: number,
): string {
	return `${formatDurationMinutesLabel(minMinutes)} – ${formatDurationMinutesLabel(maxMinutes, { isMaxBound: true })}`;
}

export function formatRatingRangeLabel(min: number, max: number): string {
	if (min === max) {
		return getTierShortLabel(min);
	}
	return `${getTierShortLabel(min)} – ${getTierShortLabel(max)}`;
}

function formatAddedCalendarDate(ms: number, nowMs: number): string {
	const dayStart = (value: number) => {
		const date = new Date(value);
		return Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate(),
		);
	};
	if (dayStart(ms) === dayStart(nowMs)) {
		return "Today";
	}
	return new Date(ms).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

/** `min`/`max` are days-ago bounds; label is chronological calendar dates. */
export function formatAddedDaysRangeLabel(
	minDaysAgo: number,
	maxDaysAgo: number,
	nowMs: number = Date.now(),
): string {
	const earlierMs =
		maxDaysAgo >= getAddedDaysMax(nowMs)
			? FOR_LATER_EARLIEST_PLAYLIST_ADDED_AT_MS
			: nowMs - maxDaysAgo * DAY_MS;
	const laterMs = nowMs - minDaysAgo * DAY_MS;
	const earlier = formatAddedCalendarDate(earlierMs, nowMs);
	const later = formatAddedCalendarDate(laterMs, nowMs);
	if (earlier === later) {
		return earlier;
	}
	return `${earlier} – ${later}`;
}

export function buildRecommendationProseClauses(
	answers: RecommendationAnswers,
	{
		genreLabelsByKey,
		nowMs = Date.now(),
	}: {
		genreLabelsByKey: Record<string, string>;
		nowMs?: number;
	},
): RecommendationProseClause[] {
	const clauses: RecommendationProseClause[] = [];

	if (isAddedDaysConstrained(answers, nowMs)) {
		const range = formatAddedDaysRangeLabel(
			answers.addedDaysMin,
			answers.addedDaysMax,
			nowMs,
		);
		clauses.push({
			id: "added",
			text: range.includes(" – ")
				? `was added between ${range.replace(" – ", " and ")}`
				: `was added on ${range}`,
		});
	}

	if (isYearConstrained(answers)) {
		const min = answers.yearMin;
		const max = answers.yearMax;
		if (min !== undefined && max !== undefined && min === max) {
			clauses.push({
				id: "year",
				text: `was released in ${min}`,
			});
		} else if (min !== undefined && max !== undefined) {
			clauses.push({
				id: "year",
				text: `was released between ${min} and ${max}`,
			});
		} else if (min !== undefined) {
			clauses.push({
				id: "year",
				text: `was released in ${min} or later`,
			});
		} else if (max !== undefined) {
			clauses.push({
				id: "year",
				text: `was released in ${max} or earlier`,
			});
		}
	}

	if (isDurationConstrained(answers)) {
		const minMinutes = minutesFromMs(answers.durationMinMs);
		const maxMinutes = minutesFromMs(answers.durationMaxMs);
		if (minMinutes === DURATION_MINUTES_MIN) {
			clauses.push({
				id: "duration",
				text: `runs up to ${formatDurationMinutesLabel(maxMinutes, { isMaxBound: true })}`,
			});
		} else {
			clauses.push({
				id: "duration",
				text: `runs ${formatDurationRangeLabel(minMinutes, maxMinutes)}`,
			});
		}
	}

	if (isRatingConstrained(answers)) {
		clauses.push({
			id: "rating",
			text: `is rated ${formatRatingRangeLabel(answers.ratingMin, answers.ratingMax)}`,
		});
	}

	if (isListenedConstrained(answers)) {
		clauses.push({
			id: "listened",
			text:
				answers.listened === "heard"
					? "I've already heard"
					: "I haven't heard yet",
		});
	}

	if (isGenreConstrained(answers)) {
		const labels = answers.genreKeys.map((key) => genreLabelsByKey[key] ?? key);
		const joiner = answers.genreMatch === "all" ? " and " : " or ";
		clauses.push({
			id: "genre",
			text: `is ${labels.join(joiner).toLowerCase()}`,
		});
	}

	return clauses;
}

/** Visible page from a prefetched recommendation pool. */
export function visibleRecommendationRows<T>(
	pool: readonly T[],
	offset: number,
	pageSize: number,
): T[] {
	if (pageSize <= 0 || offset >= pool.length) {
		return [];
	}

	return pool.slice(offset, offset + pageSize);
}

/** Advance the pool window; `exhausted` means the next offset is past the pool. */
export function nextRecommendationWindow(
	offset: number,
	pageSize: number,
	poolSize: number,
): { offset: number; exhausted: boolean } {
	const nextOffset = offset + pageSize;
	return {
		offset: nextOffset,
		exhausted: nextOffset >= poolSize,
	};
}

const REROLL_LOADING_MS_MIN = 480;
const REROLL_LOADING_MS_MAX = 980;

/** Variable pause so client-side pool re-rolls still feel deliberate. */
export function pickRerollLoadingMs(random: () => number = Math.random): number {
	const unit = Math.min(1, Math.max(0, random()));
	return Math.round(
		REROLL_LOADING_MS_MIN +
			unit * (REROLL_LOADING_MS_MAX - REROLL_LOADING_MS_MIN),
	);
}

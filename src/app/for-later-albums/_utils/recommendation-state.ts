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
export const ADDED_DAYS_MAX = 365;
export const DURATION_MINUTES_MIN = 0;
export const DURATION_MINUTES_MAX = 120;
export const RATING_MIN = 1;
export const RATING_MAX = 15;
export const RECOMMENDATION_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

const MINUTE_MS = 60 * 1000;

export function createDefaultRecommendationAnswers(): RecommendationAnswers {
	return {
		addedDaysMin: ADDED_DAYS_MIN,
		addedDaysMax: ADDED_DAYS_MAX,
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

export function isAddedDaysConstrained(answers: RecommendationAnswers): boolean {
	return !(
		answers.addedDaysMin === ADDED_DAYS_MIN &&
		answers.addedDaysMax === ADDED_DAYS_MAX
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

export function buildRecommendationProseClauses(
	answers: RecommendationAnswers,
	{
		genreLabelsByKey,
	}: {
		genreLabelsByKey: Record<string, string>;
	},
): RecommendationProseClause[] {
	const clauses: RecommendationProseClause[] = [];

	if (isAddedDaysConstrained(answers)) {
		clauses.push({
			id: "added",
			text: `was added ${answers.addedDaysMin}–${answers.addedDaysMax} days ago`,
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
				text: `runs up to ${maxMinutes} minutes`,
			});
		} else {
			clauses.push({
				id: "duration",
				text: `runs ${minMinutes}–${maxMinutes} minutes`,
			});
		}
	}

	if (isRatingConstrained(answers)) {
		clauses.push({
			id: "rating",
			text: `is rated ${answers.ratingMin}–${answers.ratingMax}`,
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
		const labels = answers.genreKeys.map(
			(key) => genreLabelsByKey[key] ?? key,
		);
		const joiner = answers.genreMatch === "all" ? " and " : " or ";
		clauses.push({
			id: "genre",
			text: `is ${labels.join(joiner).toLowerCase()}`,
		});
	}

	return clauses;
}

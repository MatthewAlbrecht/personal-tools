export type RecommendationQuestionId =
	| "addedTimeframe"
	| "genre"
	| "releaseTime"
	| "descriptor"
	| "rating"
	| "count";

export type AddedTimeframeAnswer =
	| "day"
	| "week"
	| "month"
	| "two_months"
	| "any";

export type ReleaseTimeAnswer =
	| "new_release"
	| "recent"
	| "modern"
	| "old"
	| "any";

export type RatingTierAnswer = "holy_moly" | "really_enjoyed" | "good" | "any";

export type RecommendationAnswers = {
	addedTimeframe: AddedTimeframeAnswer;
	genreKey: string | "any";
	releaseTime: ReleaseTimeAnswer;
	descriptorKey: string | "any";
	ratingTier: RatingTierAnswer;
	count: number;
};

export type RecommendationOption = {
	key: string;
	label: string;
	count?: number;
};

export type RecommendationSummaryOptions = {
	genreOptions?: readonly RecommendationOption[];
	descriptorOptions?: readonly RecommendationOption[];
};

export const QUESTION_ORDER = [
	"addedTimeframe",
	"genre",
	"releaseTime",
	"descriptor",
	"rating",
	"count",
] as const satisfies readonly RecommendationQuestionId[];

export const QUESTION_LABELS: Record<RecommendationQuestionId, string> = {
	addedTimeframe: "Added",
	genre: "Genre",
	releaseTime: "Release",
	descriptor: "Descriptors",
	rating: "Rating",
	count: "# of recs",
};

export const ADDED_TIMEFRAME_OPTIONS = [
	{ key: "any", label: "Doesn't matter" },
	{ key: "day", label: "Day" },
	{ key: "week", label: "Week" },
	{ key: "month", label: "Month" },
	{ key: "two_months", label: "2 months" },
] as const satisfies readonly RecommendationOption[];

export const RELEASE_TIME_OPTIONS = [
	{ key: "any", label: "Doesn't matter" },
	{ key: "new_release", label: "New release" },
	{ key: "recent", label: "Recent" },
	{ key: "modern", label: "Modern" },
	{ key: "old", label: "Old" },
] as const satisfies readonly RecommendationOption[];

export const RATING_TIER_OPTIONS = [
	{ key: "any", label: "Doesn't matter" },
	{ key: "holy_moly", label: "Holy Moly" },
	{ key: "really_enjoyed", label: "Really Enjoyed" },
	{ key: "good", label: "Good" },
] as const satisfies readonly RecommendationOption[];

export const RECOMMENDATION_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

export function createDefaultRecommendationAnswers(): RecommendationAnswers {
	return {
		addedTimeframe: "any",
		genreKey: "any",
		releaseTime: "any",
		descriptorKey: "any",
		ratingTier: "any",
		count: 1,
	};
}

export function nextRecommendationQuestion(
	current: RecommendationQuestionId,
): RecommendationQuestionId {
	const currentIndex = QUESTION_ORDER.indexOf(current);
	const nextQuestion = QUESTION_ORDER[currentIndex + 1];
	return nextQuestion ?? "count";
}

export function recommendationAnswerSummary(
	answers: RecommendationAnswers,
	{
		genreOptions = [],
		descriptorOptions = [],
	}: RecommendationSummaryOptions = {},
): string[] {
	const summary: string[] = [];

	if (answers.addedTimeframe !== "any") {
		summary.push(
			`Added: ${optionLabel(ADDED_TIMEFRAME_OPTIONS, answers.addedTimeframe)}`,
		);
	}
	if (answers.genreKey !== "any") {
		summary.push(`Genre: ${optionLabel(genreOptions, answers.genreKey)}`);
	}
	if (answers.releaseTime !== "any") {
		summary.push(
			`Release: ${optionLabel(RELEASE_TIME_OPTIONS, answers.releaseTime)}`,
		);
	}
	if (answers.descriptorKey !== "any") {
		summary.push(
			`Descriptor: ${optionLabel(descriptorOptions, answers.descriptorKey)}`,
		);
	}
	if (answers.ratingTier !== "any") {
		summary.push(
			`Rating: ${optionLabel(RATING_TIER_OPTIONS, answers.ratingTier)}`,
		);
	}

	summary.push(`${answers.count} ${answers.count === 1 ? "rec" : "recs"}`);

	return summary;
}

function optionLabel(
	options: readonly RecommendationOption[],
	key: string,
): string {
	return options.find((option) => option.key === key)?.label ?? key;
}

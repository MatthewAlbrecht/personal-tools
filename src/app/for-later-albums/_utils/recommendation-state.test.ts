import assert from "node:assert/strict";
import test from "node:test";
import {
	ADDED_TIMEFRAME_OPTIONS,
	QUESTION_LABELS,
	QUESTION_ORDER,
	RATING_TIER_OPTIONS,
	RECOMMENDATION_COUNT_OPTIONS,
	RELEASE_TIME_OPTIONS,
	createDefaultRecommendationAnswers,
	nextRecommendationQuestion,
	recommendationAnswerSummary,
} from "./recommendation-state";

test("createDefaultRecommendationAnswers treats every filter as any and count as one", () => {
	assert.deepEqual(createDefaultRecommendationAnswers(), {
		addedTimeframe: "any",
		genreKey: "any",
		releaseTime: "any",
		descriptorKey: "any",
		ratingTier: "any",
		count: 1,
	});
});

test("nextRecommendationQuestion advances until the final question", () => {
	assert.equal(nextRecommendationQuestion("addedTimeframe"), "genre");
	assert.equal(nextRecommendationQuestion("genre"), "releaseTime");
	assert.equal(nextRecommendationQuestion("releaseTime"), "rating");
	assert.equal(nextRecommendationQuestion("rating"), "count");
	assert.equal(nextRecommendationQuestion("count"), "count");
});

test("QUESTION_ORDER has the approved question order", () => {
	assert.deepEqual(QUESTION_ORDER, [
		"addedTimeframe",
		"genre",
		"releaseTime",
		"rating",
		"count",
	]);
});

test("QUESTION_LABELS has the approved labels", () => {
	assert.equal(QUESTION_LABELS.addedTimeframe, "Added");
	assert.equal(QUESTION_LABELS.genre, "Genre");
	assert.equal(QUESTION_LABELS.releaseTime, "Release");
	assert.equal(QUESTION_LABELS.rating, "Rating");
	assert.equal(QUESTION_LABELS.count, "# of recs");
});

test("ADDED_TIMEFRAME_OPTIONS has the approved added timeframe options", () => {
	assert.deepEqual(ADDED_TIMEFRAME_OPTIONS, [
		{ key: "any", label: "Doesn't matter" },
		{ key: "day", label: "Day" },
		{ key: "week", label: "Week" },
		{ key: "month", label: "Month" },
		{ key: "two_months", label: "2 months" },
		{ key: "older_than_two_months", label: "Older than 2 months" },
	]);
});

test("RELEASE_TIME_OPTIONS has the approved release time options", () => {
	assert.deepEqual(RELEASE_TIME_OPTIONS, [
		{ key: "any", label: "Doesn't matter" },
		{ key: "new_release", label: "New release" },
		{ key: "recent", label: "Recent" },
		{ key: "modern", label: "Modern" },
		{ key: "old", label: "Old" },
	]);
});

test("RATING_TIER_OPTIONS has only the approved recommendation tiers", () => {
	assert.deepEqual(RATING_TIER_OPTIONS, [
		{ key: "any", label: "Doesn't matter" },
		{ key: "holy_moly", label: "Holy Moly" },
		{ key: "really_enjoyed", label: "Really Enjoyed" },
		{ key: "good", label: "Good" },
	]);
});

test("RECOMMENDATION_COUNT_OPTIONS has the approved recommendation counts", () => {
	assert.deepEqual(RECOMMENDATION_COUNT_OPTIONS, [1, 2, 3, 4, 5]);
});

test("recommendationAnswerSummary omits unanswered filters but includes count", () => {
	assert.deepEqual(
		recommendationAnswerSummary({
			addedTimeframe: "any",
			genreKey: "slowcore",
			releaseTime: "modern",
			descriptorKey: "any",
			ratingTier: "good",
			count: 3,
		}),
		["Genre: slowcore", "Release: Modern", "Rating: Good", "3 recs"],
	);
});

test("recommendationAnswerSummary uses genre labels when available", () => {
	assert.deepEqual(
		recommendationAnswerSummary(
			{
				addedTimeframe: "any",
				genreKey: "hip_hop",
				releaseTime: "any",
				descriptorKey: "any",
				ratingTier: "any",
				count: 1,
			},
			{
				genreOptions: [{ key: "hip_hop", label: "Hip Hop" }],
			},
		),
		["Genre: Hip Hop", "1 rec"],
	);
});

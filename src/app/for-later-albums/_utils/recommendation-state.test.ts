import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRecommendationProseClauses,
	createDefaultRecommendationAnswers,
} from "./recommendation-state";

const MINUTE_MS = 60 * 1000;

test("createDefaultRecommendationAnswers uses full spans and any listened", () => {
	const answers = createDefaultRecommendationAnswers();
	assert.equal(answers.addedDaysMin, 0);
	assert.equal(answers.addedDaysMax, 365);
	assert.equal(answers.listened, "any");
	assert.deepEqual(answers.genreKeys, []);
	assert.equal(answers.count, 1);
});

test("buildRecommendationProseClauses omits unconstrained fields", () => {
	assert.deepEqual(
		buildRecommendationProseClauses(createDefaultRecommendationAnswers(), {
			genreLabelsByKey: {},
		}),
		[],
	);
});

test("buildRecommendationProseClauses describes constrained fields", () => {
	const clauses = buildRecommendationProseClauses(
		{
			...createDefaultRecommendationAnswers(),
			yearMin: 2020,
			yearMax: 2024,
			genreKeys: ["electronic", "ambient"],
			genreMatch: "any",
			listened: "not_yet",
			durationMinMs: 0,
			durationMaxMs: 40 * MINUTE_MS,
			ratingMin: 1,
			ratingMax: 15,
		},
		{
			genreLabelsByKey: {
				electronic: "Electronic",
				ambient: "Ambient",
			},
		},
	);
	assert.equal(
		clauses.some((c) => c.id === "year"),
		true,
	);
	assert.equal(
		clauses.some((c) => c.id === "genre"),
		true,
	);
	assert.equal(
		clauses.some((c) => c.id === "listened"),
		true,
	);
	assert.equal(
		clauses.some((c) => c.id === "duration"),
		true,
	);
	assert.equal(
		clauses.some((c) => c.id === "rating"),
		false,
	);
});

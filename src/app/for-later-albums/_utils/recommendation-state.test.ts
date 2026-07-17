import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRecommendationProseClauses,
	createDefaultRecommendationAnswers,
	addedDaysAnswersToSliderValues,
	addedDaysSliderValuesToAnswers,
	formatAddedDaysRangeLabel,
	formatDurationMinutesLabel,
	formatDurationRangeLabel,
	formatRatingRangeLabel,
	getAddedDaysMax,
	nextRecommendationWindow,
	pickRerollLoadingMs,
	visibleRecommendationRows,
} from "./recommendation-state";

const MINUTE_MS = 60 * 1000;
const NOW = Date.UTC(2026, 5, 22);

test("createDefaultRecommendationAnswers uses full spans and not-yet listened", () => {
	const answers = createDefaultRecommendationAnswers(NOW);
	assert.equal(answers.addedDaysMin, 0);
	assert.equal(answers.addedDaysMax, getAddedDaysMax(NOW));
	assert.equal(answers.listened, "not_yet");
	assert.deepEqual(answers.genreKeys, []);
	assert.equal(answers.count, 1);
});

test("formatDurationMinutesLabel uses hours when present and plus at max", () => {
	assert.equal(formatDurationMinutesLabel(0), "0 minutes");
	assert.equal(formatDurationMinutesLabel(45), "45 minutes");
	assert.equal(formatDurationMinutesLabel(60), "1 hour");
	assert.equal(formatDurationMinutesLabel(90), "1h 30m");
	assert.equal(
		formatDurationMinutesLabel(120, { isMaxBound: true }),
		"2 hours+",
	);
	assert.equal(formatDurationRangeLabel(0, 120), "0 minutes – 2 hours+");
});

test("formatRatingRangeLabel uses tier short labels", () => {
	assert.equal(formatRatingRangeLabel(15, 15), "Holy Moly ↗");
	assert.equal(formatRatingRangeLabel(1, 15), "Actively Bad ↘ – Holy Moly ↗");
});

test("formatAddedDaysRangeLabel uses calendar dates", () => {
	assert.equal(
		formatAddedDaysRangeLabel(0, getAddedDaysMax(NOW), NOW),
		"May 2, 2026 – Today",
	);
	assert.equal(formatAddedDaysRangeLabel(2, 2, NOW), "Jun 20, 2026");
	assert.equal(
		formatAddedDaysRangeLabel(1, 3, NOW),
		"Jun 19, 2026 – Jun 21, 2026",
	);
});

test("added days slider is chronological: left earlier, right toward today", () => {
	const bound = getAddedDaysMax(NOW);
	assert.deepEqual(addedDaysAnswersToSliderValues(0, bound, bound), [
		0,
		bound,
	]);
	assert.deepEqual(addedDaysAnswersToSliderValues(0, 7, bound), [
		bound - 7,
		bound,
	]);
	assert.deepEqual(addedDaysSliderValuesToAnswers(0, bound, bound), {
		addedDaysMin: 0,
		addedDaysMax: bound,
	});
	assert.deepEqual(addedDaysSliderValuesToAnswers(bound - 7, bound, bound), {
		addedDaysMin: 0,
		addedDaysMax: 7,
	});
});

test("visibleRecommendationRows shows only the requested page size", () => {
	const pool = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
	assert.deepEqual(visibleRecommendationRows(pool, 0, 3), ["a", "b", "c"]);
	assert.deepEqual(visibleRecommendationRows(pool, 3, 3), ["d", "e", "f"]);
	assert.deepEqual(visibleRecommendationRows(pool, 9, 3), ["j"]);
});

test("nextRecommendationWindow advances until the pool is exhausted", () => {
	assert.deepEqual(nextRecommendationWindow(0, 3, 10), {
		offset: 3,
		exhausted: false,
	});
	assert.deepEqual(nextRecommendationWindow(6, 3, 10), {
		offset: 9,
		exhausted: false,
	});
	assert.deepEqual(nextRecommendationWindow(9, 3, 10), {
		offset: 12,
		exhausted: true,
	});
});

test("pickRerollLoadingMs varies within a deliberate range", () => {
	assert.equal(pickRerollLoadingMs(() => 0), 480);
	assert.equal(pickRerollLoadingMs(() => 1), 980);
	assert.equal(pickRerollLoadingMs(() => 0.5), 730);
});

test("buildRecommendationProseClauses omits unconstrained fields", () => {
	assert.deepEqual(
		buildRecommendationProseClauses(createDefaultRecommendationAnswers(NOW), {
			genreLabelsByKey: {},
			nowMs: NOW,
		}),
		[{ id: "listened", text: "I haven't heard yet" }],
	);
});

test("buildRecommendationProseClauses describes constrained fields", () => {
	const clauses = buildRecommendationProseClauses(
		{
			...createDefaultRecommendationAnswers(NOW),
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
			nowMs: NOW,
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

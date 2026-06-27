import assert from "node:assert/strict";
import test from "node:test";
import {
	FOR_LATER_DURATION_BUCKET_OPTIONS,
	buildDurationBucketCounts,
	durationBucketKeyFromMinutes,
	durationBucketMatches,
	durationMsToBucketKey,
} from "./forLaterDurationBuckets";

const MINUTE_MS = 60 * 1000;

test("durationMsToBucketKey assigns half-open minute ranges", () => {
	assert.equal(durationMsToBucketKey(0), "under_20");
	assert.equal(durationMsToBucketKey(19 * MINUTE_MS + 59_999), "under_20");
	assert.equal(durationMsToBucketKey(20 * MINUTE_MS), "20_30");
	assert.equal(durationMsToBucketKey(29 * MINUTE_MS + 59_999), "20_30");
	assert.equal(durationMsToBucketKey(30 * MINUTE_MS), "30_40");
	assert.equal(durationMsToBucketKey(39 * MINUTE_MS + 59_999), "30_40");
	assert.equal(durationMsToBucketKey(40 * MINUTE_MS), "40_50");
	assert.equal(durationMsToBucketKey(49 * MINUTE_MS + 59_999), "40_50");
	assert.equal(durationMsToBucketKey(50 * MINUTE_MS), "50_60");
	assert.equal(durationMsToBucketKey(59 * MINUTE_MS + 59_999), "50_60");
	assert.equal(durationMsToBucketKey(60 * MINUTE_MS), "60_70");
	assert.equal(durationMsToBucketKey(69 * MINUTE_MS + 59_999), "60_70");
	assert.equal(durationMsToBucketKey(70 * MINUTE_MS), "70_plus");
	assert.equal(durationMsToBucketKey(120 * MINUTE_MS), "70_plus");
	assert.equal(durationMsToBucketKey(undefined), undefined);
	assert.equal(durationMsToBucketKey(-1), undefined);
});

test("durationBucketKeyFromMinutes parses canonical bucket keys", () => {
	assert.equal(durationBucketKeyFromMinutes("40_50"), "40_50");
	assert.equal(durationBucketKeyFromMinutes(" 40_50 "), "40_50");
	assert.equal(durationBucketKeyFromMinutes("invalid"), undefined);
	assert.equal(durationBucketKeyFromMinutes(undefined), undefined);
});

test("durationBucketMatches accepts only matching bucket or any", () => {
	const ms = 45 * MINUTE_MS;
	assert.equal(durationBucketMatches(ms, "40_50"), true);
	assert.equal(durationBucketMatches(ms, "50_60"), false);
	assert.equal(durationBucketMatches(undefined, "40_50"), false);
	assert.equal(durationBucketMatches(undefined, "any"), true);
	assert.equal(durationBucketMatches(ms, "any"), true);
});

test("buildDurationBucketCounts counts albums once per bucket", () => {
	const counts = buildDurationBucketCounts([
		{ filterDurationMs: 15 * MINUTE_MS },
		{ filterDurationMs: 25 * MINUTE_MS },
		{ filterDurationMs: 25 * MINUTE_MS + 1 },
		{ filterDurationMs: undefined },
	]);

	assert.deepEqual(
		counts.map((option) => option.key),
		FOR_LATER_DURATION_BUCKET_OPTIONS.map((option) => option.key),
	);
	assert.equal(
		counts.find((option) => option.key === "under_20")?.count,
		1,
	);
	assert.equal(counts.find((option) => option.key === "20_30")?.count, 2);
	assert.equal(counts.find((option) => option.key === "30_40")?.count, 0);
});

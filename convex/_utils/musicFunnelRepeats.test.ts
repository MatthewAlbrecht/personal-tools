import assert from "node:assert/strict";
import test from "node:test";
import {
	computeBecameRepeatAt,
	sortUnifiedRepeatsByLatestSeenAt,
} from "./musicFunnelRepeats";

test("becameRepeatAt is the earliest time a second distinct source appeared", () => {
	const becameAt = computeBecameRepeatAt([
		{ sourceId: "a", firstSeenAt: 1000 },
		{ sourceId: "a", firstSeenAt: 1500 },
		{ sourceId: "b", firstSeenAt: 3000 },
		{ sourceId: "c", firstSeenAt: 4000 },
	]);
	assert.equal(becameAt, 3000);
});

test("becameRepeatAt uses each source's earliest encounter", () => {
	const becameAt = computeBecameRepeatAt([
		{ sourceId: "b", firstSeenAt: 5000 },
		{ sourceId: "a", firstSeenAt: 2000 },
		{ sourceId: "b", firstSeenAt: 2500 },
	]);
	assert.equal(becameAt, 2500);
});

test("sortUnifiedRepeatsByLatestSeenAt is descending by latestSeenAt", () => {
	const sorted = sortUnifiedRepeatsByLatestSeenAt([
		{ id: "old", latestSeenAt: 100 },
		{ id: "new", latestSeenAt: 300 },
		{ id: "mid", latestSeenAt: 200 },
	]);
	assert.deepEqual(
		sorted.map((row) => row.id),
		["new", "mid", "old"],
	);
});

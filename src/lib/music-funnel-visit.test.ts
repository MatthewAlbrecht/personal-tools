import assert from "node:assert/strict";
import test from "node:test";
import {
	getLastSeenStorageKey,
	getVisitSinceSessionKey,
	isNewSince,
	resolveVisitSince,
	sourceRunHasActivity,
	summarizeMissed,
} from "./music-funnel-visit";

test("storage keys are user-scoped", () => {
	assert.equal(getLastSeenStorageKey("u1"), "music-funnel-last-seen-u1");
	assert.equal(
		getVisitSinceSessionKey("u1"),
		"music-funnel-visit-since-u1",
	);
});

test("resolveVisitSince prefers session, then local, then now", () => {
	assert.equal(
		resolveVisitSince({ sessionValue: "100", localValue: "200", now: 999 }),
		100,
	);
	assert.equal(
		resolveVisitSince({ sessionValue: null, localValue: "200", now: 999 }),
		200,
	);
	assert.equal(
		resolveVisitSince({ sessionValue: null, localValue: null, now: 999 }),
		999,
	);
	assert.equal(
		resolveVisitSince({ sessionValue: "nope", localValue: "also", now: 999 }),
		999,
	);
});

test("isNewSince is strict greater-than", () => {
	assert.equal(isNewSince(101, 100), true);
	assert.equal(isNewSince(100, 100), false);
	assert.equal(isNewSince(99, 100), false);
});

test("sourceRunHasActivity matches spec", () => {
	assert.equal(
		sourceRunHasActivity({
			newEncounters: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		}),
		false,
	);
	assert.equal(
		sourceRunHasActivity({
			newEncounters: 1,
			trackRepeatsFound: 0,
			albumRepeatsFound: 0,
			artistRepeatsFound: 0,
		}),
		true,
	);
	assert.equal(
		sourceRunHasActivity({
			newEncounters: 0,
			trackRepeatsFound: 0,
			albumRepeatsFound: 2,
			artistRepeatsFound: 0,
		}),
		true,
	);
});

test("summarizeMissed counts syncs and new repeats by type", () => {
	const summary = summarizeMissed({
		visitSince: 1000,
		sourceRuns: [
			{
				startedAt: 1500,
				newEncounters: 1,
				trackRepeatsFound: 0,
				albumRepeatsFound: 0,
				artistRepeatsFound: 0,
			},
			{
				startedAt: 500,
				newEncounters: 9,
				trackRepeatsFound: 9,
				albumRepeatsFound: 9,
				artistRepeatsFound: 9,
			},
			{
				startedAt: 1600,
				newEncounters: 0,
				trackRepeatsFound: 0,
				albumRepeatsFound: 0,
				artistRepeatsFound: 0,
			},
		],
		repeats: [
			{ type: "track", becameRepeatAt: 1100 },
			{ type: "track", becameRepeatAt: 900 },
			{ type: "album", becameRepeatAt: 1200 },
			{ type: "artist", becameRepeatAt: 1300 },
		],
	});
	assert.deepEqual(summary, {
		syncCount: 1,
		repeatTrackCount: 1,
		repeatAlbumCount: 1,
		repeatArtistCount: 1,
	});
});

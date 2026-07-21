import assert from "node:assert/strict";
import test from "node:test";
import {
	applyLibraryForLaterEvent,
	deriveIsActiveForLater,
	legacyRowsToLibraryForLater,
} from "./library-for-later-state";

test("first observation creates active append-only state", () => {
	assert.deepEqual(
		applyLibraryForLaterEvent(undefined, {
			type: "observed",
			seenAt: 100,
			playlistAddedAt: 90,
		}),
		{
			forLater: {
				firstSeenAt: 100,
				lastSeenAt: 100,
				playlistAddedAt: 90,
			},
			isActiveForLater: true,
		},
	);
});

test("first observation omits absent playlist timestamp", () => {
	assert.deepEqual(
		applyLibraryForLaterEvent(undefined, {
			type: "observed",
			seenAt: 100,
		}),
		{
			forLater: {
				firstSeenAt: 100,
				lastSeenAt: 100,
			},
			isActiveForLater: true,
		},
	);
});

test("reobservation updates last seen without restoring dismissal", () => {
	const existing = {
		firstSeenAt: 100,
		lastSeenAt: 110,
		playlistAddedAt: 90,
		dismissedAt: 105,
	};
	assert.deepEqual(
		applyLibraryForLaterEvent(existing, {
			type: "observed",
			seenAt: 120,
		}),
		{
			forLater: { ...existing, lastSeenAt: 120 },
			isActiveForLater: false,
		},
	);
});

test("dismiss and restore only change dismissal", () => {
	const active = { firstSeenAt: 100, lastSeenAt: 100 };
	const dismissed = applyLibraryForLaterEvent(active, {
		type: "dismissed",
		dismissedAt: 110,
	});
	assert.equal(dismissed.isActiveForLater, false);
	assert.equal(dismissed.forLater.dismissedAt, 110);

	const restored = applyLibraryForLaterEvent(dismissed.forLater, {
		type: "restored",
	});
	assert.deepEqual(restored, {
		forLater: active,
		isActiveForLater: true,
	});
});

test("derived activity only depends on existence and dismissal", () => {
	assert.equal(deriveIsActiveForLater(undefined), false);
	assert.equal(deriveIsActiveForLater({ firstSeenAt: 1, lastSeenAt: 2 }), true);
	assert.equal(
		deriveIsActiveForLater({
			firstSeenAt: 1,
			lastSeenAt: 2,
			dismissedAt: 3,
		}),
		false,
	);
});

test("legacy marked-as-single migrates as dismissed", () => {
	const patch = legacyRowsToLibraryForLater([
		{
			firstSeenAt: 10,
			lastSeenAt: 20,
			playlistAddedAt: 5,
			removedFromForLater: false,
			markedAsSingle: true,
			updatedAt: 25,
			creationTime: 1,
		},
	]);
	assert.equal(patch.forLater.dismissedAt, 25);
	assert.equal(patch.isActiveForLater, false);
});

test("active legacy migration omits absent optional timestamps", () => {
	assert.deepEqual(
		legacyRowsToLibraryForLater([
			{
				firstSeenAt: 10,
				lastSeenAt: 20,
				removedFromForLater: false,
				markedAsSingle: false,
				updatedAt: 25,
				creationTime: 1,
			},
		]),
		{
			forLater: {
				firstSeenAt: 10,
				lastSeenAt: 20,
			},
			isActiveForLater: true,
		},
	);
});

test("legacy duplicate reconciliation uses newest observation deterministically", () => {
	const patch = legacyRowsToLibraryForLater([
		{
			firstSeenAt: 20,
			lastSeenAt: 30,
			removedFromForLater: false,
			markedAsSingle: false,
			updatedAt: 31,
			creationTime: 2,
		},
		{
			firstSeenAt: 10,
			lastSeenAt: 40,
			playlistAddedAt: 8,
			removedFromForLater: true,
			markedAsSingle: false,
			updatedAt: 41,
			creationTime: 1,
		},
	]);
	assert.deepEqual(patch, {
		forLater: {
			firstSeenAt: 10,
			lastSeenAt: 40,
			playlistAddedAt: 8,
			dismissedAt: 41,
		},
		isActiveForLater: false,
	});
});

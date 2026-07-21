import assert from "node:assert/strict";
import test from "node:test";
import {
	RECENT_ENRICHMENT_SCAN_LIMIT,
	clampQueueLimit,
	queuePreviewSpotifyAlbumId,
	selectBoundedVisibleForLaterRows,
	summarizeEnrichmentQueue,
} from "./albumEnrichmentQueue";

test("hidden and inactive rows are excluded while active ordering is preserved", () => {
	const result = selectBoundedVisibleForLaterRows(
		[
			{ key: "newest", isActive: true },
			{ key: "single", isActive: true, markedAsSingle: true },
			{
				key: "removed",
				isActive: true,
				filterRemovedFromForLater: true,
			},
			{ key: "inactive", isActive: false },
			{ key: "oldest", isActive: true },
		],
		5,
	);

	assert.deepEqual(
		result.rows.map((row) => row.key),
		["newest", "oldest"],
	);
	assert.equal(result.scanned, 5);
	assert.equal(result.capped, false);
});

test("queue summary counts complete, partial, never-started, and missing slices", () => {
	const summary = summarizeEnrichmentQueue([
		{
			key: "complete",
			isActive: true,
			albumExists: true,
			hasEnrichmentRow: true,
			slices: {
				artistContext: { updatedAt: 1 },
				whyListen: { updatedAt: 1 },
				coverDescriptors: { updatedAt: 1 },
				occasions: { updatedAt: 1 },
			},
		},
		{
			key: "partial",
			isActive: true,
			albumExists: true,
			hasEnrichmentRow: true,
			slices: {
				artistContext: { updatedAt: 2 },
				whyListen: { updatedAt: 2 },
			},
		},
		{
			key: "empty-row",
			isActive: true,
			albumExists: true,
			hasEnrichmentRow: true,
			slices: {},
		},
		{
			key: "not-started",
			isActive: true,
			albumExists: true,
			hasEnrichmentRow: false,
		},
		{
			key: "hidden",
			isActive: true,
			albumExists: true,
			hasEnrichmentRow: false,
			removedFromForLater: true,
		},
	]);

	assert.deepEqual(summary, {
		activeVisible: 4,
		incomplete: 3,
		complete: 1,
		neverStarted: 1,
		partial: 2,
		missing: {
			artistContext: 2,
			whyListen: 2,
			coverDescriptors: 3,
			occasions: 3,
		},
		nextClaimableKey: "partial",
	});
});

test("queue summary excludes rows whose canonical album is missing", () => {
	const summary = summarizeEnrichmentQueue([
		{
			key: "deleted-album",
			isActive: true,
			albumExists: false,
			hasEnrichmentRow: false,
		},
	]);

	assert.deepEqual(summary, {
		activeVisible: 0,
		incomplete: 0,
		complete: 0,
		neverStarted: 0,
		partial: 0,
		missing: {
			artistContext: 0,
			whyListen: 0,
			coverDescriptors: 0,
			occasions: 0,
		},
	});
});

test("queue previews use the for-later Spotify album id", () => {
	assert.equal(
		queuePreviewSpotifyAlbumId(
			{ spotifyAlbumId: "for-later-id" },
			{ spotifyAlbumId: "canonical-id" },
		),
		"for-later-id",
	);
});

test("bounded selection distinguishes exactly-at-limit from over-limit", () => {
	const exactly = selectBoundedVisibleForLaterRows(
		[
			{ key: "a", isActive: true },
			{ key: "b", isActive: true },
		],
		2,
	);
	const over = selectBoundedVisibleForLaterRows(
		[
			{ key: "a", isActive: true },
			{ key: "b", isActive: true },
			{ key: "c", isActive: true },
		],
		2,
	);

	assert.equal(exactly.capped, false);
	assert.equal(exactly.scanned, 2);
	assert.deepEqual(
		exactly.rows.map((row) => row.key),
		["a", "b"],
	);
	assert.equal(over.capped, true);
	assert.equal(over.scanned, 2);
	assert.deepEqual(
		over.rows.map((row) => row.key),
		["a", "b"],
	);
});

test("queue limits use defaults, truncate fractions, and clamp to bounds", () => {
	assert.equal(clampQueueLimit(undefined, 25, 50), 25);
	assert.equal(clampQueueLimit(0, 25, 50), 1);
	assert.equal(clampQueueLimit(12.9, 25, 50), 12);
	assert.equal(clampQueueLimit(500, 25, 50), 50);
});

test("recent enrichment scan window exceeds the maximum result limit", () => {
	assert.equal(RECENT_ENRICHMENT_SCAN_LIMIT, 100);
	assert.ok(RECENT_ENRICHMENT_SCAN_LIMIT > 25);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRepairCandidates,
	computePreviewHash,
} from "./spotify-listen-repair";

test("dedupes the same play across multiple sync logs", () => {
	const morningStart = Date.parse("2026-07-19T14:43:00.000Z");
	const items = Array.from({ length: 12 }, (_, i) => ({
		track: {
			id: `t${i + 1}`,
			track_number: i + 1,
			disc_number: 1,
			album: { id: "alb" },
		},
		played_at: new Date(morningStart + i * 180_000).toISOString(),
	}));
	const raw = JSON.stringify(items);
	const candidates = buildRepairCandidates({
		userId: "moose",
		logs: [
			{ id: "log1", rawResponse: raw },
			{ id: "log2", rawResponse: raw },
		],
		albumTotalTracks: new Map([["alb", 12]]),
		existingListens: [],
	});
	assert.equal(candidates.length, 1);
	assert.equal(candidates[0]?.trackIds.length, 12);
	assert.deepEqual(candidates[0]?.evidenceLogIds.sort(), ["log1", "log2"]);
});

test("excludes candidates overlapping existing listens", () => {
	const morningStart = Date.parse("2026-07-19T14:43:00.000Z");
	const items = Array.from({ length: 12 }, (_, i) => ({
		track: {
			id: `t${i + 1}`,
			track_number: i + 1,
			disc_number: 1,
			album: { id: "alb" },
		},
		played_at: new Date(morningStart + i * 180_000).toISOString(),
	}));
	const candidates = buildRepairCandidates({
		userId: "moose",
		logs: [{ id: "log1", rawResponse: JSON.stringify(items) }],
		albumTotalTracks: new Map([["alb", 12]]),
		existingListens: [
			{
				spotifyAlbumId: "alb",
				earliestPlayedAt: morningStart,
				latestPlayedAt: morningStart + 11 * 180_000,
			},
		],
	});
	assert.equal(candidates.length, 0);
});

test("preview hash is stable for same candidate set", () => {
	const morningStart = Date.parse("2026-07-19T14:43:00.000Z");
	const items = Array.from({ length: 12 }, (_, i) => ({
		track: {
			id: `t${i + 1}`,
			track_number: i + 1,
			disc_number: 1,
			album: { id: "alb" },
		},
		played_at: new Date(morningStart + i * 180_000).toISOString(),
	}));
	const candidates = buildRepairCandidates({
		userId: "moose",
		logs: [{ id: "log1", rawResponse: JSON.stringify(items) }],
		albumTotalTracks: new Map([["alb", 12]]),
		existingListens: [],
	});
	assert.equal(computePreviewHash(candidates), computePreviewHash(candidates));
});

import assert from "node:assert/strict";
import test from "node:test";
import { sortSourceRunEncounterDetails } from "./music-funnel-source-run-details";

test("repeat-write tracks sort before other new encounters", () => {
	const sorted = sortSourceRunEncounterDetails(
		[
			{
				spotifyTrackId: "a",
				trackName: "Alpha",
				firstSeenAt: 100,
			},
			{
				spotifyTrackId: "b",
				trackName: "Beta",
				firstSeenAt: 200,
			},
			{
				spotifyTrackId: "c",
				trackName: "Charlie",
				firstSeenAt: 50,
			},
		],
		new Set(["b", "c"]),
	);
	assert.deepEqual(
		sorted.map((row) => row.spotifyTrackId),
		["c", "b", "a"],
	);
});

test("within each group, sort by firstSeenAt ascending then trackName", () => {
	const sorted = sortSourceRunEncounterDetails(
		[
			{ spotifyTrackId: "z", trackName: "Zoo", firstSeenAt: 10 },
			{ spotifyTrackId: "y", trackName: "Yak", firstSeenAt: 10 },
		],
		new Set<string>(),
	);
	assert.deepEqual(
		sorted.map((row) => row.spotifyTrackId),
		["y", "z"],
	);
});

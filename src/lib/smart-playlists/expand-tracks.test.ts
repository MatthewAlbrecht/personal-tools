import assert from "node:assert/strict";
import test from "node:test";
import { expandAlbumsToTrackUris } from "./expand-tracks";
import type { TrackSelection } from "./types";

test("allTracks concatenates album track uris in order", () => {
	const uris = expandAlbumsToTrackUris(
		[
			{ albumId: "a1", trackUris: ["spotify:track:1", "spotify:track:2"] },
			{ albumId: "a2", trackUris: ["spotify:track:3"] },
		],
		{ mode: "allTracks" },
	);
	assert.deepEqual(uris, [
		"spotify:track:1",
		"spotify:track:2",
		"spotify:track:3",
	]);
});

test("unknown mode throws", () => {
	assert.throws(
		() =>
			expandAlbumsToTrackUris(
				[{ albumId: "a1", trackUris: ["spotify:track:1"] }],
				{ mode: "smartSubset" } as unknown as TrackSelection,
			),
		/Unknown track selection mode/,
	);
});

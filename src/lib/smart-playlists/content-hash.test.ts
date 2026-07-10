import assert from "node:assert/strict";
import test from "node:test";
import { hashTrackUris } from "./content-hash";

test("same ordered uris → same hash", () => {
	assert.equal(
		hashTrackUris(["spotify:track:a", "spotify:track:b"]),
		hashTrackUris(["spotify:track:a", "spotify:track:b"]),
	);
});

test("order change → different hash", () => {
	assert.notEqual(
		hashTrackUris(["spotify:track:a", "spotify:track:b"]),
		hashTrackUris(["spotify:track:b", "spotify:track:a"]),
	);
});

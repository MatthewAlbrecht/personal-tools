import assert from "node:assert/strict";
import test from "node:test";
import { planPlaylistSync } from "./sync-plan";

test("mirror unchanged → skip", () => {
	const plan = planPlaylistSync({
		syncMode: "mirror",
		desiredUris: ["spotify:track:a"],
		syncedUris: ["spotify:track:a"],
		desiredAlbumIds: ["alb1"],
		syncedAlbumIds: ["alb1"],
	});
	assert.equal(plan.action, "skip");
});

test("mirror changed → replaceAll with desired", () => {
	const plan = planPlaylistSync({
		syncMode: "mirror",
		desiredUris: ["spotify:track:a", "spotify:track:b"],
		syncedUris: ["spotify:track:a"],
		desiredAlbumIds: ["alb1"],
		syncedAlbumIds: ["alb1"],
	});
	assert.equal(plan.action, "replaceAll");
	if (plan.action === "replaceAll") {
		assert.deepEqual(plan.uris, ["spotify:track:a", "spotify:track:b"]);
	}
});

test("empty desired + mirror → replaceAll with empty uris", () => {
	const plan = planPlaylistSync({
		syncMode: "mirror",
		desiredUris: [],
		syncedUris: ["spotify:track:a"],
		desiredAlbumIds: [],
		syncedAlbumIds: ["alb1"],
	});
	assert.equal(plan.action, "replaceAll");
	if (plan.action === "replaceAll") {
		assert.deepEqual(plan.uris, []);
	}
});

test("addOnly only posts new album tracks", () => {
	const plan = planPlaylistSync({
		syncMode: "addOnly",
		desiredUris: ["spotify:track:a", "spotify:track:b", "spotify:track:c"],
		syncedUris: ["spotify:track:a"],
		desiredAlbumIds: ["alb1", "alb2"],
		syncedAlbumIds: ["alb1"],
		desiredAlbumTrackUris: {
			alb1: ["spotify:track:a"],
			alb2: ["spotify:track:b", "spotify:track:c"],
		},
	});
	assert.equal(plan.action, "append");
	if (plan.action === "append") {
		assert.deepEqual(plan.uris, ["spotify:track:b", "spotify:track:c"]);
		assert.deepEqual(plan.nextSyncedAlbumIds, ["alb1", "alb2"]);
	}
});

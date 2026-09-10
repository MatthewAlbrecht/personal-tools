import assert from "node:assert/strict";
import test from "node:test";
import { enrichListenWithUserAlbum } from "./albumListenEnrichment";

test("missing userAlbum yields listenCount 0 and no first listen", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 1000, albumId: "album1" },
		undefined,
	);
	assert.equal(enriched.listenCount, 0);
	assert.equal(enriched.isFirstListen, false);
	assert.equal("firstListenedAt" in enriched, false);
	assert.equal(enriched.albumId, "album1");
});

test("listen matching firstListenedAt is the first listen", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 1000 },
		{ listenCount: 1, firstListenedAt: 1000 },
	);
	assert.equal(enriched.listenCount, 1);
	assert.equal(enriched.firstListenedAt, 1000);
	assert.equal(enriched.isFirstListen, true);
});

test("replay after firstListenedAt is not the first listen", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 5000 },
		{ listenCount: 3, firstListenedAt: 1000 },
	);
	assert.equal(enriched.listenCount, 3);
	assert.equal(enriched.firstListenedAt, 1000);
	assert.equal(enriched.isFirstListen, false);
});

test("userAlbum without firstListenedAt is not the first listen", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 1000 },
		{ listenCount: 2 },
	);
	assert.equal(enriched.listenCount, 2);
	assert.equal(enriched.isFirstListen, false);
});

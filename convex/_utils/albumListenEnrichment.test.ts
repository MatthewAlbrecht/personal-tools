import assert from "node:assert/strict";
import test from "node:test";
import {
	buildListenOrdinalsById,
	enrichListenWithUserAlbum,
} from "./albumListenEnrichment";

test("buildListenOrdinalsById assigns 1-based chronological ordinals", () => {
	const ordinals = buildListenOrdinalsById([
		{ _id: "a", listenedAt: 500 },
		{ _id: "b", listenedAt: 100 },
		{ _id: "c", listenedAt: 300 },
	]);
	assert.equal(ordinals.get("b"), 1);
	assert.equal(ordinals.get("c"), 2);
	assert.equal(ordinals.get("a"), 3);
});

test("two consecutive listens get sequential ordinals not album total", () => {
	// Album has been listened to 5 times; the last two rows must show 4× and 5×,
	// not 5× and 5× (the denormalized userAlbums.listenCount).
	const ordinals = buildListenOrdinalsById([
		{ _id: "1", listenedAt: 100 },
		{ _id: "2", listenedAt: 200 },
		{ _id: "3", listenedAt: 300 },
		{ _id: "4", listenedAt: 400 },
		{ _id: "5", listenedAt: 500 },
	]);
	assert.equal(ordinals.get("4"), 4);
	assert.equal(ordinals.get("5"), 5);

	const fourth = enrichListenWithUserAlbum(
		{ _id: "4", listenedAt: 400 },
		{ listenCount: 5, firstListenedAt: 100 },
		ordinals.get("4") ?? 0,
	);
	const fifth = enrichListenWithUserAlbum(
		{ _id: "5", listenedAt: 500 },
		{ listenCount: 5, firstListenedAt: 100 },
		ordinals.get("5") ?? 0,
	);

	assert.equal(fourth.listenCount, 4);
	assert.equal(fifth.listenCount, 5);
	assert.equal(fourth.isFirstListen, false);
	assert.equal(fifth.isFirstListen, false);
});

test("missing userAlbum still uses listen ordinal for listenCount", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 1000, albumId: "album1" },
		undefined,
		2,
	);
	assert.equal(enriched.listenCount, 2);
	assert.equal(enriched.isFirstListen, false);
	assert.equal("firstListenedAt" in enriched, false);
	assert.equal(enriched.albumId, "album1");
});

test("listen matching firstListenedAt is the first listen", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 1000 },
		{ listenCount: 5, firstListenedAt: 1000 },
		1,
	);
	assert.equal(enriched.listenCount, 1);
	assert.equal(enriched.firstListenedAt, 1000);
	assert.equal(enriched.isFirstListen, true);
});

test("replay after firstListenedAt is not the first listen", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 5000 },
		{ listenCount: 5, firstListenedAt: 1000 },
		3,
	);
	assert.equal(enriched.listenCount, 3);
	assert.equal(enriched.firstListenedAt, 1000);
	assert.equal(enriched.isFirstListen, false);
});

test("userAlbum without firstListenedAt is not the first listen", () => {
	const enriched = enrichListenWithUserAlbum(
		{ listenedAt: 1000 },
		{ listenCount: 2 },
		2,
	);
	assert.equal(enriched.listenCount, 2);
	assert.equal(enriched.isFirstListen, false);
});

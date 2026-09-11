import assert from "node:assert/strict";
import test from "node:test";
import {
	pickDuelPair,
	seedEloFromRating,
	seededUnit,
	type DuelPoolItem,
} from "./duel-pairing";

test("seedEloFromRating maps 8→1500, 15→1575, 1→1425", () => {
	assert.equal(seedEloFromRating(8), 1500);
	assert.equal(seedEloFromRating(15), 1575);
	assert.equal(seedEloFromRating(1), 1425);
});

test("seededUnit is deterministic", () => {
	assert.equal(seededUnit(42, 1), seededUnit(42, 1));
	assert.notEqual(seededUnit(42, 1), seededUnit(42, 2));
});

test("pickDuelPair returns two distinct albums", () => {
	const pool: DuelPoolItem[] = Array.from({ length: 10 }, (_, i) => ({
		userAlbumId: `ua${i}`,
		albumId: `al${i}`,
		rating: 10,
		title: `Album ${i}`,
	}));
	const pair = pickDuelPair(pool, new Map(), 99);
	assert.ok(pair);
	assert.notEqual(pair.a.userAlbumId, pair.b.userAlbumId);
});

test("pickDuelPair returns null for fewer than 2 albums", () => {
	assert.equal(
		pickDuelPair(
			[{ userAlbumId: "a", albumId: "1", rating: 10 }],
			new Map(),
			1,
		),
		null,
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import { extractOrderedUniqueAlbumIds } from "./rob-top-50-import";

test("extractOrderedUniqueAlbumIds preserves first occurrence order", () => {
	const result = extractOrderedUniqueAlbumIds([
		{ albumId: "a1" },
		{ albumId: "a2" },
		{ albumId: "a1" },
		{ albumId: "a3" },
	]);
	assert.deepEqual(result, {
		albumIds: ["a1", "a2", "a3"],
		duplicatesSkipped: 1,
		totalTracks: 4,
		truncated: 0,
	});
});

test("extractOrderedUniqueAlbumIds caps at 50 albums", () => {
	const tracks = Array.from({ length: 60 }, (_, i) => ({
		albumId: `album-${i}`,
	}));
	const result = extractOrderedUniqueAlbumIds(tracks);
	assert.equal(result.albumIds.length, 50);
	assert.equal(result.truncated, 10);
	assert.equal(result.duplicatesSkipped, 0);
});

test("extractOrderedUniqueAlbumIds skips tracks without albumId", () => {
	const result = extractOrderedUniqueAlbumIds([
		{ albumId: "a1" },
		{ albumId: undefined },
		{ albumId: "a2" },
	]);
	assert.deepEqual(result.albumIds, ["a1", "a2"]);
	assert.equal(result.totalTracks, 3);
});

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBandcampAlbumUrl } from "./bandcampAlbumUrl";

test("normalizeBandcampAlbumUrl canonicalizes https host path", () => {
	assert.equal(
		normalizeBandcampAlbumUrl(
			"http://www.JPlank.bandcamp.com/album/slow-steady/?from=foo#x",
		),
		"https://jplank.bandcamp.com/album/slow-steady",
	);
});

test("normalizeBandcampAlbumUrl rejects non-album paths", () => {
	assert.throws(() =>
		normalizeBandcampAlbumUrl("https://jplank.bandcamp.com/track/slow-steady"),
	);
});

test("normalizeBandcampAlbumUrl rejects non-bandcamp hosts", () => {
	assert.throws(() =>
		normalizeBandcampAlbumUrl("https://example.com/album/slow-steady"),
	);
});

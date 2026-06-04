import assert from "node:assert/strict";
import test from "node:test";
import { buildAlbumZineSongInput } from "./album-song-input";

test("maps a genius song to zine song input with album artist", () => {
	const result = buildAlbumZineSongInput({
		album: { albumTitle: "Twenty", artistName: "Taking Back Sunday" },
		song: {
			id: "song1",
			trackNumber: 9,
			songTitle: "Cute Without the 'E'",
			lyrics: "first line\nsecond line",
			about: "context",
		},
	});

	assert.equal(result.id, "song1");
	assert.equal(result.position, 9);
	assert.equal(result.title, "Cute Without the 'E'");
	assert.equal(result.artistName, "Taking Back Sunday");
	assert.equal(result.albumTitle, "Twenty");
	assert.equal(result.albumYear, undefined);
	assert.equal(result.albumArtUrl, undefined);
	assert.equal(result.userNote, undefined);
	assert.equal(result.durationSeconds, undefined);
	assert.equal(result.about, "context");
	assert.equal(result.lyrics, "first line\nsecond line");
});

test("falls back to placeholder title and empty lyrics", () => {
	const result = buildAlbumZineSongInput({
		album: { albumTitle: "X", artistName: "Y" },
		song: { id: "s", trackNumber: 1, songTitle: "", lyrics: "" },
	});

	assert.equal(result.title, "Untitled song");
	assert.equal(result.lyrics, "");
	assert.equal(result.about, undefined);
});

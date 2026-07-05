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
	assert.equal(result.introContent, "context");
	assert.equal(result.about, undefined);
	assert.equal(result.lyrics, "first line\nsecond line");
});

test("falls back to placeholder title and empty lyrics", () => {
	const result = buildAlbumZineSongInput({
		album: { albumTitle: "X", artistName: "Y" },
		song: { id: "s", trackNumber: 1, songTitle: "", lyrics: "" },
	});

	assert.equal(result.title, "Untitled song");
	assert.equal(result.lyrics, "");
	assert.equal(result.introContent, undefined);
	assert.equal(result.about, undefined);
});

test("uses display overrides and falls back from blank text overrides", () => {
	const overridden = buildAlbumZineSongInput({
		album: { albumTitle: "Scraped Album", artistName: "Scraped Artist" },
		song: {
			id: "song2",
			trackNumber: 2,
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			about: "Scraped about",
			songTitleOverride: " Display Title ",
			lyricsOverride: " Display lyrics ",
			aboutOverride: " Display about ",
			durationSecondsOverride: 214,
		},
	});

	assert.equal(overridden.title, "Display Title");
	assert.equal(overridden.lyrics, "Display lyrics");
	assert.equal(overridden.introContent, "Display about");
	assert.equal(overridden.about, undefined);
	assert.equal(overridden.durationSeconds, 214);

	const fallback = buildAlbumZineSongInput({
		album: { albumTitle: "Scraped Album", artistName: "Scraped Artist" },
		song: {
			id: "song3",
			trackNumber: 3,
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			about: "Scraped about",
			songTitleOverride: "   ",
			lyricsOverride: "",
			aboutOverride: "  ",
		},
	});

	assert.equal(fallback.title, "Scraped Title");
	assert.equal(fallback.lyrics, "Scraped lyrics");
	assert.equal(fallback.introContent, "Scraped about");
	assert.equal(fallback.about, undefined);
	assert.equal(fallback.durationSeconds, undefined);
});

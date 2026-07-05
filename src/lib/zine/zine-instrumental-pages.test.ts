import assert from "node:assert/strict";
import test from "node:test";
import {
	buildCollapsedSongPages,
	isInstrumentalOnlySong,
	ZINE_INSTRUMENTAL_GROUP_MAX,
} from "./zine-instrumental-pages";
import type { ZineSongPageData } from "./zine-pages";

function makeSong(
	id: string,
	position: number,
	lyrics: string,
): ZineSongPageData {
	return {
		songId: id,
		position,
		title: `Track ${position}`,
		artistName: "Artist",
		lyrics,
	};
}

test("isInstrumentalOnlySong treats empty lyrics as instrumental", () => {
	assert.equal(isInstrumentalOnlySong({ lyrics: "" }), true);
	assert.equal(isInstrumentalOnlySong({ lyrics: "   " }), true);
	assert.equal(isInstrumentalOnlySong({ lyrics: "[Instrumental]" }), true);
});

test("isInstrumentalOnlySong treats lyrical content as non-instrumental", () => {
	assert.equal(isInstrumentalOnlySong({ lyrics: "Hello world" }), false);
});

test("buildCollapsedSongPages groups up to six consecutive instrumentals", () => {
	const songs = [
		makeSong("a", 1, ""),
		makeSong("b", 2, ""),
		makeSong("c", 3, ""),
		makeSong("d", 4, ""),
		makeSong("e", 5, ""),
		makeSong("f", 6, ""),
	];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: true,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 1);
	assert.equal(pages[0]?.kind, "instrumental-group");
	if (pages[0]?.kind === "instrumental-group") {
		assert.equal(pages[0].songs.length, 6);
	}
});

test("buildCollapsedSongPages splits runs longer than max group size", () => {
	const songs = Array.from({ length: 7 }, (_, index) =>
		makeSong(`song-${index}`, index + 1, ""),
	);

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: true,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 2);
	assert.equal(pages[0]?.kind, "instrumental-group");
	assert.equal(pages[1]?.kind, "song");
	if (pages[0]?.kind === "instrumental-group") {
		assert.equal(pages[0].songs.length, ZINE_INSTRUMENTAL_GROUP_MAX);
	}
	if (pages[1]?.kind === "song") {
		assert.equal(pages[1].data.songId, "song-6");
	}
});

test("buildCollapsedSongPages preserves breaks between lyrical and instrumental tracks", () => {
	const songs = [
		makeSong("a", 1, ""),
		makeSong("b", 2, "Verse one"),
		makeSong("c", 3, ""),
		makeSong("d", 4, ""),
	];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: true,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 3);
	assert.equal(pages[0]?.kind, "song");
	assert.equal(pages[1]?.kind, "song");
	assert.equal(pages[2]?.kind, "instrumental-group");
	if (pages[0]?.kind === "song") {
		assert.equal(pages[0].data.songId, "a");
	}
	if (pages[1]?.kind === "song") {
		assert.equal(pages[1].data.songId, "b");
	}
	if (pages[2]?.kind === "instrumental-group") {
		assert.deepEqual(
			pages[2].songs.map((song) => song.songId),
			["c", "d"],
		);
	}
});

test("buildCollapsedSongPages returns one page per song when collapse is disabled", () => {
	const songs = [
		makeSong("a", 1, ""),
		makeSong("b", 2, ""),
		makeSong("c", 3, ""),
	];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: false,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 3);
	assert.ok(pages.every((page) => page.kind === "song"));
});

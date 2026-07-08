import assert from "node:assert/strict";
import test from "node:test";
import { buildCollapsedSongPages } from "./zine-instrumental-pages";
import type { ZineSongPageData } from "./zine-pages";

function makeSong(
	id: string,
	position: number,
	lyrics: string,
	collapseWithPrevious?: boolean,
): ZineSongPageData {
	return {
		songId: id,
		position,
		title: `Track ${position}`,
		artistName: "Artist",
		lyrics,
		collapseWithPrevious,
	};
}

test("manual collapse groups lyrical tracks into a song-group page", () => {
	const songs = [
		makeSong("a", 1, "Verse one"),
		makeSong("b", 2, "Short line", true),
	];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: true,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 1);
	assert.equal(pages[0]?.kind, "song-group");
	if (pages[0]?.kind === "song-group") {
		assert.deepEqual(
			pages[0].songs.map((song) => song.songId),
			["a", "b"],
		);
	}
});

test("manual collapse chains more than two tracks onto one page", () => {
	const songs = [
		makeSong("a", 1, "Verse one"),
		makeSong("b", 2, "Line", true),
		makeSong("c", 3, "Line", true),
	];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: true,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 1);
	if (pages[0]?.kind === "song-group") {
		assert.equal(pages[0].songs.length, 3);
	}
});

test("clearing collapse on the last track splits it onto its own page", () => {
	const songs = [
		makeSong("a", 1, "Verse one"),
		makeSong("b", 2, "Line", true),
		makeSong("c", 3, "Line", false),
	];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: true,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 2);
	assert.equal(pages[0]?.kind, "song-group");
	assert.equal(pages[1]?.kind, "song");
	if (pages[0]?.kind === "song-group") {
		assert.deepEqual(
			pages[0].songs.map((song) => song.songId),
			["a", "b"],
		);
	}
});

test("manual collapse works even when instrumental collapse is disabled", () => {
	const songs = [makeSong("a", 1, "Verse one"), makeSong("b", 2, "Line", true)];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: false,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 1);
	assert.equal(pages[0]?.kind, "song-group");
});

test("first track cannot collapse upward when flag set spuriously", () => {
	const songs = [
		makeSong("a", 1, "Verse one", true),
		makeSong("b", 2, "Verse two"),
	];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: true,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 2);
	assert.equal(pages[0]?.kind, "song");
	assert.equal(pages[1]?.kind, "song");
});

test("manual chain of instrumentals renders as an instrumental group", () => {
	const songs = [makeSong("a", 1, ""), makeSong("b", 2, "", true)];

	const pages = buildCollapsedSongPages(songs, {
		collapseInstrumentalTracks: false,
		showSectionLabels: false,
	});

	assert.equal(pages.length, 1);
	assert.equal(pages[0]?.kind, "instrumental-group");
});

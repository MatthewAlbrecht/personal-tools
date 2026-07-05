import assert from "node:assert/strict";
import test from "node:test";
import { buildZinePages } from "./zine-pages";

test("buildZinePages inserts intro page after cover when provided", () => {
	const pages = buildZinePages({
		playlistTitle: "Intro Album",
		songs: [
			{
				id: "song-a",
				position: 1,
				title: "Song A",
				artistName: "Artist A",
				lyrics: "Line one",
			},
		],
		intro: {
			content: "Welcome to the album.",
			settings: {
				paragraphSpacingPt: 8,
				marginPt: 12,
				verticalAlign: "top",
				fontSizePt: 10,
			},
		},
	});

	assert.equal(pages.length, 4);
	assert.equal(pages[0]?.kind, "cover");
	assert.equal(pages[1]?.kind, "intro");
	assert.equal(pages[2]?.kind, "song");
	assert.equal(pages[3]?.kind, "back-cover");
});

test("buildZinePages starts with a cover and ends with a back cover", () => {
	const pages = buildZinePages({
		playlistTitle: "Music Tour 2026",
		songs: [
			{
				id: "song-a",
				position: 1,
				title: "Song A",
				artistName: "Artist A",
				lyrics: "Line one\nLine two",
			},
			{
				id: "song-b",
				position: 2,
				title: "Song B",
				artistName: "Artist B",
				lyrics: "Another song",
			},
		],
	});

	assert.equal(pages.length, 4);
	assert.deepEqual(pages[0], {
		kind: "cover",
		playlistTitle: "Music Tour 2026",
		artistName: undefined,
	});
	assert.equal(pages[1]?.kind, "song");
	assert.equal(pages[1]?.songId, "song-a");
	assert.equal(pages[2]?.kind, "song");
	assert.equal(pages[2]?.songId, "song-b");
	assert.equal(pages[3]?.kind, "back-cover");
});

test("buildZinePages includes songs without lyrics", () => {
	const pages = buildZinePages({
		playlistTitle: "Draft Packet",
		songs: [
			{
				id: "missing",
				position: 1,
				title: "Missing Lyrics",
				artistName: "Artist",
				lyrics: "",
			},
			{
				id: "ready",
				position: 2,
				title: "Ready Song",
				artistName: "Artist",
				lyrics: "Hello",
			},
		],
	});

	assert.equal(pages.length, 4);
	assert.equal(pages.filter((page) => page.kind === "song").length, 2);
	assert.equal(pages[pages.length - 1]?.kind, "back-cover");
});

test("buildZinePages inserts blanks before back cover when cover + songs fill a sheet", () => {
	const pages = buildZinePages({
		playlistTitle: "Full Album",
		songs: [
			{ id: "1", position: 1, title: "A", artistName: "X", lyrics: "a" },
			{ id: "2", position: 2, title: "B", artistName: "X", lyrics: "b" },
			{ id: "3", position: 3, title: "C", artistName: "X", lyrics: "c" },
		],
	});

	assert.equal(pages.length, 8);
	assert.equal(pages[0]?.kind, "cover");
	assert.equal(pages[1]?.kind, "song");
	assert.equal(pages[2]?.kind, "song");
	assert.equal(pages[3]?.kind, "song");
	assert.equal(pages[4]?.kind, "blank");
	assert.equal(pages[5]?.kind, "blank");
	assert.equal(pages[6]?.kind, "blank");
	assert.equal(pages[7]?.kind, "back-cover");
});

test("buildZinePages collapses consecutive instrumental tracks by default", () => {
	const pages = buildZinePages({
		playlistTitle: "Instrumentals",
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "" },
			{ id: "b", position: 2, title: "B", artistName: "X", lyrics: "" },
			{ id: "c", position: 3, title: "C", artistName: "X", lyrics: "" },
			{ id: "d", position: 4, title: "D", artistName: "X", lyrics: "" },
			{ id: "e", position: 5, title: "E", artistName: "X", lyrics: "" },
			{ id: "f", position: 6, title: "F", artistName: "X", lyrics: "" },
		],
	});

	const contentPages = pages.filter(
		(page) => page.kind === "song" || page.kind === "instrumental-group",
	);

	assert.equal(contentPages.length, 1);
	assert.equal(contentPages[0]?.kind, "instrumental-group");
	if (contentPages[0]?.kind === "instrumental-group") {
		assert.equal(contentPages[0].songs.length, 6);
	}
});

test("buildZinePages keeps separate instrumental pages when requested", () => {
	const pages = buildZinePages({
		playlistTitle: "Instrumentals",
		collapseInstrumentalTracks: false,
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "" },
			{ id: "b", position: 2, title: "B", artistName: "X", lyrics: "" },
		],
	});

	assert.equal(pages.filter((page) => page.kind === "song").length, 2);
	assert.equal(
		pages.filter((page) => page.kind === "instrumental-group").length,
		0,
	);
});

test("buildZinePages inserts inside-back page before back cover when content exists", () => {
	const pages = buildZinePages({
		playlistTitle: "Test",
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "line" },
		],
		insideBack: {
			sections: [
				{
					type: "discography",
					items: [{ albumTitle: "Kid A", blurb: "Great." }],
				},
			],
		},
	});

	assert.equal(pages.length, 4);
	assert.equal(pages[0]?.kind, "cover");
	assert.equal(pages[1]?.kind, "song");
	assert.equal(pages[2]?.kind, "inside-back");
	assert.equal(pages[3]?.kind, "back-cover");
});

test("buildZinePages omits inside-back when no content and includeWhenEmpty false", () => {
	const pages = buildZinePages({
		playlistTitle: "Test",
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "line" },
		],
		insideBack: { sections: [], includeWhenEmpty: false },
	});

	assert.equal(pages.length, 4);
	assert.equal(
		pages.some((page) => page.kind === "inside-back"),
		false,
	);
	assert.equal(pages[pages.length - 1]?.kind, "back-cover");
});

test("buildZinePages includes empty inside-back when includeWhenEmpty true", () => {
	const pages = buildZinePages({
		playlistTitle: "Test",
		songs: [
			{ id: "a", position: 1, title: "A", artistName: "X", lyrics: "line" },
		],
		insideBack: { sections: [], includeWhenEmpty: true },
	});

	assert.equal(pages[2]?.kind, "inside-back");
	assert.equal(pages[3]?.kind, "back-cover");
});

test("buildZinePages always produces a count divisible by four", () => {
	for (let songCount = 0; songCount <= 15; songCount += 1) {
		const songs = Array.from({ length: songCount }, (_, index) => ({
			id: `song-${index}`,
			position: index + 1,
			title: `Track ${index + 1}`,
			artistName: "Artist",
			lyrics: "line",
		}));

		const pages = buildZinePages({ playlistTitle: "Test", songs });
		assert.equal(pages.length % 4, 0, `songCount=${songCount}`);
		assert.equal(pages[0]?.kind, "cover");
		assert.equal(pages[pages.length - 1]?.kind, "back-cover");
	}
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildZinePages } from "./zine-pages";

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

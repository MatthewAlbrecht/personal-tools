import assert from "node:assert/strict";
import test from "node:test";
import {
	buildZineSongDisplayInput,
	getPlaylistDisplayTrackNumber,
} from "./song-display";

test("getPlaylistDisplayTrackNumber is 1-based from sorted index", () => {
	assert.equal(getPlaylistDisplayTrackNumber(0), 1);
	assert.equal(getPlaylistDisplayTrackNumber(4), 5);
});

test("buildZineSongDisplayInput uses display position not stored playlist position", () => {
	const result = buildZineSongDisplayInput({
		id: "item-1",
		position: getPlaylistDisplayTrackNumber(1),
		scrape: {
			songTitle: "Song B",
			artistName: "Artist",
			lyrics: "Lyrics",
		},
	});

	assert.equal(result.position, 2);
});

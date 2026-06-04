import assert from "node:assert/strict";
import test from "node:test";
import {
	buildTrackPrimaryLineParts,
	buildZineCreditParts,
	formatTrackDuration,
	formatTrackDurationInput,
	getPlaceholderTrackDurationSeconds,
	parseTrackDurationInput,
} from "./zine-song-header-content";

test("formatTrackDuration formats seconds as m:ss", () => {
	assert.equal(formatTrackDuration(245), "4:05");
});

test("formatTrackDurationInput returns empty string when unset", () => {
	assert.equal(formatTrackDurationInput(undefined), "");
	assert.equal(formatTrackDurationInput(195), "3:15");
});

test("parseTrackDurationInput parses m:ss and clears on empty", () => {
	assert.equal(parseTrackDurationInput("3:15"), 195);
	assert.equal(parseTrackDurationInput("  0:45  "), 45);
	assert.equal(parseTrackDurationInput(""), null);
	assert.throws(() => parseTrackDurationInput("3:60"), /less than 60/);
	assert.throws(() => parseTrackDurationInput("abc"), /m:ss/);
});

test("buildTrackPrimaryLineParts splits position, title, and duration", () => {
	assert.deepEqual(
		buildTrackPrimaryLineParts({
			position: 2,
			title: "Sweetness",
			durationSeconds: 195,
		}),
		{
			trackNumberLabel: "02",
			title: "Sweetness",
			durationText: "3:15",
		},
	);
});

test("getPlaceholderTrackDurationSeconds returns deterministic placeholder values", () => {
	assert.equal(getPlaceholderTrackDurationSeconds(1), 167);
	assert.equal(getPlaceholderTrackDurationSeconds(2), 184);
});

test("buildZineCreditParts italicizes album name only", () => {
	const parts = buildZineCreditParts(
		{
			artistName: "Jimmy Eat World",
			albumTitle: "Bleed American",
			albumYear: "2001",
		},
		{
			showArtist: true,
			showAlbum: true,
			showYear: true,
		},
	);

	assert.equal(parts.length, 3);
	assert.equal(parts[0]?.kind, "text");
	assert.equal(parts[1]?.kind, "album");
	assert.equal(parts[1]?.value, "Bleed American");
});

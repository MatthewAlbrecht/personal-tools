import assert from "node:assert/strict";
import test from "node:test";
import { albumMatchesGenreClauses } from "./smartPlaylistGenreMatch";

const primary = new Set(["folk", "rock"]);
const secondary = new Set(["jazz"]);

test("empty clauses match everything", () => {
	assert.equal(
		albumMatchesGenreClauses(primary, secondary, [], "any"),
		true,
	);
});

test("include any: one matching primary role passes", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "folk", mode: "include", role: "primary" }],
			"any",
		),
		true,
	);
});

test("include primary fails when genre only secondary", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "jazz", mode: "include", role: "primary" }],
			"any",
		),
		false,
	);
});

test("include either matches secondary", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "jazz", mode: "include", role: "either" }],
			"any",
		),
		true,
	);
});

test("include all requires every include clause", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[
				{ genreKey: "folk", mode: "include", role: "primary" },
				{ genreKey: "jazz", mode: "include", role: "either" },
			],
			"all",
		),
		true,
	);
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[
				{ genreKey: "folk", mode: "include", role: "primary" },
				{ genreKey: "ambient", mode: "include", role: "either" },
			],
			"all",
		),
		false,
	);
});

test("exclude vetoes even when includes would pass", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[
				{ genreKey: "folk", mode: "include", role: "primary" },
				{ genreKey: "jazz", mode: "exclude", role: "secondary" },
			],
			"any",
		),
		false,
	);
});

test("exclude alone filters without includes", () => {
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "folk", mode: "exclude", role: "primary" }],
			"any",
		),
		false,
	);
	assert.equal(
		albumMatchesGenreClauses(
			primary,
			secondary,
			[{ genreKey: "ambient", mode: "exclude", role: "either" }],
			"any",
		),
		true,
	);
});

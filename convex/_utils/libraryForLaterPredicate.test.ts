import assert from "node:assert/strict";
import test from "node:test";
import type { Doc } from "../_generated/dataModel";
import { normalizeForLaterFilters } from "./forLaterAlbumsUi";
import { libraryRowMatchesForLaterFilters } from "./libraryForLaterPredicate";

const baseRow = {
	isActiveForLater: true,
	searchText: "selected ambient artist",
	releaseYear: 2020,
	totalDurationMs: 40 * 60 * 1000,
	filterHasListened: true,
	rymStatus: "linked",
	rymNotOnSite: undefined,
	primaryGenres: [{ key: "ambient", label: "Ambient" }],
	secondaryGenres: [{ key: "electronic", label: "Electronic" }],
	descriptors: [{ key: "atmospheric", label: "Atmospheric" }],
	filterGenreKeysSorted: ["ambient", "electronic"],
} as Doc<"albumLibraryItems">;

function matches(
	overrides: Partial<Doc<"albumLibraryItems">>,
	filters: Parameters<typeof normalizeForLaterFilters>[0],
): boolean {
	return libraryRowMatchesForLaterFilters(
		{ ...baseRow, ...overrides },
		normalizeForLaterFilters(filters),
	);
}

test("inactive library rows never match", () => {
	assert.equal(matches({ isActiveForLater: false }, {}), false);
	assert.equal(matches({ isActiveForLater: undefined }, {}), false);
});

test("search matches projected text case-insensitively", () => {
	assert.equal(matches({}, { search: "AMBIENT ART" }), true);
	assert.equal(matches({}, { search: "jazz" }), false);
});

test("year boundaries are inclusive", () => {
	assert.equal(matches({}, { yearMin: 2020, yearMax: 2020 }), true);
	assert.equal(matches({}, { yearMin: 2021 }), false);
	assert.equal(matches({}, { yearMax: 2019 }), false);
});

test("duration boundaries use projected milliseconds", () => {
	assert.equal(
		matches({}, { durationMinMinutes: 40, durationMaxMinutes: 40 }),
		true,
	);
	assert.equal(matches({}, { durationMinMinutes: 41 }), false);
});

test("listened and RYM filters use library projections", () => {
	assert.equal(
		matches({}, { listened: "listened", rymStatus: "has_scrape" }),
		true,
	);
	assert.equal(matches({}, { listened: "not_listened" }), false);
	assert.equal(
		matches({ rymNotOnSite: true }, { rymStatus: "not_on_rym" }),
		true,
	);
	assert.equal(matches({}, { rymStatus: "no_scrape" }), false);
});

test("genre filters prefer projected ancestor keys", () => {
	assert.equal(matches({}, { genreKeys: ["ambient"] }), true);
	assert.equal(matches({}, { genreKeys: ["electronic"] }), true);
	assert.equal(
		matches(
			{
				primaryGenres: [{ key: "acoustic blues", label: "Acoustic Blues" }],
				secondaryGenres: [],
				filterGenreKeysSorted: ["acoustic blues", "blues"],
			},
			{ genreKeys: ["blues"] },
		),
		true,
	);
	assert.equal(
		matches(
			{
				primaryGenres: [{ key: "acoustic blues", label: "Acoustic Blues" }],
				secondaryGenres: [],
				filterGenreKeysSorted: ["acoustic blues"],
			},
			{ genreKeys: ["blues"] },
		),
		false,
	);
});

test("descriptor and genre groups honor independent any/all matching", () => {
	assert.equal(
		matches(
			{},
			{
				genreKeys: ["ambient", "missing"],
				genreMatch: "any",
				descriptorKeys: ["atmospheric", "missing"],
				descriptorMatch: "all",
			},
		),
		false,
	);
	assert.equal(
		matches(
			{},
			{
				genreKeys: ["ambient", "missing"],
				genreMatch: "any",
				descriptorKeys: ["atmospheric", "missing"],
				descriptorMatch: "any",
			},
		),
		true,
	);
});

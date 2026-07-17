import assert from "node:assert/strict";
import test from "node:test";
import {
	albumMatchesDurationFilter,
	durationBoundsFromFilters,
	isRatingFilterActive,
	migrateLegacySmartPlaylistFilters,
} from "./smartPlaylistFilterModel";

test("migrateLegacy maps genreKeys + primaryGenresOnly to include clauses", () => {
	const next = migrateLegacySmartPlaylistFilters({
		genreKeys: ["folk", "jazz"],
		genreMatch: "all",
		primaryGenresOnly: true,
		descriptorKeys: [],
		descriptorMatch: "any",
		ratingMin: 10,
		ratingMax: 15,
	});
	assert.deepEqual(next.genreClauses, [
		{ genreKey: "folk", mode: "include", role: "primary" },
		{ genreKey: "jazz", mode: "include", role: "primary" },
	]);
	assert.equal(next.genreMatch, "all");
	assert.deepEqual(next.excludedAlbumIds, []);
	assert.equal(next.ratingMin, 10);
	assert.equal(next.ratingMax, 15);
	assert.equal(next.durationOpenLow, true);
	assert.equal(next.durationOpenHigh, true);
});

test("migrateLegacy uses either when primaryGenresOnly is false", () => {
	const next = migrateLegacySmartPlaylistFilters({
		genreKeys: ["folk"],
		genreMatch: "any",
		primaryGenresOnly: false,
		descriptorKeys: [],
		descriptorMatch: "any",
	});
	assert.equal(next.genreClauses[0]?.role, "either");
	assert.equal(next.ratingMin, 1);
	assert.equal(next.ratingMax, 15);
});

test("isRatingFilterActive is false only for full 1–15", () => {
	assert.equal(isRatingFilterActive({ ratingMin: 1, ratingMax: 15 }), false);
	assert.equal(isRatingFilterActive({ ratingMin: 10, ratingMax: 15 }), true);
});

test("duration both open matches any duration including missing", () => {
	const filters = {
		durationOpenLow: true,
		durationOpenHigh: true,
	};
	assert.equal(albumMatchesDurationFilter(undefined, filters), true);
	assert.equal(albumMatchesDurationFilter(5 * 60_000, filters), true);
});

test("duration open-low with max 45 allows under 20 and up to 45", () => {
	const filters = {
		durationOpenLow: true,
		durationOpenHigh: false,
		durationMaxMinutes: 45,
	};
	assert.equal(albumMatchesDurationFilter(10 * 60_000, filters), true);
	assert.equal(albumMatchesDurationFilter(45 * 60_000, filters), true);
	assert.equal(albumMatchesDurationFilter(46 * 60_000, filters), false);
});

test("duration min 30 with open-high allows 30+ including 90+", () => {
	const filters = {
		durationOpenLow: false,
		durationOpenHigh: true,
		durationMinMinutes: 30,
	};
	assert.equal(albumMatchesDurationFilter(29 * 60_000, filters), false);
	assert.equal(albumMatchesDurationFilter(30 * 60_000, filters), true);
	assert.equal(albumMatchesDurationFilter(120 * 60_000, filters), true);
});

test("durationBoundsFromFilters encodes open ends", () => {
	assert.deepEqual(
		durationBoundsFromFilters({
			durationOpenLow: true,
			durationOpenHigh: true,
		}),
		{ minMinutes: undefined, maxMinutes: undefined, active: false },
	);
});

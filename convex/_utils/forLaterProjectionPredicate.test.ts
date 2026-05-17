import assert from "node:assert/strict";
import test from "node:test";
import type { Doc, Id } from "../_generated/dataModel";
import { normalizeForLaterFilters } from "./forLaterAlbumsUi";
import { projectionMatchesFilters } from "./forLaterProjectionPredicate";

function stubDoc(
	overrides: Partial<Doc<"forLaterAlbumItems">> &
		Pick<Doc<"forLaterAlbumItems">, "_id" | "_creationTime">,
): Doc<"forLaterAlbumItems"> {
	return {
		userId: "u",
		albumId: "album" as Id<"spotifyAlbums">,
		spotifyAlbumId: "sp",
		albumTitleKey: "t",
		artistKeys: [],
		sourceTrackIds: [],
		firstSeenAt: 0,
		lastSeenAt: 0,
		isActive: true,
		rymDiscoveryStatus: "not_started",
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	} as Doc<"forLaterAlbumItems">;
}

test("projectionMatchesFilters ALL requires every predicate when multiple facets apply", () => {
	const doc = stubDoc({
		_id: "item1" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterReleaseYear: 1999,
		filterGenreKeysSorted: ["rock"],
	});
	const filters = normalizeForLaterFilters({
		year: 1999,
		genreKeys: ["rock"],
	});
	assert.equal(projectionMatchesFilters(doc, filters), true);
});

test("projectionMatchesFilters ALL fails when genre subset incomplete", () => {
	const doc = stubDoc({
		_id: "item2" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterGenreKeysSorted: ["rock"],
	});
	const filters = normalizeForLaterFilters({
		genreKeys: ["rock", "jazz"],
	});
	assert.equal(projectionMatchesFilters(doc, filters), false);
});

test("projectionMatchesFilters core facets AND descriptor ANY among selected keys", () => {
	const doc = stubDoc({
		_id: "item3" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterReleaseYear: 1999,
		filterDescriptorKeysSorted: ["x", "y"],
	});
	const filters = normalizeForLaterFilters({
		year: 1999,
		descriptorKeys: ["x", "z"],
		descriptorMatch: "any",
	});
	assert.equal(projectionMatchesFilters(doc, filters), true);
});

test("projectionMatchesFilters core AND applies across taxonomy groups", () => {
	const doc = stubDoc({
		_id: "item3b" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterReleaseYear: 2001,
		filterDescriptorKeysSorted: ["x"],
	});
	const filters = normalizeForLaterFilters({
		year: 1999,
		descriptorKeys: ["x"],
		descriptorMatch: "any",
	});
	assert.equal(projectionMatchesFilters(doc, filters), false);
});

test("skipSearchPredicate skips substring gate used after FTS pre-filter", () => {
	const doc = stubDoc({
		_id: "item4" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterSearchText: "Abbey Road Beatles",
	});
	const filters = normalizeForLaterFilters({
		search: "nomatchsubstring",
	});
	assert.equal(projectionMatchesFilters(doc, filters), false);
	assert.equal(
		projectionMatchesFilters(doc, filters, { skipSearchPredicate: true }),
		true,
	);
});

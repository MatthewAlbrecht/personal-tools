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
		yearMin: 1999,
		yearMax: 1999,
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
		yearMin: 1999,
		yearMax: 1999,
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
		yearMin: 1999,
		yearMax: 1999,
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

test("projectionMatchesFilters excludes not-on-RYM rows from scrape filters", () => {
	const doc = stubDoc({
		_id: "item5" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterHasRymUrl: false,
		filterRymNotOnSite: true,
	});
	const filters = normalizeForLaterFilters({ rymStatus: "no_scrape" });
	assert.equal(projectionMatchesFilters(doc, filters), false);
	assert.equal(
		projectionMatchesFilters(
			doc,
			normalizeForLaterFilters({ rymStatus: "all" }),
		),
		true,
	);
});

test("projectionMatchesFilters applies inclusive year range on filterReleaseYear", () => {
	const doc = stubDoc({
		_id: "itemRange" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterReleaseYear: 1975,
	});
	const inRange = normalizeForLaterFilters({ yearMin: 1970, yearMax: 1979 });
	const outOfRange = normalizeForLaterFilters({ yearMin: 1980, yearMax: 1989 });
	assert.equal(projectionMatchesFilters(doc, inRange), true);
	assert.equal(projectionMatchesFilters(doc, outOfRange), false);
});

test("projectionMatchesFilters applies duration bucket on filterDurationMs", () => {
	const doc = {
		filterDurationMs: 45 * 60 * 1000,
	} as Doc<"forLaterAlbumItems">;
	const matchingBucket = normalizeForLaterFilters({ durationBucketKey: "40_50" });
	const otherBucket = normalizeForLaterFilters({ durationBucketKey: "50_60" });
	assert.equal(projectionMatchesFilters(doc, matchingBucket), true);
	assert.equal(projectionMatchesFilters(doc, otherBucket), false);
});

test("projectionMatchesFilters applies inclusive duration range on filterDurationMs", () => {
	const doc = stubDoc({
		_id: "itemDuration" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterDurationMs: 40 * 60 * 1000,
	});
	const inRange = normalizeForLaterFilters({
		durationMinMinutes: 35,
		durationMaxMinutes: 55,
	});
	const outOfRange = normalizeForLaterFilters({
		durationMinMinutes: 56,
		durationMaxMinutes: 90,
	});
	assert.equal(projectionMatchesFilters(doc, inRange), true);
	assert.equal(projectionMatchesFilters(doc, outOfRange), false);
});

test("projectionMatchesFilters excludes marked-as-single rows from all lists", () => {
	const single = stubDoc({
		_id: "item8" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterMarkedAsSingle: true,
	});
	const album = stubDoc({
		_id: "item9" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterMarkedAsSingle: undefined,
	});
	const filters = normalizeForLaterFilters({});
	assert.equal(projectionMatchesFilters(single, filters), false);
	assert.equal(projectionMatchesFilters(album, filters), true);
});

test("projectionMatchesFilters excludes removed-from-for-later rows from all lists", () => {
	const removed = stubDoc({
		_id: "item10" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterRemovedFromForLater: true,
	});
	const visible = stubDoc({
		_id: "item11" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterRemovedFromForLater: undefined,
	});
	const filters = normalizeForLaterFilters({});
	assert.equal(projectionMatchesFilters(removed, filters), false);
	assert.equal(projectionMatchesFilters(visible, filters), true);
});

test("projectionMatchesFilters not_on_rym shows only not-on-RYM rows", () => {
	const notOnRym = stubDoc({
		_id: "item6" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterRymNotOnSite: true,
	});
	const onRym = stubDoc({
		_id: "item7" as Id<"forLaterAlbumItems">,
		_creationTime: 0,
		filterRymNotOnSite: undefined,
	});
	const filters = normalizeForLaterFilters({ rymStatus: "not_on_rym" });
	assert.equal(projectionMatchesFilters(notOnRym, filters), true);
	assert.equal(projectionMatchesFilters(onRym, filters), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildAlbumLibraryRymPatchFields } from "./albumLibraryProjection";

test("buildAlbumLibraryRymPatchFields sets only RYM-derived projection fields", () => {
	const patch = buildAlbumLibraryRymPatchFields({
		scrape: {
			_id: "scrape1" as never,
			rymUrl: "https://rateyourmusic.com/release/album/x",
			updatedAt: 1000,
		} as never,
		linkMethod: "manual",
		linkedAt: 2000,
		taxonomy: {
			primaryGenres: [{ key: "rock", label: "Rock" }],
			secondaryGenres: [],
			descriptors: [{ key: "lo-fi", label: "Lo-Fi" }],
		},
		existingUpdatedAt: 500,
	});

	assert.equal(patch.rymStatus, "linked");
	assert.equal(patch.rymScrapeId, "scrape1");
	assert.equal(patch.rymLinkMethod, "manual");
	assert.equal(patch.rymUrl, "https://rateyourmusic.com/release/album/x");
	assert.equal(patch.rymLinkedAt, 2000);
	assert.deepEqual(patch.primaryGenres, [{ key: "rock", label: "Rock" }]);
	assert.deepEqual(patch.descriptors, [{ key: "lo-fi", label: "Lo-Fi" }]);
	assert.equal(patch.updatedAt, 2000);
	assert.equal("listenCount" in patch, false);
	assert.equal("robRankingYears" in patch, false);
});

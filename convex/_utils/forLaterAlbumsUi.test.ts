import assert from "node:assert/strict";
import test from "node:test";
import {
	buildOpenableRymLinks,
	deriveRymStatus,
	normalizeForLaterFilters,
	sortForLaterRows,
} from "./forLaterAlbumsUi";

test("normalizeForLaterFilters applies Phase 4 defaults", () => {
	const filters = normalizeForLaterFilters({});

	assert.deepEqual(filters, {
		genreKey: undefined,
		genreRole: "either",
		descriptorKey: undefined,
		title: undefined,
		artist: undefined,
		year: undefined,
		listened: "all",
		rymStatus: "all",
		playlist: "active",
	});
});

test("deriveRymStatus prefers matched scrapes over candidate status", () => {
	assert.equal(
		deriveRymStatus({
			rymScrapeId: "scrape_1",
			rymCandidateUrl: "https://rateyourmusic.com/release/album/a/b",
			rymDiscoveryStatus: "found",
		}),
		"matched",
	);
});

test("deriveRymStatus reports candidate when no scrape is matched", () => {
	assert.equal(
		deriveRymStatus({
			rymScrapeId: undefined,
			rymCandidateUrl: "https://rateyourmusic.com/release/album/a/b",
			rymDiscoveryStatus: "found",
		}),
		"candidate",
	);
});

test("sortForLaterRows orders lastSeenAt, playlistAddedAt, then createdAt descending", () => {
	const rows = [
		{ id: "old", lastSeenAt: 10, playlistAddedAt: 100, createdAt: 1000 },
		{
			id: "new-created",
			lastSeenAt: 20,
			playlistAddedAt: 200,
			createdAt: 3000,
		},
		{
			id: "new-playlist",
			lastSeenAt: 20,
			playlistAddedAt: 300,
			createdAt: 2000,
		},
	];

	assert.deepEqual(
		sortForLaterRows(rows).map((row) => row.id),
		["new-playlist", "new-created", "old"],
	);
});

test("buildOpenableRymLinks caps candidate and matched URLs in row order", () => {
	const links = buildOpenableRymLinks(
		[
			{ id: "a", rymUrl: "https://rateyourmusic.com/release/album/a/a" },
			{ id: "b", rymUrl: undefined },
			{ id: "c", rymUrl: "https://rateyourmusic.com/release/ep/c/c" },
		],
		1,
	);

	assert.deepEqual(links, [
		{ id: "a", url: "https://rateyourmusic.com/release/album/a/a" },
	]);
});

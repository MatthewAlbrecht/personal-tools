import assert from "node:assert/strict";
import test from "node:test";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
	matchForLaterAlbumsForRymScrape,
	matchRymForForLaterAlbum,
	matchRymForSpotifyAlbum,
	matchRymScrapeToSpotifyAlbums,
} from "./albumMatching";
import {
	artistKeysIntersect,
	buildArtistKeys,
	findTitleArtistMatch,
	normalizeAlbumTitle,
	normalizeArtistName,
} from "./albumMatchingCore";

test("normalizeAlbumTitle trims, lowercases, and collapses whitespace", () => {
	assert.equal(
		normalizeAlbumTitle("  Dragon   New Warm Mountain  "),
		"dragon new warm mountain",
	);
});

test("normalizeAlbumTitle removes conservative edition suffixes", () => {
	assert.equal(
		normalizeAlbumTitle("Fetch the Bolt Cutters (Deluxe Edition)"),
		"fetch the bolt cutters",
	);
	assert.equal(normalizeAlbumTitle("Blue Rev (2022 Remaster)"), "blue rev");
});

test("normalizeAlbumTitle keeps ordinary parentheticals", () => {
	assert.equal(
		normalizeAlbumTitle("Sometimes I Might Be Introvert (Live)"),
		"sometimes i might be introvert (live)",
	);
});

test("normalizeArtistName trims, lowercases, and collapses whitespace", () => {
	assert.equal(normalizeArtistName("  Big   Thief "), "big thief");
});

test("buildArtistKeys removes blank artist names", () => {
	assert.deepEqual(buildArtistKeys(["Big Thief", "  ", "Adrianne Lenker"]), [
		"big thief",
		"adrianne lenker",
	]);
});

test("artistKeysIntersect returns one shared normalized artist key", () => {
	assert.equal(
		artistKeysIntersect(
			["phoebe bridgers", "lucy dacus"],
			["Julien Baker", "Phoebe Bridgers"],
		),
		"phoebe bridgers",
	);
});

test("artistKeysIntersect returns null when no artist overlaps", () => {
	assert.equal(artistKeysIntersect(["weyes blood"], ["jessica pratt"]), null);
});

test("findTitleArtistMatch matches same normalized title and one artist overlap", () => {
	const match = findTitleArtistMatch(
		{
			albumTitleKey: normalizeAlbumTitle("The Record"),
			artistKeys: buildArtistKeys(["boygenius", "Phoebe Bridgers"]),
		},
		[
			{
				id: "scrape_1",
				albumTitle: "The Record",
				artistNames: ["boygenius"],
			},
		],
	);

	assert.deepEqual(match, {
		candidate: {
			id: "scrape_1",
			albumTitle: "The Record",
			artistNames: ["boygenius"],
		},
		matchedArtistKey: "boygenius",
	});
});

test("findTitleArtistMatch rejects same title with no artist overlap", () => {
	const match = findTitleArtistMatch(
		{
			albumTitleKey: normalizeAlbumTitle("Rat Saw God"),
			artistKeys: buildArtistKeys(["Wednesday"]),
		},
		[
			{
				id: "scrape_2",
				albumTitle: "Rat Saw God",
				artistNames: ["MJ Lenderman"],
			},
		],
	);

	assert.equal(match, null);
});

test("matchRymScrapeToSpotifyAlbums falls back to title and artist when Spotify ID misses", async () => {
	const scrapeId = "scrape_ibeyi_ash" as Id<"rateYourMusicScrapes">;
	const { ctx, inserts, patches } = createAlbumMatchingTestContext({
		albums: [
			{
				_id: "album_ibeyi_ash",
				spotifyAlbumId: "spotify_ibeyi_ash_library",
				name: "Ash",
				albumTitleKey: normalizeAlbumTitle("Ash"),
				artistName: "Ibeyi",
				rawData: JSON.stringify({ artists: [{ name: "Ibeyi" }] }),
			},
		],
	});

	const summary = await matchRymScrapeToSpotifyAlbums(ctx, {
		scrapeId,
		spotifyAlbumId: "spotify_ibeyi_ash_scrape_missing",
		albumTitle: "Ash",
		artists: [{ name: "Ibeyi" }],
		now: 123,
	});

	assert.equal(summary.checkedAlbums, 1);
	assert.equal(summary.linkedAlbums, 1);
	assert.deepEqual(inserts, [
		{
			tableName: "rateYourMusicSpotifyAlbumLinks",
			document: {
				scrapeId: "scrape_ibeyi_ash",
				albumId: "album_ibeyi_ash",
				spotifyAlbumId: "spotify_ibeyi_ash_library",
				method: "title_artist",
				matchedArtistKey: "ibeyi",
				updatedAt: 123,
				createdAt: 123,
			},
		},
	]);
	assert.deepEqual(patches, [
		{
			id: "scrape_ibeyi_ash",
			patch: { spotifyAlbumConvexId: "album_ibeyi_ash" },
		},
	]);
});

test("matchRymScrapeToSpotifyAlbums links every title and artist match", async () => {
	const scrapeId = "scrape_ibeyi_ash" as Id<"rateYourMusicScrapes">;
	const { ctx, inserts, patches } = createAlbumMatchingTestContext({
		albums: [
			{
				_id: "album_ibeyi_ash_standard",
				spotifyAlbumId: "spotify_ibeyi_ash_standard",
				name: "Ash",
				albumTitleKey: normalizeAlbumTitle("Ash"),
				artistName: "Ibeyi",
				rawData: JSON.stringify({ artists: [{ name: "Ibeyi" }] }),
			},
			{
				_id: "album_ibeyi_ash_deluxe",
				spotifyAlbumId: "spotify_ibeyi_ash_deluxe",
				name: "Ash",
				albumTitleKey: normalizeAlbumTitle("Ash"),
				artistName: "Ibeyi",
				rawData: JSON.stringify({ artists: [{ name: "Ibeyi" }] }),
			},
		],
	});

	const summary = await matchRymScrapeToSpotifyAlbums(ctx, {
		scrapeId,
		albumTitle: "Ash",
		artists: [{ name: "Ibeyi" }],
		now: 123,
	});

	assert.equal(summary.checkedAlbums, 2);
	assert.equal(summary.linkedAlbums, 2);
	assert.deepEqual(
		inserts.map((insert) => insert.document.albumId),
		["album_ibeyi_ash_standard", "album_ibeyi_ash_deluxe"],
	);
	assert.deepEqual(
		patches.map((patch) => patch.patch.spotifyAlbumConvexId),
		["album_ibeyi_ash_standard", "album_ibeyi_ash_deluxe"],
	);
});

test("albumMatching exports the For Later to RYM matching entry point", () => {
	assert.equal(typeof matchRymForForLaterAlbum, "function");
});

test("albumMatching exports the shared Spotify album RYM matcher", () => {
	assert.equal(typeof matchRymForSpotifyAlbum, "function");
});

test("albumMatching exports the RYM scrape to For Later matching entry point", () => {
	assert.equal(typeof matchForLaterAlbumsForRymScrape, "function");
});

test("albumMatching exports the explicit RYM scrape to Spotify albums matcher", () => {
	assert.equal(typeof matchRymScrapeToSpotifyAlbums, "function");
});

type TestAlbum = {
	_id: string;
	spotifyAlbumId: string;
	name: string;
	albumTitleKey?: string;
	artistName: string;
	rawData?: string;
};

type TestLink = {
	_id: string;
	scrapeId: string;
	albumId: string;
	spotifyAlbumId?: string;
	method: string;
	updatedAt: number;
};

type TestInsert = {
	tableName: string;
	document: Record<string, unknown>;
};

type TestPatch = {
	id: string;
	patch: Record<string, unknown>;
};

type FakeQueryChain = {
	eq: (field: string, value: unknown) => FakeQueryChain;
};

function createAlbumMatchingTestContext({
	albums,
	links = [],
}: {
	albums: TestAlbum[];
	links?: TestLink[];
}): {
	ctx: MutationCtx;
	inserts: TestInsert[];
	patches: TestPatch[];
} {
	const inserts: TestInsert[] = [];
	const patches: TestPatch[] = [];

	function query(tableName: string) {
		let filters: Record<string, unknown> = {};
		const chain = {
			withIndex: (
				_indexName: string,
				filterBuilder: (q: FakeQueryChain) => unknown,
			) => {
				const nextFilters: Record<string, unknown> = {};
				const q: FakeQueryChain = {
					eq(field, value) {
						nextFilters[field] = value;
						return q;
					},
				};
				filterBuilder(q);
				filters = nextFilters;
				return chain;
			},
			first: async () => firstMatchingRow(tableName, filters, albums, links),
			collect: async () => matchingRows(tableName, filters, albums, links),
			take: async (limit: number) =>
				matchingRows(tableName, filters, albums, links).slice(0, limit),
		};
		return chain;
	}

	const ctx = {
		db: {
			query,
			insert: async (tableName: string, document: Record<string, unknown>) => {
				inserts.push({ tableName, document });
				return `${tableName}_inserted`;
			},
			patch: async (id: string, patch: Record<string, unknown>) => {
				patches.push({ id, patch });
			},
		},
	} as unknown as MutationCtx;

	return { ctx, inserts, patches };
}

function firstMatchingRow(
	tableName: string,
	filters: Record<string, unknown>,
	albums: TestAlbum[],
	links: TestLink[],
): TestAlbum | TestLink | null {
	return matchingRows(tableName, filters, albums, links)[0] ?? null;
}

function matchingRows(
	tableName: string,
	filters: Record<string, unknown>,
	albums: TestAlbum[],
	links: TestLink[],
): Array<TestAlbum | TestLink> {
	const rows = tableName === "spotifyAlbums" ? albums : links;
	return rows.filter((row) =>
		Object.entries(filters).every(
			([field, value]) => row[field as keyof typeof row] === value,
		),
	);
}

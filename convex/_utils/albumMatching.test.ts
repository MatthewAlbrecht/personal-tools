import assert from "node:assert/strict";
import test from "node:test";
import {
	matchForLaterAlbumsForRymScrape,
	matchRymForForLaterAlbum,
	matchRymForSpotifyAlbum,
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

test("albumMatching exports the For Later to RYM matching entry point", () => {
	assert.equal(typeof matchRymForForLaterAlbum, "function");
});

test("albumMatching exports the shared Spotify album RYM matcher", () => {
	assert.equal(typeof matchRymForSpotifyAlbum, "function");
});

test("albumMatching exports the RYM scrape to For Later matching entry point", () => {
	assert.equal(typeof matchForLaterAlbumsForRymScrape, "function");
});

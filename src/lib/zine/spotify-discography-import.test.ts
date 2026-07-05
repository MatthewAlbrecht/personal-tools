import assert from "node:assert/strict";
import test from "node:test";
import {
	type SpotifyDiscographyRelease,
	extractReleaseYear,
	filterDiscographyReleases,
	mapDiscographyReleasesToAlbumUpserts,
	mergeSpotifyDiscographyImport,
} from "./spotify-discography-import";
import type { ZineDiscographyItem } from "./zine-inside-back-sections";

const releases: SpotifyDiscographyRelease[] = [
	{
		spotifyAlbumId: "album-a",
		albumTitle: "Album A",
		artistName: "Artist",
		year: "2020",
		imageUrl: "https://example.com/a.jpg",
		albumType: "album",
		releaseDate: "2020-01-01",
		totalTracks: 10,
	},
	{
		spotifyAlbumId: "album-b",
		albumTitle: "Single B",
		artistName: "Artist",
		year: "2019",
		imageUrl: undefined,
		albumType: "single",
		releaseDate: "2019-01-01",
		totalTracks: 1,
	},
	{
		spotifyAlbumId: "current",
		albumTitle: "Current Album",
		artistName: "Artist",
		year: "2024",
		imageUrl: undefined,
		albumType: "album",
		releaseDate: "2024-01-01",
		totalTracks: 12,
	},
];

test("filterDiscographyReleases drops singles and the source album", () => {
	const filtered = filterDiscographyReleases(releases, "current");
	assert.deepEqual(
		filtered.map((release) => release.spotifyAlbumId),
		["album-a"],
	);
});

test("mergeSpotifyDiscographyImport preserves blurbs and hidden flags", () => {
	const existing: ZineDiscographyItem[] = [
		{
			spotifyAlbumId: "album-a",
			albumTitle: "Old title",
			artistName: "Artist",
			year: "2020",
			imageUrl: "https://example.com/custom.jpg",
			blurb: "My note.",
			hidden: true,
		},
	];

	const merged = mergeSpotifyDiscographyImport(existing, releases, "current");
	const albumA = merged.find((item) => item.spotifyAlbumId === "album-a");

	assert.ok(albumA);
	assert.equal(albumA?.blurb, "My note.");
	assert.equal(albumA?.imageUrl, "https://example.com/custom.jpg");
	assert.equal(albumA?.hidden, true);
	assert.equal(albumA?.albumTitle, "Album A");
});

test("mergeSpotifyDiscographyImport adds new releases with empty blurbs", () => {
	const merged = mergeSpotifyDiscographyImport([], releases, "current");
	const albumA = merged.find((item) => item.spotifyAlbumId === "album-a");

	assert.ok(albumA);
	assert.equal(albumA?.blurb, "");
	assert.equal(albumA?.hidden, undefined);
});

test("mapDiscographyReleasesToAlbumUpserts maps filtered releases", () => {
	const upserts = mapDiscographyReleasesToAlbumUpserts(releases, "current");
	assert.equal(upserts.length, 1);
	assert.deepEqual(upserts[0], {
		spotifyAlbumId: "album-a",
		name: "Album A",
		artistName: "Artist",
		imageUrl: "https://example.com/a.jpg",
		releaseDate: "2020-01-01",
		totalTracks: 10,
	});
});

test("extractReleaseYear uses the year portion of release dates", () => {
	assert.equal(extractReleaseYear("2020-05-11"), "2020");
	assert.equal(extractReleaseYear("1999"), "1999");
});

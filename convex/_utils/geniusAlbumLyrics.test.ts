import assert from "node:assert/strict";
import test from "node:test";
import {
	buildAlbumSongRecordInput,
	buildDisplayAlbum,
	buildDisplaySong,
	filterVisibleCredits,
	hasDisplayLyrics,
	hasRenderableLyrics,
} from "./geniusAlbumLyrics";

const producerCredit = {
	label: "Producer",
	contributors: [{ name: "Flying Lotus" }],
};

const writerCredit = {
	label: "Writers",
	contributors: [{ name: "Niki Randa" }],
};

test("buildAlbumSongRecordInput creates a ready song from scraped page data", () => {
	assert.deepEqual(
		buildAlbumSongRecordInput({
			track: {
				trackNumber: 2,
				title: "Coronus, The Terminator",
				url: "https://genius.com/Flying-lotus-coronus-the-terminator-lyrics",
			},
			scrape: {
				songTitle: "Coronus, The Terminator",
				lyrics: "The days of men are coming to an end",
				about: "A song note",
				credits: [producerCredit],
			},
		}),
		{
			trackNumber: 2,
			songTitle: "Coronus, The Terminator",
			geniusSongUrl:
				"https://genius.com/Flying-lotus-coronus-the-terminator-lyrics",
			lyrics: "The days of men are coming to an end",
			about: "A song note",
			credits: [producerCredit],
			scrapeState: "ready",
			scrapeError: undefined,
		},
	);
});

test("buildAlbumSongRecordInput creates failed placeholder for failed scrape", () => {
	assert.deepEqual(
		buildAlbumSongRecordInput({
			track: {
				trackNumber: 3,
				title: "Instrumental Break",
				url: "https://genius.com/Artist-instrumental-break-lyrics",
			},
			errorMessage: "Failed to fetch song page: 404",
		}),
		{
			trackNumber: 3,
			songTitle: "Instrumental Break",
			geniusSongUrl: "https://genius.com/Artist-instrumental-break-lyrics",
			lyrics: "",
			about: undefined,
			credits: undefined,
			scrapeState: "failed",
			scrapeError: "Failed to fetch song page: 404",
		},
	);
});

test("buildDisplayAlbum prefers overrides", () => {
	assert.deepEqual(
		buildDisplayAlbum({
			albumTitle: "Scraped Album",
			artistName: "Scraped Artist",
			zineCoverImageUrl: "https://example.com/scraped.jpg",
			albumTitleOverride: "Override Album",
			artistNameOverride: "Override Artist",
			frontPageImageUrlOverride: "https://example.com/override.jpg",
			summaryOverride: "Override summary",
		}),
		{
			albumTitle: "Override Album",
			artistName: "Override Artist",
			frontPageImageUrl: "https://example.com/override.jpg",
			summary: "Override summary",
		},
	);
});

test("buildDisplaySong prefers overrides and filters visible credits", () => {
	assert.deepEqual(
		buildDisplaySong({
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			about: "Scraped about",
			credits: [producerCredit, writerCredit],
			songTitleOverride: "Override Title",
			lyricsOverride: "Override lyrics",
			aboutOverride: "Override about",
			durationSecondsOverride: 183,
			hiddenCreditLabels: ["Producer"],
		}),
		{
			songTitle: "Override Title",
			lyrics: "Override lyrics",
			about: "Override about",
			durationSeconds: 183,
			credits: [writerCredit],
		},
	);
});

test("empty text overrides fall back to scraped values", () => {
	assert.deepEqual(
		buildDisplaySong({
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			songTitleOverride: "   ",
			lyricsOverride: "",
		}),
		{
			songTitle: "Scraped Title",
			lyrics: "Scraped lyrics",
			about: undefined,
			durationSeconds: undefined,
			credits: undefined,
		},
	);
});

test("filterVisibleCredits hides selected labels only", () => {
	assert.deepEqual(
		filterVisibleCredits([producerCredit, writerCredit], {
			hiddenCreditLabels: ["Producer"],
		}),
		[writerCredit],
	);
});

test("hasDisplayLyrics identifies empty lyrics", () => {
	assert.equal(hasDisplayLyrics(""), false);
	assert.equal(hasDisplayLyrics("   \n"), false);
	assert.equal(hasDisplayLyrics("A lyric"), true);
});

test("hasRenderableLyrics treats instrumental markers as empty", () => {
	assert.equal(hasRenderableLyrics("[Instrumental]"), false);
	assert.equal(hasRenderableLyrics("[Instrumental Break]"), false);
	assert.equal(
		hasRenderableLyrics("[Verse]\nActual lyric line", {
			showSectionLabels: false,
		}),
		true,
	);
	assert.equal(
		hasRenderableLyrics("[Verse]", { showSectionLabels: false }),
		false,
	);
});

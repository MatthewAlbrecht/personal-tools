import assert from "node:assert/strict";
import test from "node:test";
import {
	ZINE_ALBUM_ART_IN,
	ZINE_CSS_PX_PER_IN,
	ZINE_FOOTER_ZONE_CSS_PX,
	ZINE_FOOTER_ZONE_HEIGHT_PT,
	ZINE_FOOTER_ZONE_IN,
	ZINE_PAGE,
	ZINE_TEXT_CONDENSE,
	type ZineSongLayoutOptions,
	computeLyricsFontSize,
	computeSingleLineFontSize,
	countLyricsLines,
	getSongPageLayout,
	getZineContentBoxPt,
	getZineLyricsMinFontSizePt,
	padZinePageCount,
} from "./zine-layout";

const baseSongHeader = {
	showSectionLabels: true,
	columnCount: 1,
	showAlbumArt: false,
	showMetadata: true,
	hasMetadata: true,
	showUserNote: false,
	showAbout: false,
	showIntro: true,
} satisfies ZineSongLayoutOptions;

test("ZINE_TEXT_CONDENSE slider matches title width 50–100%", () => {
	assert.equal(ZINE_TEXT_CONDENSE.min, 0.5);
	assert.equal(ZINE_TEXT_CONDENSE.max, 1);
	assert.equal(ZINE_TEXT_CONDENSE.default, 1);
});

test("getZineLyricsMinFontSizePt never goes below 6pt and tracks title", () => {
	assert.equal(getZineLyricsMinFontSizePt(7), 6);
	assert.equal(getZineLyricsMinFontSizePt(12), 7.5);
});

test("footer zone matches half album-art height (in, pt, css px)", () => {
	assert.equal(ZINE_FOOTER_ZONE_IN, ZINE_ALBUM_ART_IN / 2);
	assert.equal(ZINE_FOOTER_ZONE_HEIGHT_PT, ZINE_FOOTER_ZONE_IN * 72);
	assert.equal(
		ZINE_FOOTER_ZONE_CSS_PX,
		ZINE_FOOTER_ZONE_IN * ZINE_CSS_PX_PER_IN,
	);
});

test("countLyricsLines counts blank lines and section headers", () => {
	const lyrics = "[Verse 1]\nFirst line\n\nSecond line\n[Chorus]\nHook";

	assert.equal(countLyricsLines(lyrics, true), 6);
	assert.equal(countLyricsLines(lyrics, false), 4);
});

test("computeSingleLineFontSize shrinks long titles but not short ones", () => {
	const short = computeSingleLineFontSize("Go", 300);
	const long = computeSingleLineFontSize(
		"Some Incredibly Long Song Title That Should Not Fit On One Line At Max Size",
		300,
	);

	assert.equal(short, 24);
	assert.ok(long < short);
	assert.ok(long >= 10);
});

test("computeLyricsFontSize shrinks when line count is high", () => {
	const fewLines = computeLyricsFontSize(10, 400);
	const manyLines = computeLyricsFontSize(80, 400);

	assert.ok(fewLines > manyLines);
	assert.ok(manyLines >= 6);
});

test("computeLyricsFontSize fits more text with two columns", () => {
	const singleColumn = computeLyricsFontSize(40, 400, 1);
	const twoColumn = computeLyricsFontSize(40, 400, 2);

	assert.ok(twoColumn >= singleColumn);
});

test("padZinePageCount rounds up to a multiple of four", () => {
	assert.equal(padZinePageCount(1), 4);
	assert.equal(padZinePageCount(4), 4);
	assert.equal(padZinePageCount(5), 8);
	assert.equal(padZinePageCount(9), 12);
});

test("getZineContentBoxPt subtracts margins from page size", () => {
	const box = getZineContentBoxPt();

	assert.equal(box.widthPt, (ZINE_PAGE.widthIn - ZINE_PAGE.marginIn * 2) * 72);
	assert.equal(
		box.heightPt,
		(ZINE_PAGE.heightIn - ZINE_PAGE.marginIn * 2) * 72,
	);
});

test("getSongPageLayout defaults to single-column lyrics estimate", () => {
	const lyrics = "line\n".repeat(80);
	const explicit = getSongPageLayout({
		title: "T",
		lyrics,
		showSectionLabels: true,
		columnCount: 1,
		headerOptions: baseSongHeader,
	});
	const implicit = getSongPageLayout({
		title: "T",
		lyrics,
		showSectionLabels: true,
		headerOptions: baseSongHeader,
	});

	assert.equal(implicit.lyricsFontSizePt, explicit.lyricsFontSizePt);
});

test("getSongPageLayout two-column estimate is at least single-column", () => {
	const lyrics = "line\n".repeat(80);
	const single = getSongPageLayout({
		title: "T",
		lyrics,
		showSectionLabels: true,
		columnCount: 1,
		headerOptions: baseSongHeader,
	});
	const two = getSongPageLayout({
		title: "T",
		lyrics,
		showSectionLabels: true,
		columnCount: 2,
		headerOptions: baseSongHeader,
	});

	assert.ok(two.lyricsFontSizePt >= single.lyricsFontSizePt);
});

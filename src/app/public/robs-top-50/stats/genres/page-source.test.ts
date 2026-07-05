import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
	"src/app/public/robs-top-50/stats/genres/page.tsx",
	"utf8",
);
const navSource = readFileSync(
	"src/app/public/robs-top-50/_components/public-stats-nav.tsx",
	"utf8",
);

test("genres stats page uses published years and genre count query", () => {
	assert.match(pageSource, /api\.robRankings\.listPublishedYears/);
	assert.match(
		pageSource,
		/api\.robRankings\.getPublishedTopLevelGenreCountsForYear/,
	);
	assert.match(
		pageSource,
		/api\.robRankings\.getPublishedTopLevelGenreCountsForAllYears/,
	);
	assert.match(pageSource, /yearParam === "all"/);
	assert.match(pageSource, />\s*All\s*<\/button>/);
	assert.match(pageSource, /new URLSearchParams/);
	assert.match(pageSource, /year: String\(view\)/);
	assert.match(pageSource, /top: String\(topCount\)/);
	assert.match(pageSource, /Slider/);
	assert.match(pageSource, /onValueChange/);
	assert.match(pageSource, /onValueCommit/);
	assert.match(pageSource, /TOP_COUNT_OPTIONS = \[3, 5, 10, 15, 25, 50\]/);
	assert.match(pageSource, /topCount: activeTopCount/);
	assert.match(pageSource, /showAlbumDetails=\{!isAllYears\}/);
	assert.match(pageSource, /TopLevelGenreCountsTable/);
});

test("public stats nav links to genres stats", () => {
	assert.match(navSource, /\/public\/robs-top-50\/stats\/genres/);
	assert.match(navSource, /Genres/);
});

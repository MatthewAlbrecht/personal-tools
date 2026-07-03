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
	assert.match(pageSource, /\?year=/);
	assert.match(pageSource, /TopLevelGenreCountsTable/);
});

test("public stats nav links to genres stats", () => {
	assert.match(navSource, /\/public\/robs-top-50\/stats\/genres/);
	assert.match(navSource, /Genres/);
});

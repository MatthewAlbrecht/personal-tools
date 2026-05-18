import assert from "node:assert/strict";
import test from "node:test";
import type { Doc } from "../_generated/dataModel";
import { scrapeMatchesSearch } from "./unmappedRymScrapes";

function scrapeFixture(
	overrides: Partial<Doc<"rateYourMusicScrapes">> = {},
): Doc<"rateYourMusicScrapes"> {
	return {
		_id: "scrape_1" as Doc<"rateYourMusicScrapes">["_id"],
		_creationTime: 0,
		rymUrl:
			"https://rateyourmusic.com/release/album/big-thief/dragon-new-warm-mountain/",
		releaseKind: "album",
		albumTitle: "Dragon New Warm Mountain I Believe In You",
		artists: [{ name: "Big Thief" }],
		lastScrapedAt: 1,
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

test("scrapeMatchesSearch matches album title case-insensitively", () => {
	const scrape = scrapeFixture();
	assert.equal(scrapeMatchesSearch(scrape, "dragon new"), true);
	assert.equal(scrapeMatchesSearch(scrape, "WARM MOUNTAIN"), true);
});

test("scrapeMatchesSearch matches artist name", () => {
	const scrape = scrapeFixture();
	assert.equal(scrapeMatchesSearch(scrape, "big thief"), true);
});

test("scrapeMatchesSearch returns true for empty search", () => {
	const scrape = scrapeFixture();
	assert.equal(scrapeMatchesSearch(scrape, ""), true);
	assert.equal(scrapeMatchesSearch(scrape, "   "), true);
});

test("scrapeMatchesSearch returns false when term is absent", () => {
	const scrape = scrapeFixture();
	assert.equal(scrapeMatchesSearch(scrape, "radiohead"), false);
});

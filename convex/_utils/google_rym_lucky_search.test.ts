import assert from "node:assert/strict";
import test from "node:test";
import {
	buildGoogleRateYourMusicSearchUrl,
	buildOpenableGoogleRymSearchLinks,
} from "./google_rym_lucky_search";

test("buildGoogleRateYourMusicSearchUrl is plain Google search (no btnI)", () => {
	const url = buildGoogleRateYourMusicSearchUrl({
		artistName: "Suss",
		albumName: "Counting Sunsets",
	});
	assert.ok(url.startsWith("https://www.google.com/search?"));
	const parsed = new URL(url);
	assert.equal(parsed.searchParams.get("btnI"), null);
	assert.match(parsed.searchParams.get("q") ?? "", /Suss/i);
	assert.match(parsed.searchParams.get("q") ?? "", /Counting Sunsets/i);
	assert.match(parsed.searchParams.get("q") ?? "", /rate your music/i);
});

test("buildOpenableGoogleRymSearchLinks respects cap and row order", () => {
	const links = buildOpenableGoogleRymSearchLinks(
		[
			{ id: "a", artistName: "X", name: "One" },
			{ id: "b", artistName: "Y", name: "Two" },
		],
		1,
	);
	assert.equal(links.length, 1);
	assert.equal(links[0]?.id, "a");
	const parsed = new URL(links[0]?.url ?? "");
	assert.equal(parsed.searchParams.get("btnI"), null);
});

test("buildOpenableGoogleRymSearchLinks skips rows that already have rymUrl", () => {
	const links = buildOpenableGoogleRymSearchLinks(
		[
			{
				id: "a",
				artistName: "X",
				name: "One",
				rymUrl: "https://rateyourmusic.com/release/album/x/x",
			},
			{ id: "b", artistName: "Y", name: "Two" },
		],
		5,
	);
	assert.equal(links.length, 1);
	assert.equal(links[0]?.id, "b");
});

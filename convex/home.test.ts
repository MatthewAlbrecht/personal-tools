import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./home.ts", import.meta.url), "utf8");

test("listRecentListens uses take, not unbounded collect", () => {
	assert.match(source, /listRecentListens/);
	const start = source.indexOf("listRecentListens");
	const end = source.indexOf("listNeedsRating");
	const body = source.slice(start, end);
	assert.match(body, /\.take\(/);
	assert.doesNotMatch(body, /\.collect\(\)/);
});

test("listRecentlySavedForLater uses forLaterLastSeenAt index", () => {
	assert.match(source, /by_userId_isActiveForLater_forLaterLastSeenAt/);
});

test("home queries do not use Date.now", () => {
	assert.doesNotMatch(source, /Date\.now\(/);
});

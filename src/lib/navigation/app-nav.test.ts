import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAV_GROUPS, isNavItemActive } from "./app-nav";

test("music group includes Albums, Up Next, Funnel, Lyrics, Playlists, Shows", () => {
	const music = APP_NAV_GROUPS.find((g) => g.id === "music");
	assert.ok(music);
	const labels = music.items.map((i) => i.label);
	assert.deepEqual(labels, [
		"Albums",
		"Up Next",
		"Funnel",
		"Lyrics",
		"Playlists",
		"Shows",
	]);
});

test("More demotes Tracks, Enrichment, Categorize tracks", () => {
	const more = APP_NAV_GROUPS.find((g) => g.id === "more");
	assert.ok(more);
	const labels = more.items.map((i) => i.label);
	assert.ok(labels.includes("Tracks"));
	assert.ok(labels.includes("Enrichment"));
	assert.ok(labels.includes("Categorize tracks"));
	assert.ok(!labels.includes("For Later"));
});

test("Up Next href points at for-later until Phase 2", () => {
	const music = APP_NAV_GROUPS.find((g) => g.id === "music");
	const upNext = music?.items.find((i) => i.id === "up-next");
	assert.equal(upNext?.href, "/for-later-albums");
});

test("isNavItemActive matches nested album routes for Albums", () => {
	const music = APP_NAV_GROUPS.find((g) => g.id === "music");
	const albums = music?.items.find((i) => i.id === "albums");
	assert.ok(albums);
	assert.equal(isNavItemActive("/albums/recent", albums), true);
	assert.equal(isNavItemActive("/for-later-albums", albums), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAV_GROUPS, isNavItemActive } from "./app-nav";

test("My Albums peers are Listens, Rankings, Queue, Library", () => {
	const group = APP_NAV_GROUPS.find((g) => g.id === "my-albums");
	assert.ok(group);
	assert.deepEqual(
		group.items.map((i) => i.label),
		["Listens", "Rankings", "Queue", "Library"],
	);
});

test("Music group is misc tools only", () => {
	const music = APP_NAV_GROUPS.find((g) => g.id === "music");
	assert.ok(music);
	assert.deepEqual(
		music.items.map((i) => i.label),
		["Funnel", "Lyrics", "Playlists"],
	);
});

test("Shows and demotions live under More", () => {
	const more = APP_NAV_GROUPS.find((g) => g.id === "more");
	assert.ok(more);
	const labels = more.items.map((i) => i.label);
	assert.ok(labels.includes("Shows"));
	assert.ok(labels.includes("Tracks"));
	assert.ok(labels.includes("Enrichment"));
	assert.ok(labels.includes("Categorize tracks"));
	assert.ok(labels.includes("Rob's Top 50"));
	assert.ok(!labels.includes("For Later"));
	assert.ok(more.defaultCollapsed);
});

test("album view active states do not bleed across peers", () => {
	const group = APP_NAV_GROUPS.find((g) => g.id === "my-albums");
	assert.ok(group);
	const listens = group.items.find((i) => i.id === "listens");
	const rankings = group.items.find((i) => i.id === "rankings");
	const queue = group.items.find((i) => i.id === "queue");
	const library = group.items.find((i) => i.id === "library");
	assert.ok(listens && rankings && queue && library);

	assert.equal(isNavItemActive("/albums/recent", listens), true);
	assert.equal(isNavItemActive("/albums/rated", listens), false);
	assert.equal(isNavItemActive("/albums/up-next", queue), true);
	assert.equal(isNavItemActive("/albums/library", library), true);
	assert.equal(isNavItemActive("/albums/details/abc", library), true);
	assert.equal(isNavItemActive("/albums/details/abc", listens), false);
});

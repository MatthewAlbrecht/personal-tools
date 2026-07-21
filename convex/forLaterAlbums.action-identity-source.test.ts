import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(...segments: string[]): string {
	return readFileSync(join(process.cwd(), ...segments), "utf8");
}

test("find-RYM-links API accepts album IDs", () => {
	const source = read(
		"src",
		"app",
		"api",
		"for-later-albums",
		"find-rym-links",
		"route.ts",
	);

	assert.match(source, /albumIds/);
	assert.doesNotMatch(source, /forLaterAlbumItemIds/);
	assert.doesNotMatch(source, /Id<"forLaterAlbumItems">/);
});

test("For Later UI keys mutations and optimistic overlays by album ID", () => {
	const rowSource = read(
		"src",
		"app",
		"for-later-albums",
		"_components",
		"for-later-row.tsx",
	);
	const pageSource = read("src", "app", "for-later-albums", "page.tsx");
	const hookSource = read(
		"src",
		"lib",
		"hooks",
		"use-for-later-rym-associate-drawer.ts",
	);

	assert.doesNotMatch(rowSource, /albumItemId/);
	assert.doesNotMatch(rowSource, /setForLaterAlbumMarkedAsSingle/);
	assert.match(rowSource, /albumId: row\.albumId/);
	assert.match(pageSource, /overlays\.get\(row\.albumId\)/);
	assert.doesNotMatch(pageSource, /albumItemId/);
	assert.match(hookSource, /albumId/);
	assert.doesNotMatch(hookSource, /albumItemId/);
});

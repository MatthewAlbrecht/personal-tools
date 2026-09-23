import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "folioSocietyReleases.ts"),
	"utf8",
);

const syncHandler = source.match(
	/export const syncReleases = action\(\{[\s\S]*?\n\}\);/,
)?.[0];

test("sync uses verbosity=3", () => {
	assert.match(source, /verbosity=3/);
});

test("sync does not schedule public enrichDetails", () => {
	assert.doesNotMatch(source, /api\.folioSocietyDetails\.enrichDetails/);
});

test("sync chunks ids at 50", () => {
	assert.match(source, /ids\.length <= 50|50/);
});

test("sync applies catalog fields after write", () => {
	assert.match(source, /applyCatalogFields/);
});

test("catalog fields forward Folio bundle product type", () => {
	assert.match(source, /const productType = product\.type_id/);
	assert.match(
		source,
		/typeof productType === "string" \? \{ productType \} : \{\}/,
	);
});

test("sync action does not call getAllReleases", () => {
	assert.ok(syncHandler);
	assert.doesNotMatch(syncHandler, /getAllReleases/);
});

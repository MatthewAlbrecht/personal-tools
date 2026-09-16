import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "folioSocietyCatalog.ts"),
	"utf8",
);

test("FOLIO_OWNER_USER_ID is folio-owner", () => {
	assert.match(source, /export const FOLIO_OWNER_USER_ID = "folio-owner"/);
});

test("applyCatalogFields is an internalMutation", () => {
	assert.match(source, /export const applyCatalogFields = internalMutation/);
	assert.match(source, /returns:\s*v\.null\(\)/);
});

test("does not collect folioSocietyImages", () => {
	assert.doesNotMatch(
		source,
		/query\("folioSocietyImages"\)[\s\S]*\.collect\(\)/,
	);
});

test("family join uses by_titleKey and skips when makeTitleKey has no pipe", () => {
	assert.match(source, /makeTitleKey/);
	assert.match(source, /\.withIndex\("by_titleKey"/);
	assert.match(source, /titleKey\.includes\("\|"\)/);
});

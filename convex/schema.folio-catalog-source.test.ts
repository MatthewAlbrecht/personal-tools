import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const schema = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");

test("folioSocietyReleases has catalog indexes and searchIndex", () => {
	assert.match(schema, /\.index\("by_titleKey", \["titleKey"\]\)/);
	assert.match(schema, /\.index\("by_isActive_isBundle_seasonSortKey", \[/);
	assert.match(schema, /\.index\("by_isActive_edition_seasonSortKey", \[/);
	assert.match(
		schema,
		/\.index\("by_isActive_catalogLaunchTime", \["isActive", "catalogLaunchTime"\]\)/,
	);
	assert.match(schema, /searchIndex\("search_title_author", \{/);
	assert.match(schema, /searchField:\s*"searchText"/);
	assert.match(schema, /filterFields:\s*\["isActive", "edition", "isBundle"\]/);
});

test("folioSocietyOwnership table exists with user indexes", () => {
	assert.match(schema, /folioSocietyOwnership:\s*defineTable\(/);
	assert.match(
		schema,
		/\.index\("by_user_product", \["userId", "productId"\]\)/,
	);
	assert.match(schema, /\.index\("by_user_status", \["userId", "status"\]\)/);
	assert.match(schema, /v\.literal\("owned"\)/);
	assert.match(schema, /v\.literal\("want"\)/);
});

test("folioSocietyConfig has optional backfill fields", () => {
	assert.match(
		schema,
		/backfillCursorExternalId:\s*v\.optional\(v\.number\(\)\)/,
	);
	assert.match(
		schema,
		/backfillCursor:\s*v\.optional\(v\.union\(v\.string\(\), v\.null\(\)\)\)/,
	);
	assert.match(
		schema,
		/backfillProcessedCount:\s*v\.optional\(v\.number\(\)\)/,
	);
	assert.match(schema, /backfillStatus:\s*v\.optional\(v\.string\(\)\)/);
});

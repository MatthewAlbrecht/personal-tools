import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(process.cwd(), "convex", "folioSocietyBackfill.ts"),
	"utf8",
);

test("scheduler never calls api.", () => {
	assert.doesNotMatch(source, /scheduler\.runAfter\([^)]*api\./);
});

test("fetches verbosity=3", () => {
	assert.match(source, /verbosity=3/);
});

test("batch size is at most 50 stored releases", () => {
	assert.match(source, /numItems:\s*50|BATCH_SIZE\s*=\s*50/);
});

test("schedules internal.folioSocietyBackfill.runBatch", () => {
	assert.match(source, /internal\.folioSocietyBackfill\.runBatch/);
});

test("does not call getAllReleases or getAllDetails", () => {
	assert.doesNotMatch(source, /getAllReleases/);
	assert.doesNotMatch(source, /getAllDetails/);
});

test("backfill paginates folioSocietyReleases instead of startId/endId range", () => {
	assert.match(source, /query\("folioSocietyReleases"\)[\s\S]*\.paginate\(/);
	assert.doesNotMatch(source, /for \(let id = firstId; id <= lastId; id\+\+\)/);
	assert.doesNotMatch(source, /cursor \+ 25/);
	assert.match(source, /startStoredCatalogBackfill|startFolioCatalogBackfill/);
});

test("persists string pagination cursor and processed count", () => {
	assert.match(source, /backfillCursor:/);
	assert.match(source, /backfillProcessedCount:/);
});

test("does not deactivate or delete releases when Folio omits a product", () => {
	assert.doesNotMatch(source, /isActive:\s*false/);
	assert.doesNotMatch(source, /\.delete\(/);
});

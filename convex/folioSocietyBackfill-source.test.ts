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

test("batch size is 25", () => {
	assert.match(source, /cursor \+ 25|25/);
});

test("schedules internal.folioSocietyBackfill.runBatch", () => {
	assert.match(source, /internal\.folioSocietyBackfill\.runBatch/);
});

test("does not call getAllReleases or getAllDetails", () => {
	assert.doesNotMatch(source, /getAllReleases/);
	assert.doesNotMatch(source, /getAllDetails/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
	new URL("./rankingSnapshots.ts", import.meta.url),
	"utf8",
);

function exportBody(exportName: string, nextExport?: string): string {
	const start = source.indexOf(`export const ${exportName}`);
	assert.ok(start >= 0, `expected export const ${exportName}`);
	const end =
		nextExport !== undefined
			? source.indexOf(`export const ${nextExport}`, start + 1)
			: source.length;
	assert.ok(end > start, `expected end after ${exportName}`);
	return source.slice(start, end);
}

test("captureUserWeek always writes via captureYearForUser", () => {
	const body = exportBody("captureUserWeek", "seedUserWeek");
	assert.match(body, /captureYearForUser/);
	assert.doesNotMatch(source, /status === "complete"/);
	assert.doesNotMatch(source, /return "skipped"/);
});

test("orchestrateSunday fans out via scheduler per user", () => {
	const body = exportBody("orchestrateSunday", "captureUserWeek");
	assert.match(body, /ctx\.scheduler\.runAfter\(/);
	assert.match(body, /internal\.rankingSnapshots\.captureUserWeek/);
	assert.match(body, /previousSundayUtcMs/);
});

test("getCompleteWeek has no Date.now", () => {
	const body = exportBody("getCompleteWeek");
	assert.doesNotMatch(body, /Date\.now\(/);
	assert.match(body, /status !== "complete"/);
});

test("capture writes full ranked year and uses pending|complete status", () => {
	assert.doesNotMatch(source, /const TOP_N = 65/);
	assert.doesNotMatch(source, /\.slice\(0, TOP_N\)/);
	assert.match(source, /\[\.\.\.args\.albums\]\.sort\(compareManualRank\)/);
	assert.match(source, /v\.literal\("pending"\)/);
	assert.match(source, /v\.literal\("complete"\)/);
	assert.match(source, /status: "pending"/);
	assert.match(source, /status: "complete"/);
});

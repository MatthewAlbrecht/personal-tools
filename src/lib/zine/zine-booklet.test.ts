import assert from "node:assert/strict";
import test from "node:test";
import { buildBookletSheets } from "./zine-booklet";
import type { ZinePage } from "./zine-pages";

function blankPages(count: number): ZinePage[] {
	return Array.from({ length: count }, () => ({ kind: "blank" }) as ZinePage);
}

test("buildBookletSheets throws when page count is not a multiple of 4", () => {
	assert.throws(() => buildBookletSheets(blankPages(3)), /divisible by 4/);
	assert.throws(() => buildBookletSheets([]), /divisible by 4/);
});

/** 1-based page numbers shown on a spread (human saddle-stitch order). */
function oneBasedPair(leftIndex: number, rightIndex: number): string {
	return `${leftIndex + 1}|${rightIndex + 1}`;
}

test("buildBookletSheets: 4 pages — one sheet, outer wrap", () => {
	const sheets = buildBookletSheets(blankPages(4));
	assert.equal(sheets.length, 1);
	const outer = sheets[0];
	assert.ok(outer);
	assert.equal(
		oneBasedPair(outer.front.leftIndex, outer.front.rightIndex),
		"4|1",
	);
	assert.equal(
		oneBasedPair(outer.back.leftIndex, outer.back.rightIndex),
		"2|3",
	);
});

test("buildBookletSheets: 8 pages matches reference spreads", () => {
	const sheets = buildBookletSheets(blankPages(8));
	assert.equal(sheets.length, 2);
	const outer = sheets[0];
	const inner = sheets[1];
	assert.ok(outer);
	assert.ok(inner);
	assert.equal(
		oneBasedPair(outer.front.leftIndex, outer.front.rightIndex),
		"8|1",
	);
	assert.equal(
		oneBasedPair(outer.back.leftIndex, outer.back.rightIndex),
		"2|7",
	);
	assert.equal(
		oneBasedPair(inner.front.leftIndex, inner.front.rightIndex),
		"6|3",
	);
	assert.equal(
		oneBasedPair(inner.back.leftIndex, inner.back.rightIndex),
		"4|5",
	);
});

test("buildBookletSheets: 12 pages — three sheets", () => {
	const sheets = buildBookletSheets(blankPages(12));
	assert.equal(sheets.length, 3);
	const a = sheets[0];
	const b = sheets[1];
	const c = sheets[2];
	assert.ok(a);
	assert.ok(b);
	assert.ok(c);
	assert.equal(oneBasedPair(a.front.leftIndex, a.front.rightIndex), "12|1");
	assert.equal(oneBasedPair(a.back.leftIndex, a.back.rightIndex), "2|11");
	assert.equal(oneBasedPair(b.front.leftIndex, b.front.rightIndex), "10|3");
	assert.equal(oneBasedPair(b.back.leftIndex, b.back.rightIndex), "4|9");
	assert.equal(oneBasedPair(c.front.leftIndex, c.front.rightIndex), "8|5");
	assert.equal(oneBasedPair(c.back.leftIndex, c.back.rightIndex), "6|7");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
	"src/app/albums/_components/album-rym-associate-drawer.tsx",
	"utf8",
);

test("RYM associate drawer can include already linked scrapes from empty state", () => {
	assert.match(source, /const \[includeMapped, setIncludeMapped\]/);
	assert.match(source, /includeMapped, limit: 50/);
	assert.match(source, /Search already linked albums too\./);
	assert.match(source, /setIncludeMapped\(true\)/);
});

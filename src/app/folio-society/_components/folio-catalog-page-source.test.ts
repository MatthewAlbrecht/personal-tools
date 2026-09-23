import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
	join(
		process.cwd(),
		"src",
		"app",
		"folio-society",
		"_components",
		"folio-catalog-page.tsx",
	),
	"utf8",
);

test("header shows totalCount books from the latest page", () => {
	assert.match(source, /totalCount/);
	assert.match(source, /\{(?:page\?\.totalCount|totalCount)\} books/);
	assert.doesNotMatch(
		source,
		/const bookCount = seasons\.reduce\([\s\S]*?\{bookCount\} books/,
	);
});

test("page accumulation guards on page.pageKey matching the requested cursor", () => {
	assert.match(source, /page\.pageKey/);
	assert.match(
		source,
		/page\.pageKey\s*!==\s*(?:expectedKey|key|requestedKey)/,
	);
	assert.match(source, /cursor\?\.beforeSeasonSortKey\s*\?\?\s*"first"/);
	assert.match(source, /appliedCursorRef\.current === /);
});

test("keeps pageSizeSeasons at 1", () => {
	assert.match(source, /pageSizeSeasons:\s*1/);
});

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
		"folio-book-card.tsx",
	),
	"utf8",
);

test("ownership controls communicate interactivity", () => {
	assert.match(source, /cursor-pointer/);
});

test("want control uses a book or library icon", () => {
	assert.match(source, /BookOpen|Library/);
	assert.doesNotMatch(source, /<Bookmark/);
});

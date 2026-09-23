import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const componentsDir = join(
	process.cwd(),
	"src",
	"app",
	"folio-society",
	"_components",
);

const cardSource = readFileSync(
	join(componentsDir, "folio-book-card.tsx"),
	"utf8",
);

const seasonSource = readFileSync(
	join(componentsDir, "folio-season-section.tsx"),
	"utf8",
);

test("ownership controls communicate interactivity", () => {
	assert.match(cardSource, /cursor-pointer/);
});

test("want control uses a book or library icon", () => {
	assert.match(cardSource, /BookOpen|Library/);
	assert.doesNotMatch(cardSource, /<Bookmark/);
});

test("card trigger is block-level without flex height tricks", () => {
	assert.match(cardSource, /className="[^"]*\bblock(?:\s+w-full)?\b/);
	assert.doesNotMatch(
		cardSource,
		/className="[^"]*\bh-full w-full cursor-pointer/,
	);
});

test("cover does not translate on hover", () => {
	assert.doesNotMatch(cardSource, /group-hover:-translate-y/);
	assert.doesNotMatch(cardSource, /-translate-y-0\.5/);
});

test("caption does not reserve control space with pr-9", () => {
	assert.doesNotMatch(cardSource, /\bpr-9\b/);
});

test("caption reserves author, title, and metadata rows", () => {
	assert.match(cardSource, /min-h-|grid-rows-|grid-template-rows|line-clamp-2/);
	assert.match(cardSource, /authorName/);
});

test("real and skeleton grids share FOLIO_GRID_CLASS", () => {
	assert.match(cardSource + seasonSource, /export const FOLIO_GRID_CLASS\s*=/);
	assert.match(seasonSource, /FOLIO_GRID_CLASS/);
	const gridUsages = seasonSource.match(/FOLIO_GRID_CLASS/g) ?? [];
	assert.ok(
		gridUsages.length >= 2,
		"expected FOLIO_GRID_CLASS on both live grid and skeleton",
	);
});

test("season section does not guess grid columns in JavaScript", () => {
	assert.doesNotMatch(seasonSource, /useGridColumnCount/);
	assert.doesNotMatch(seasonSource, /matchMedia/);
	assert.doesNotMatch(seasonSource, /rowEndIndex/);
});

test("season section renders detail outside the card grid", () => {
	assert.doesNotMatch(seasonSource, /\.flatMap\(/);
	assert.match(seasonSource, /FolioBookDetail/);
	assert.match(seasonSource, /openProductId/);
});

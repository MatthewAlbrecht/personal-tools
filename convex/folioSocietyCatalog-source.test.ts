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

test("listCatalogPage does not collect folioSocietyReleases", () => {
	assert.match(source, /export const listCatalogPage = query/);
	assert.doesNotMatch(
		source,
		/query\("folioSocietyReleases"\)[\s\S]{0,300}\.collect\(\)/,
	);
});

test("owned or want queries folioSocietyOwnership by_user_status first", () => {
	assert.match(source, /folioSocietyOwnership/);
	assert.match(source, /\.withIndex\("by_user_status"/);
});

test("listCatalogPage takes now as an arg and queries do not use Date.now", () => {
	assert.match(source, /now:\s*v\.number\(\)/);
	const withoutSetOwnership = source.replace(
		/export const setOwnership = mutation\(\{[\s\S]*?\n\}\);/,
		"",
	);
	assert.doesNotMatch(withoutSetOwnership, /Date\.now\(/);
	assert.match(
		source,
		/export const setOwnership = mutation\([\s\S]*Date\.now\(/,
	);
});

test("setOwnership does not take userId", () => {
	const argsBlock = source.match(
		/export const setOwnership = mutation\(\{[\s\S]*?args:\s*\{([\s\S]*?)\},/,
	)?.[1];
	assert.ok(argsBlock);
	assert.doesNotMatch(argsBlock, /userId/);
	assert.match(argsBlock, /productId/);
	assert.match(argsBlock, /literal\("owned"\)/);
	assert.match(argsBlock, /literal\("want"\)/);
});

test("public catalog functions declare returns validators", () => {
	assert.match(
		source,
		/export const listCatalogPage = query\(\{[\s\S]*?returns:/,
	);
	assert.match(
		source,
		/export const getFamilyByTitleKey = query\(\{[\s\S]*?returns:/,
	);
	assert.match(
		source,
		/export const getFamilyByTitleKey = query\(\{[\s\S]*?owned:\s*v\.boolean\(\)[\s\S]*?want:\s*v\.boolean\(\)/,
	);
	assert.match(
		source,
		/export const getFamilyByTitleKey = query\(\{[\s\S]*?loadOwnershipForProducts/,
	);
	assert.match(
		source,
		/export const setOwnership = mutation\(\{[\s\S]*?returns:\s*v\.null\(\)/,
	);
});

test("search uses search_title_author and caps at 64", () => {
	assert.match(source, /withSearchIndex\("search_title_author"/);
	assert.match(source, /SEARCH_CAP = 64/);
	assert.match(source, /\.take\(SEARCH_CAP\)/);
});

test("listCatalogPage uses custom beforeSeasonSortKey cursor", () => {
	assert.match(source, /beforeSeasonSortKey:\s*v\.string\(\)/);
});

test("seasonLabelFromKeys uses seasonSortKey for December winter year+1", async () => {
	const { seasonLabelFromKeys } = await import("./folioSocietyCatalog.js");
	assert.equal(seasonLabelFromKeys("2026-winter", "2026-12"), "Winter 2027");
	assert.equal(seasonLabelFromKeys("2026-winter", "2026-01"), "Winter 2026");
	assert.equal(seasonLabelFromKeys("2026-winter", "2026-02"), "Winter 2026");
	assert.equal(seasonLabelFromKeys("2026-spring", "2026-03"), "Spring 2026");
	assert.equal(seasonLabelFromKeys("2026-fall", "2026-09"), "Fall 2026");
	assert.equal(seasonLabelFromKeys("undated", "0000-00"), "Undated");
});

function mockSeason(seasonSortKey: string) {
	return {
		seasonKey: seasonSortKey,
		seasonSortKey,
		label: seasonSortKey,
		cards: [],
	};
}

test("pageCompleteSeasons empty page is done with null cursor", async () => {
	const { pageCompleteSeasons } = await import("./folioSocietyCatalog.js");
	const result = pageCompleteSeasons([], undefined, 1, false);
	assert.equal(result.isDone, true);
	assert.equal(result.continueCursor, null);
	assert.deepEqual(result.seasons, []);
});

test("omitCappedTailSeason drops oldest season when hit cap", async () => {
	const { omitCappedTailSeason } = await import("./folioSocietyCatalog.js");
	const seasons = [mockSeason("2026-06"), mockSeason("2026-03")];
	const trimmed = omitCappedTailSeason(seasons, true);
	assert.equal(trimmed.length, 1);
	assert.equal(trimmed[0]?.seasonSortKey, "2026-06");
});

test("omitCappedTailSeason keeps sole season when hit cap", async () => {
	const { omitCappedTailSeason } = await import("./folioSocietyCatalog.js");
	const seasons = [mockSeason("2026-06")];
	const trimmed = omitCappedTailSeason(seasons, true);
	assert.equal(trimmed.length, 1);
	assert.equal(trimmed[0]?.seasonSortKey, "2026-06");
});

test("comingPathExhausted requires all takes below cap", async () => {
	const { comingPathExhausted } = await import("./folioSocietyCatalog.js");
	assert.equal(
		comingPathExhausted({
			upcoming: 199,
			undatedFalse: 199,
			undatedTrue: 0,
			bundles: false,
		}),
		true,
	);
	assert.equal(
		comingPathExhausted({
			upcoming: 200,
			undatedFalse: 199,
			undatedTrue: 0,
			bundles: false,
		}),
		false,
	);
	assert.equal(
		comingPathExhausted({
			upcoming: 199,
			undatedFalse: 200,
			undatedTrue: 0,
			bundles: false,
		}),
		false,
	);
	assert.equal(
		comingPathExhausted({
			upcoming: 199,
			undatedFalse: 199,
			undatedTrue: 200,
			bundles: true,
		}),
		false,
	);
	assert.equal(
		comingPathExhausted({
			upcoming: 199,
			undatedFalse: 199,
			undatedTrue: 200,
			bundles: false,
		}),
		true,
	);
});

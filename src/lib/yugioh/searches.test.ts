import { describe, expect, test } from "vitest";
import {
	buildDeckSearches,
	ebaySearchSetCodes,
	exclusionWord,
} from "./searches";

describe("exclusionWord", () => {
	test.each([
		["Super Rare", "super"],
		["Ultra Rare", "ultra"],
		["Secret Rare", "secret"],
		["Starlight Rare", "starlight"],
		["Collector's Rare", "collector"],
		["Quarter Century Secret Rare", "quarter"],
		["Prismatic Secret Rare", "prismatic"],
		["Platinum Secret Rare", "platinum"],
		["Common", "common"],
	])("%s → -%s", (rarity, word) => {
		expect(exclusionWord(rarity)).toBe(word);
	});
});

describe("only Cards still missing copies are searched", () => {
	test("a Card with every copy owned gets no Search; one still missing copies does", () => {
		const searches = buildDeckSearches([
			{
				cardName: "Judgment Dragon",
				copiesNeeded: 3,
				copiesOwned: 3,
				chosenPrintingId: null,
				candidates: [
					{
						printingId: "p-owned",
						setCode: "LODT-EN026",
						rarity: "Secret Rare",
						overloadedRarities: [],
					},
				],
			},
			{
				cardName: "D.D. Crow",
				copiesNeeded: 3,
				copiesOwned: 1,
				chosenPrintingId: null,
				candidates: [
					{
						printingId: "p-missing",
						setCode: "STON-EN024",
						rarity: "Ultimate Rare",
						overloadedRarities: [],
					},
				],
			},
		]);

		const setCodes = searches.flatMap((search) => search.setCodes);
		expect(setCodes).toContain("STON-EN024");
		expect(setCodes).not.toContain("LODT-EN026");
	});
});

describe("ebaySearchSetCodes", () => {
	test("reads back the set codes of a Search's Newly Listed and Sold pages", () => {
		const [search] = buildDeckSearches([
			{
				cardName: "Ash Blossom & Joyous Spring",
				copiesNeeded: 3,
				copiesOwned: 0,
				chosenPrintingId: null,
				candidates: [
					{
						printingId: "p1",
						setCode: "RA01-EN008",
						rarity: "Quarter Century Secret Rare",
						overloadedRarities: ["Super Rare", "Ultra Rare"],
					},
					{
						printingId: "p2",
						setCode: "MP21-EN021",
						rarity: "Quarter Century Secret Rare",
						overloadedRarities: ["Super Rare", "Ultra Rare"],
					},
				],
			},
		]);
		if (!search) throw new Error("no Search");

		expect(ebaySearchSetCodes(search.newlyListedUrl)).toEqual([
			"MP21-EN021",
			"RA01-EN008",
		]);
		expect(ebaySearchSetCodes(search.soldUrl)).toEqual([
			"MP21-EN021",
			"RA01-EN008",
		]);
	});

	test("one set code, typed in lower case", () => {
		expect(
			ebaySearchSetCodes(
				"https://www.ebay.com/sch/i.html?_nkw=ra01-en008+-super&_sop=10",
			),
		).toEqual(["RA01-EN008"]);
	});

	test("a Search with no set code, or not a URL, has none", () => {
		expect(
			ebaySearchSetCodes(
				"https://www.ebay.com/sch/i.html?_nkw=ash+blossom&_sop=10",
			),
		).toEqual([]);
		expect(ebaySearchSetCodes("not a url")).toEqual([]);
	});
});

describe("a Search's keywords", () => {
	test("are the eBay query its Newly Listed and Sold pages run", () => {
		const [search] = buildDeckSearches([
			{
				cardName: "Ash Blossom & Joyous Spring",
				copiesNeeded: 3,
				copiesOwned: 0,
				chosenPrintingId: null,
				candidates: [
					{
						printingId: "p1",
						setCode: "RA01-EN008",
						rarity: "Quarter Century Secret Rare",
						overloadedRarities: ["Super Rare", "Ultra Rare"],
					},
					{
						printingId: "p2",
						setCode: "MP21-EN021",
						rarity: "Quarter Century Secret Rare",
						overloadedRarities: ["Super Rare", "Ultra Rare"],
					},
				],
			},
		]);
		if (!search) throw new Error("no Search");

		expect(search.keywords).toBe("(MP21-EN021,RA01-EN008) -super -ultra");
		for (const url of [search.newlyListedUrl, search.soldUrl]) {
			expect(new URL(url).searchParams.get("_nkw")).toBe(search.keywords);
		}
	});
});

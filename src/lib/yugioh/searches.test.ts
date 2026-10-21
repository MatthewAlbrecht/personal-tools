import { describe, expect, test } from "vitest";
import { buildDeckSearches, exclusionWord } from "./searches";

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

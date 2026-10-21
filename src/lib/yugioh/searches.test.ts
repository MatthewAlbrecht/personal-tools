import { describe, expect, test } from "vitest";
import { exclusionWord } from "./searches";

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

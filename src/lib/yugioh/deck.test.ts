import { describe, expect, test } from "vitest";
import {
	moveToIndex,
	normalizeOverloadedRarities,
	normalizeRarity,
	normalizeSetCode,
	rarityAbbreviation,
	rarityMatchesQuery,
	suggestRarities,
} from "./deck";

describe("Printing normalization", () => {
	test("title-cases a word that starts with a bracket", () => {
		expect(normalizeRarity("ultra rare (pharaoh's rare)")).toBe(
			"Ultra Rare (Pharaoh's Rare)",
		);
		expect(normalizeRarity("Ultra Rare (Pharaoh's Rare)")).toBe(
			"Ultra Rare (Pharaoh's Rare)",
		);
	});

	test("set codes are trimmed and uppercased", () => {
		expect(normalizeSetCode("  ra01-en008 ")).toBe("RA01-EN008");
	});

	test("known rarities resolve from any casing or their abbreviation", () => {
		expect(normalizeRarity("quarter  century secret rare")).toBe(
			"Quarter Century Secret Rare",
		);
		expect(normalizeRarity("QCSR")).toBe("Quarter Century Secret Rare");
		expect(normalizeRarity("Platinum Secret Rare")).toBe(
			"Platinum Secret Rare",
		);
	});

	test("unknown rarities are title-cased so casing can't split a Printing", () => {
		expect(normalizeRarity("platinum  secret rare")).toBe(
			"Platinum Secret Rare",
		);
		expect(normalizeRarity("PREMIUM GOLD RARE")).toBe("Premium Gold Rare");
	});

	test("Overloaded rarities drop duplicates and the Printing's own rarity", () => {
		expect(
			normalizeOverloadedRarities(
				["super rare", "Super Rare", "QCSR", " ", "Ultra Rare"],
				"Quarter Century Secret Rare",
			),
		).toEqual(["Super Rare", "Ultra Rare"]);
	});

	test("rarity abbreviations fall back to the full name", () => {
		expect(rarityAbbreviation("Starlight Rare")).toBe("StR");
		expect(rarityAbbreviation("Platinum Secret Rare")).toBe(
			"Platinum Secret Rare",
		);
	});
});

describe("rarity suggestions", () => {
	test("match by any part of the name or the start of the abbreviation", () => {
		expect(rarityMatchesQuery("Quarter Century Secret Rare", "qc")).toBe(true);
		expect(rarityMatchesQuery("Quarter Century Secret Rare", "century")).toBe(
			true,
		);
		expect(rarityMatchesQuery("Starlight Rare", "str")).toBe(true);
		expect(rarityMatchesQuery("Super Rare", "qc")).toBe(false);
		expect(rarityMatchesQuery("Super Rare", "  ")).toBe(true);
	});
});

describe("ranked rarity suggestions", () => {
	test("an exact abbreviation comes first, then name prefixes, then the rest", () => {
		expect(suggestRarities("ur")[0]).toBe("Ultra Rare");
		expect(suggestRarities("sec").slice(0, 1)).toEqual(["Secret Rare"]);
		expect(suggestRarities("qc")).toEqual(["Quarter Century Secret Rare"]);
	});

	test("with no query, every known rarity in prize order", () => {
		expect(suggestRarities("")[0]).toBe("Quarter Century Secret Rare");
		expect(suggestRarities("")).toHaveLength(11);
	});

	test("extra rarities are suggested too", () => {
		expect(suggestRarities("plat", ["Platinum Secret Rare"])).toEqual([
			"Platinum Secret Rare",
		]);
	});
});

describe("moveToIndex", () => {
	const cards = [{ _id: "a" }, { _id: "b" }, { _id: "c" }, { _id: "d" }];

	test("moves a Card down or up to the given index", () => {
		expect(moveToIndex(cards, "a", 2).map((c) => c._id)).toEqual([
			"b",
			"c",
			"a",
			"d",
		]);
		expect(moveToIndex(cards, "d", 1).map((c) => c._id)).toEqual([
			"a",
			"d",
			"b",
			"c",
		]);
	});

	test("clamps to the ends and leaves the list alone for an unknown Card", () => {
		expect(moveToIndex(cards, "b", 9).map((c) => c._id)).toEqual([
			"a",
			"c",
			"d",
			"b",
		]);
		expect(moveToIndex(cards, "c", -1).map((c) => c._id)).toEqual([
			"c",
			"a",
			"b",
			"d",
		]);
		expect(moveToIndex(cards, "x", 0)).toEqual(cards);
	});
});

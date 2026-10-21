import { describe, expect, test } from "vitest";
import {
	type Search,
	type SearchableCard,
	buildDeckSearches,
	ebayNewlyListedUrl,
	ebaySearchSetCodes,
	ebaySoldUrl,
	exclusionWord,
	neededPrintingIds,
	rarityTerms,
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

describe("rarityTerms", () => {
	test.each([
		["Ultimate Rare", ["ultimate", "utr"]],
		["Secret Rare", ["secret", "scr"]],
		["Ultra Rare", ["ultra", "ur"]],
		["Super Rare", ["super", "sr"]],
		["Ghost Rare", ["ghost", "gr"]],
		["Starlight Rare", ["starlight", "str"]],
		["Collector's Rare", ["collector", "cr"]],
		// Not "25th": RA01–RA04 Super, Ultra and Secret Rares say "25th
		// Anniversary" too, and a wanted QCSR can't leave out -secret.
		["Quarter Century Secret Rare", ["quarter", "qcsr", "qcscr"]],
	])("%s → %j", (rarity, terms) => {
		expect(rarityTerms(rarity)).toEqual(terms);
	});

	test.each([
		"Rare",
		"Common",
		"Ultra Rare (Pharaoh's Rare)",
		"Duel Terminal Ultra Parallel Rare",
	])("%s has none: no word of its own, or not a known rarity", (rarity) => {
		expect(rarityTerms(rarity)).toEqual([]);
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

	test("reads past the required rarity and the Exclusions", () => {
		expect(
			ebaySearchSetCodes(
				ebayNewlyListedUrl("(STON-EN024,TDGS-EN041) (ultimate,utr) -ultra"),
			),
		).toEqual(["STON-EN024", "TDGS-EN041"]);
		expect(
			ebaySearchSetCodes(ebaySoldUrl("RA01-EN008 (quarter,qcsr,qcscr) -super")),
		).toEqual(["RA01-EN008"]);
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

		expect(search.keywords).toBe(
			"(MP21-EN021,RA01-EN008) (quarter,qcsr,qcscr) -super -ultra",
		);
		for (const url of [search.newlyListedUrl, search.soldUrl]) {
			expect(new URL(url).searchParams.get("_nkw")).toBe(search.keywords);
		}
	});
});

/** A Card missing a copy, searching one Printing. */
function wanting(
	cardName: string,
	setCode: string,
	rarity: string,
	overloadedRarities: string[] = [],
): SearchableCard {
	return {
		cardName,
		copiesNeeded: 1,
		copiesOwned: 0,
		chosenPrintingId: null,
		candidates: [{ printingId: setCode, setCode, rarity, overloadedRarities }],
	};
}

// The Chaos Lightsworn Deck behind Matt's screenshot of Searches 3–8: one
// Search per identical Exclusion set took 6 Searches for these 20 set codes.
const chaosLightsworn: SearchableCard[] = [
	wanting("Ally of Justice Catastor", "OP16-EN001", "Ultimate Rare"),
	wanting("Dark Armed Dragon", "PTDN-EN019", "Secret Rare"),
	wanting("D.D. Crow", "STON-EN024", "Ultimate Rare", ["Rare"]),
	wanting("The Transmigration Prophecy", "STON-EN054", "Ultimate Rare", [
		"Rare",
	]),
	wanting("Breaker the Magical Warrior", "TP7-EN005", "Super Rare"),
	wanting("Foolish Burial", "TU02-EN004", "Super Rare"),
	wanting("My Body as a Shield", "TU02-EN007", "Rare"),
	wanting("Caius the Shadow Monarch", "TU03-EN000", "Ultimate Rare"),
	wanting("Tragoedia", "TU04-EN000", "Ultimate Rare"),
	wanting("Colossal Fighter", "TU05-EN000", "Ultimate Rare"),
	wanting("Dark Armed Dragon", "TU06-EN000", "Ultimate Rare"),
	wanting("Ally of Justice Catastor", "TU07-EN000", "Ultimate Rare"),
	{
		cardName: "Gold Sarcophagus",
		copiesNeeded: 1,
		copiesOwned: 0,
		chosenPrintingId: "ultra",
		candidates: [
			{
				printingId: "ultra",
				setCode: "MAMA-EN110",
				rarity: "Ultra Rare (Pharaoh's Rare)",
				overloadedRarities: ["Secret Rare (Pharaoh's Rare)"],
			},
			{
				printingId: "secret",
				setCode: "MAMA-EN110",
				rarity: "Secret Rare (Pharaoh's Rare)",
				overloadedRarities: ["Ultra Rare (Pharaoh's Rare)"],
			},
		],
	},
	wanting("Crush Card Virus", "CRV-EN015", "Ultimate Rare", ["Super Rare"]),
	wanting("Pot of Avarice", "EEN-EN037", "Ultimate Rare", ["Super Rare"]),
	wanting("Monster Reincarnation", "RDS-EN045", "Ultimate Rare", [
		"Super Rare",
	]),
	wanting("Allure of Darkness", "PTDN-EN084", "Ultimate Rare", ["Ultra Rare"]),
	wanting("Red Dragon Archfiend", "TDGS-EN041", "Ultimate Rare", [
		"Ultra Rare",
	]),
	wanting("Goyo Guardian", "TDGS-EN042", "Ultimate Rare", ["Ultra Rare"]),
	wanting("Thought Ruler Archfiend", "TDGS-EN044", "Ultimate Rare", [
		"Ultra Rare",
	]),
	wanting("Black Rose Dragon", "CSOC-EN039", "Ultimate Rare", [
		"Ghost Rare",
		"Ultra Rare",
	]),
	wanting("Stardust Dragon", "TDGS-EN040", "Ultimate Rare", [
		"Ghost Rare",
		"Ultra Rare",
	]),
];

/** Each Search's Exclusions must spare every Printing it looks for. */
function dropsAWantedPrinting(search: Search): boolean {
	return search.printings.some((printing) =>
		search.exclusions.some((word) =>
			`${printing.rarity} ${printing.cardName}`
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.includes(word),
		),
	);
}

describe("set codes share a Search when its Exclusions drop none of its Printings", () => {
	test("the Chaos Lightsworn Deck packs into 3 Searches instead of 6", () => {
		const searches = buildDeckSearches(chaosLightsworn);

		expect(
			searches.map((search) => [
				search.setCodes,
				search.requiredTerms,
				search.exclusions,
			]),
		).toEqual([
			[
				[
					"CRV-EN015",
					"CSOC-EN039",
					"EEN-EN037",
					"PTDN-EN084",
					"RDS-EN045",
					"TDGS-EN040",
					"TDGS-EN041",
					"TDGS-EN042",
				],
				["ultimate", "utr"],
				["ghost", "super", "ultra"],
			],
			[
				[
					"MAMA-EN110",
					"OP16-EN001",
					"STON-EN024",
					"STON-EN054",
					"TP7-EN005",
					"TU02-EN004",
					"TU02-EN007",
					"TU03-EN000",
				],
				[],
				["secret"],
			],
			// Searches of their own for the Ultimate Rares would split the
			// Secret Rare from the Ultra Rare (Pharaoh's Rare) leaving out
			// -secret: 4 Searches, so they stay mixed.
			[
				[
					"PTDN-EN019",
					"TDGS-EN044",
					"TU04-EN000",
					"TU05-EN000",
					"TU06-EN000",
					"TU07-EN000",
				],
				[],
				["ultra"],
			],
		]);
		for (const search of searches) {
			expect(dropsAWantedPrinting(search)).toBe(false);
		}
	});

	test("a wanted Secret Rare stays out of a Search leaving out -secret", () => {
		const searches = buildDeckSearches([
			wanting("Dark Armed Dragon", "PTDN-EN019", "Secret Rare"),
			wanting("Gold Sarcophagus", "MAMA-EN110", "Ultra Rare", ["Secret Rare"]),
		]);

		expect(
			searches.map((search) => [search.setCodes, search.exclusions]),
		).toEqual([
			[["MAMA-EN110"], ["secret"]],
			[["PTDN-EN019"], []],
		]);
	});

	test("a Card named with an Exclusion word stays out of that Search", () => {
		const searches = buildDeckSearches([
			wanting("Super Polymerization", "RA01-EN055", "Starlight Rare"),
			wanting("Pot of Avarice", "EEN-EN037", "Ultimate Rare", ["Super Rare"]),
		]);

		expect(searches.map((search) => search.setCodes)).toEqual([
			["EEN-EN037"],
			["RA01-EN055"],
		]);
	});

	test("the order Cards come in doesn't change the Searches", () => {
		expect(buildDeckSearches([...chaosLightsworn].reverse())).toEqual(
			buildDeckSearches(chaosLightsworn),
		);
	});

	test("a Search still holds at most 8 set codes", () => {
		const cards = Array.from({ length: 17 }, (_, i) =>
			wanting(`Card ${i}`, `RA01-EN${String(i + 1).padStart(3, "0")}`, "Rare"),
		);

		expect(
			buildDeckSearches(cards).map((search) => search.setCodes.length),
		).toEqual([8, 8, 1]);
	});
});

describe("a Search of one Overloaded rarity requires that rarity", () => {
	// TU* aren't Overloaded; the rest share their set code with Ultra, Super,
	// Ghost or plain Rare, and a Super, a Secret and a Rare are wanted besides.
	const ultimates = [
		wanting("Caius the Shadow Monarch", "TU03-EN000", "Ultimate Rare"),
		wanting("Tragoedia", "TU04-EN000", "Ultimate Rare"),
		wanting("Stardust Dragon", "TDGS-EN040", "Ultimate Rare", [
			"Ghost Rare",
			"Ultra Rare",
		]),
		wanting("Red Dragon Archfiend", "TDGS-EN041", "Ultimate Rare", [
			"Ultra Rare",
		]),
		wanting("Black Rose Dragon", "CSOC-EN039", "Ultimate Rare", [
			"Ghost Rare",
			"Ultra Rare",
		]),
		wanting("Pot of Avarice", "EEN-EN037", "Ultimate Rare", ["Super Rare"]),
		wanting("Monster Reincarnation", "RDS-EN045", "Ultimate Rare", [
			"Super Rare",
		]),
		wanting("D.D. Crow", "STON-EN024", "Ultimate Rare", ["Rare"]),
	];
	const others = [
		wanting("Dark Armed Dragon", "PTDN-EN019", "Secret Rare"),
		wanting("Breaker the Magical Warrior", "TP7-EN005", "Super Rare"),
		wanting("My Body as a Shield", "TU02-EN007", "Rare"),
	];

	test("the Ultimate Rares share one Search that must say ultimate or utr, in as many Searches as before", () => {
		const searches = buildDeckSearches([...others, ...ultimates]);

		expect(
			searches.map((search) => [
				search.setCodes,
				search.requiredRarity,
				search.keywords,
			]),
		).toEqual([
			[
				[
					"CSOC-EN039",
					"EEN-EN037",
					"RDS-EN045",
					"STON-EN024",
					"TDGS-EN040",
					"TDGS-EN041",
					"TU03-EN000",
					"TU04-EN000",
				],
				"Ultimate Rare",
				"(CSOC-EN039,EEN-EN037,RDS-EN045,STON-EN024,TDGS-EN040,TDGS-EN041,TU03-EN000,TU04-EN000) (ultimate,utr) -ghost -super -ultra",
			],
			[
				["PTDN-EN019", "TP7-EN005", "TU02-EN007"],
				null,
				"(PTDN-EN019,TP7-EN005,TU02-EN007)",
			],
		]);
	});

	test("one Overloaded set code goes bare before the term", () => {
		const [search] = buildDeckSearches([
			wanting("D.D. Crow", "STON-EN024", "Ultimate Rare", ["Rare"]),
		]);

		expect(search?.keywords).toBe("STON-EN024 (ultimate,utr)");
	});

	test("a Search wanting Ultimate and Secret Rares under one set code requires neither", () => {
		const [search] = buildDeckSearches([
			{
				cardName: "Dark Armed Dragon",
				copiesNeeded: 1,
				copiesOwned: 0,
				chosenPrintingId: null,
				candidates: [
					{
						printingId: "ultimate",
						setCode: "PTDN-EN019",
						rarity: "Ultimate Rare",
						overloadedRarities: ["Secret Rare", "Super Rare"],
					},
					{
						printingId: "secret",
						setCode: "PTDN-EN019",
						rarity: "Secret Rare",
						overloadedRarities: ["Ultimate Rare", "Super Rare"],
					},
				],
			},
		]);

		expect(search?.requiredRarity).toBeNull();
		expect(search?.requiredTerms).toEqual([]);
		expect(search?.keywords).toBe("PTDN-EN019 -super");
	});

	test("Ultimate Rares none of which is Overloaded require nothing", () => {
		const [search] = buildDeckSearches([
			wanting("Caius the Shadow Monarch", "TU03-EN000", "Ultimate Rare"),
			wanting("Tragoedia", "TU04-EN000", "Ultimate Rare"),
		]);

		expect(search?.requiredRarity).toBeNull();
		expect(search?.keywords).toBe("(TU03-EN000,TU04-EN000)");
	});

	test("set codes stay mixed when a Search of their own would add one", () => {
		const searches = buildDeckSearches([
			wanting("D.D. Crow", "STON-EN024", "Ultimate Rare", ["Rare"]),
			wanting("Dark Armed Dragon", "PTDN-EN019", "Secret Rare"),
			wanting("My Body as a Shield", "TU02-EN007", "Rare"),
		]);

		expect(
			searches.map((search) => [search.setCodes, search.requiredRarity]),
		).toEqual([[["PTDN-EN019", "STON-EN024", "TU02-EN007"], null]]);
	});
});

describe("neededPrintingIds", () => {
	const candidates = [
		{ deckCardId: "ash", printingId: "ash-qcsr" },
		{ deckCardId: "ash", printingId: "ash-ur" },
		{ deckCardId: "nibiru", printingId: "nibiru-sr" },
		{ deckCardId: "done", printingId: "done-ur" },
	];
	const card = (
		_id: string,
		chosenPrintingId: string | null,
		copiesOwned = 0,
	) => ({ _id, copiesNeeded: 3, copiesOwned, chosenPrintingId });

	test("an undecided Card still missing copies needs every Candidate", () => {
		expect(neededPrintingIds([card("ash", null)], candidates)).toEqual(
			new Set(["ash-qcsr", "ash-ur"]),
		);
	});

	test("a Card with a Chosen Printing needs only that one", () => {
		expect(neededPrintingIds([card("ash", "ash-ur")], candidates)).toEqual(
			new Set(["ash-ur"]),
		);
	});

	test("a done Card needs none", () => {
		expect(
			neededPrintingIds(
				[card("done", null, 3), card("nibiru", null)],
				candidates,
			),
		).toEqual(new Set(["nibiru-sr"]));
	});
});

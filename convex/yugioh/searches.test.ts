/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Root-relative so keys stay consistent from this subdirectory.
const modules = import.meta.glob("/convex/**/*.ts");

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function createDeck(t: T): Promise<Id<"yugiohDecks">> {
	return await t.mutation(api.yugioh.decks.createDeck, { name: "Snake-Eye" });
}

async function addCard(
	t: T,
	deckId: Id<"yugiohDecks">,
	card: {
		cardName: string;
		setCode: string;
		rarity?: string;
		overloadedRarities?: string[];
	},
): Promise<Id<"yugiohDeckCards">> {
	return await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		section: "main",
		copiesNeeded: 3,
		rarity: "Quarter Century Secret Rare",
		overloadedRarities: [],
		...card,
	});
}

async function searches(t: T, deckId: Id<"yugiohDecks">) {
	const result = await t.query(api.yugioh.searches.listSearches, { deckId });
	if (result === null) throw new Error("Deck missing");
	return result;
}

function keywords(url: string): string | null {
	return new URL(url).searchParams.get("_nkw");
}

describe("eBay Searches", () => {
	test("a Deck with one Card gets one Search for its set code", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
		});

		const result = await searches(t, deckId);

		expect(result).toMatchObject([
			{ setCodes: ["RA01-EN008"], exclusions: [] },
		]);
	});

	test("Newly Listed sorts by newest; Sold adds the sold and completed filters", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
		});
		await addCard(t, deckId, {
			cardName: 'Maxx "C"',
			setCode: "RA01-EN024",
		});

		const [search] = await searches(t, deckId);
		const newlyListed = new URL(search?.newlyListedUrl ?? "");
		const sold = new URL(search?.soldUrl ?? "");

		expect(newlyListed.origin + newlyListed.pathname).toBe(
			"https://www.ebay.com/sch/i.html",
		);
		expect(keywords(newlyListed.href)).toBe("(RA01-EN008,RA01-EN024)");
		expect(newlyListed.searchParams.get("_sop")).toBe("10");
		expect(newlyListed.searchParams.has("LH_Sold")).toBe(false);

		expect(keywords(sold.href)).toBe("(RA01-EN008,RA01-EN024)");
		expect(sold.searchParams.get("LH_Sold")).toBe("1");
		expect(sold.searchParams.get("LH_Complete")).toBe("1");
		expect(sold.searchParams.get("_sop")).toBe("13");
	});

	test("no Search exceeds 8 set codes, and each set code is searched once", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		const codes = Array.from(
			{ length: 17 },
			(_, i) => `RA01-EN${String(i + 1).padStart(3, "0")}`,
		);
		for (const [i, setCode] of codes.entries()) {
			await addCard(t, deckId, { cardName: `Card ${i}`, setCode });
		}

		const result = await searches(t, deckId);

		expect(result.map((search) => search.setCodes.length)).toEqual([8, 8, 1]);
		for (const search of result.slice(0, 2)) {
			expect(keywords(search.newlyListedUrl)).toBe(
				`(${search.setCodes.join(",")})`,
			);
		}
		expect(keywords(result[2]?.newlyListedUrl ?? "")).toBe("RA01-EN017");
		expect(result.flatMap((search) => search.setCodes).sort()).toEqual(codes);
	});
	test("a Printing on two Cards (Main and Side) is searched once", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
		});
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: [],
			section: "side",
			copiesNeeded: 1,
		});

		expect(await searches(t, deckId)).toMatchObject([
			{
				setCodes: ["RA01-EN008"],
				printings: [
					{
						cardName: "Ash Blossom & Joyous Spring",
						setCode: "RA01-EN008",
						rarity: "Quarter Century Secret Rare",
					},
				],
			},
		]);
	});
});

describe("Exclusions", () => {
	test("only Searches with an Overloaded set code get its Exclusions", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			overloadedRarities: ["Super Rare", "Ultra Rare"],
		});
		// A wanted Super Rare: "-super" would drop it, so it can't share.
		await addCard(t, deckId, {
			cardName: 'Maxx "C"',
			setCode: "RA01-EN024",
			rarity: "Super Rare",
		});

		const result = await searches(t, deckId);

		expect(result).toMatchObject([
			{ setCodes: ["RA01-EN008"], exclusions: ["super", "ultra"] },
			{ setCodes: ["RA01-EN024"], exclusions: [] },
		]);
		expect(keywords(result[0]?.newlyListedUrl ?? "")).toBe(
			"RA01-EN008 -super -ultra",
		);
		expect(keywords(result[0]?.soldUrl ?? "")).toBe("RA01-EN008 -super -ultra");
		expect(keywords(result[1]?.newlyListedUrl ?? "")).toBe("RA01-EN024");
	});

	test("set codes share a Search when its Exclusions drop none of their Printings", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			overloadedRarities: ["Ultra Rare", "Super Rare"],
		});
		await addCard(t, deckId, {
			cardName: "Called by the Grave",
			setCode: "RA01-EN060",
			overloadedRarities: ["Super Rare", "Ultra Rare"],
		});
		await addCard(t, deckId, {
			cardName: "Infinite Impermanence",
			setCode: "RA01-EN074",
			overloadedRarities: ["Super Rare"],
		});

		const result = await searches(t, deckId);

		expect(result).toMatchObject([
			{
				setCodes: ["RA01-EN008", "RA01-EN060", "RA01-EN074"],
				exclusions: ["super", "ultra"],
			},
		]);
	});

	test("never excludes a word the wanted rarity or the Card name contains", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		// Wanting Quarter Century Secret Rare: "-secret" would drop it too.
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			overloadedRarities: ["Secret Rare", "Collector's Rare", "Rare"],
		});
		// "-super" would drop every "Super Polymerization" Listing.
		await addCard(t, deckId, {
			cardName: "Super Polymerization",
			setCode: "RA01-EN055",
			rarity: "Starlight Rare",
			overloadedRarities: ["Super Rare"],
		});

		const result = await searches(t, deckId);

		// Neither "-secret" nor "-super", so the two can share a Search.
		expect(result).toMatchObject([
			{ setCodes: ["RA01-EN008", "RA01-EN055"], exclusions: ["collector"] },
		]);
	});
});

describe("Searches follow the Deck", () => {
	test("un-chosen Candidates drop out once a Chosen Printing is set", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		const deckCardId = await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
		});
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			setCode: "RA02-EN015",
			rarity: "Starlight Rare",
			overloadedRarities: [],
		});
		const undecided = await searches(t, deckId);
		expect(undecided.flatMap((search) => search.setCodes)).toEqual([
			"RA01-EN008",
			"RA02-EN015",
		]);

		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		const starlight = deck?.sections[0]?.cards[0]?.candidates.find(
			(candidate) => candidate.setCode === "RA02-EN015",
		);
		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: starlight?.printingId ?? null,
		});

		const chosen = await searches(t, deckId);
		expect(chosen.flatMap((search) => search.setCodes)).toEqual(["RA02-EN015"]);

		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: null,
		});
		const undecidedAgain = await searches(t, deckId);
		expect(undecidedAgain.flatMap((search) => search.setCodes)).toEqual([
			"RA01-EN008",
			"RA02-EN015",
		]);
	});

	test("Searches update when Cards are added or removed", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		const ashId = await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			overloadedRarities: ["Super Rare"],
		});
		await addCard(t, deckId, {
			cardName: 'Maxx "C"',
			setCode: "RA01-EN024",
		});

		await t.mutation(api.yugioh.decks.removeCard, { deckCardId: ashId });

		expect(await searches(t, deckId)).toMatchObject([
			{ setCodes: ["RA01-EN024"], exclusions: [] },
		]);
	});

	test("a Deck without Cards has no Searches; a missing Deck returns null", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		expect(await searches(t, deckId)).toEqual([]);

		await t.run(async (ctx) => ctx.db.delete("yugiohDecks", deckId));
		expect(
			await t.query(api.yugioh.searches.listSearches, { deckId }),
		).toBeNull();
	});

	test("Overloaded rarities learned in another Deck reach this Deck's Searches", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		const otherDeckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
		});
		await addCard(t, otherDeckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			overloadedRarities: ["Ultra Rare"],
		});

		expect(await searches(t, deckId)).toMatchObject([
			{ setCodes: ["RA01-EN008"], exclusions: ["ultra"] },
		]);
	});
});

/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TcgplayerProduct } from "../../src/lib/yugioh/tcgplayer";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The marketplace and the AI are faked: tests set what TCGplayer's search
// returns and which product the AI picks.
const fakes = vi.hoisted(() => ({
	products: [] as TcgplayerProduct[],
	searchError: null as Error | null,
	pick: { productId: null as number | null, probability: 0 },
	searches: [] as string[],
	/** What TCGplayer's product details say, by product id. */
	details: new Map<number, TcgplayerProduct>(),
	detailsError: null as Error | null,
}));

vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async (setCode: string) => {
		fakes.searches.push(setCode);
		if (fakes.searchError) throw fakes.searchError;
		return fakes.products;
	},
	fetchTcgplayerProduct: async (productId: number) => {
		if (fakes.detailsError) throw fakes.detailsError;
		return fakes.details.get(productId) ?? null;
	},
}));

vi.mock("../model/yugioh/tcgplayerPicker", () => ({
	pickTcgplayerProduct: async () => fakes.pick,
}));

const modules = import.meta.glob("/convex/**/*.ts");

const ashQcsrUrl =
	"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare";
const ashSuperUrl =
	"https://www.tcgplayer.com/product/524809/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring";

const ashQcsrProduct: TcgplayerProduct = {
	productId: 524817,
	productName: "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
	setName: "25th Anniversary Rarity Collection",
	rarityName: "Quarter Century Secret Rare",
	setCode: "RA01-EN008",
	productUrl: ashQcsrUrl,
};
const ashSuperProduct: TcgplayerProduct = {
	productId: 524809,
	productName: "Ash Blossom & Joyous Spring",
	setName: "25th Anniversary Rarity Collection",
	rarityName: "Super Rare",
	setCode: "RA01-EN008",
	productUrl: ashSuperUrl,
};

const ashBlossom = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "RA01-EN008",
	rarity: "Quarter Century Secret Rare",
	overloadedRarities: ["Super Rare"],
	section: "main" as const,
	copiesNeeded: 3,
};

beforeEach(() => {
	vi.useFakeTimers();
	fakes.products = [ashQcsrProduct, ashSuperProduct];
	fakes.searchError = null;
	fakes.pick = { productId: 524817, probability: 0.97 };
	fakes.searches = [];
	fakes.details = new Map([
		[ashQcsrProduct.productId, ashQcsrProduct],
		[ashSuperProduct.productId, ashSuperProduct],
	]);
	fakes.detailsError = null;
});

afterEach(() => {
	vi.useRealTimers();
});

async function addAsh(t: ReturnType<typeof convexTest>) {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Snake-Eye",
	});
	const deckCardId = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		...ashBlossom,
	});
	return { deckId, deckCardId };
}

async function firstCandidate(
	t: ReturnType<typeof convexTest>,
	deckId: Id<"yugiohDecks">,
) {
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const candidate = deck?.sections[0]?.cards[0]?.candidates[0];
	if (!candidate) throw new Error("expected a Candidate");
	return candidate;
}

const searchFallback =
	"https://www.tcgplayer.com/search/yugioh/product?q=RA01-EN008&productLineName=yugioh";

describe("TCGplayer lookup when a Printing is added", () => {
	test("the Printing is searching until the lookup finishes", async () => {
		const t = convexTest(schema, modules);
		const { deckId } = await addAsh(t);

		expect((await firstCandidate(t, deckId)).tcgplayer).toEqual({
			status: "searching",
			productUrl: null,
			imageUrl: null,
			searchUrl: searchFallback,
		});
	});

	test("stores the product page the AI picks, and its image", async () => {
		const t = convexTest(schema, modules);
		const { deckId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(fakes.searches).toEqual(["RA01-EN008"]);
		expect((await firstCandidate(t, deckId)).tcgplayer).toEqual({
			status: "found",
			productUrl: ashQcsrUrl,
			imageUrl:
				"https://tcgplayer-cdn.tcgplayer.com/product/524817_in_400x400.jpg",
			searchUrl: searchFallback,
		});
	});

	test("rejects a pick for another rarity and asks for a paste", async () => {
		const t = convexTest(schema, modules);
		fakes.pick = { productId: 524809, probability: 0.9 };
		const { deckId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect((await firstCandidate(t, deckId)).tcgplayer).toMatchObject({
			status: "needsPaste",
			productUrl: null,
			imageUrl: null,
		});
	});

	test("rejects a product whose URL fails the pattern check", async () => {
		const t = convexTest(schema, modules);
		fakes.products = [
			{
				...ashQcsrProduct,
				productUrl:
					"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-called-by-the-grave",
			},
		];
		const { deckId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect((await firstCandidate(t, deckId)).tcgplayer.status).toBe(
			"needsPaste",
		);
	});

	test("stores the AI's pick when TCGplayer says it's the Printing, even if the Card has a short name", async () => {
		const t = convexTest(schema, modules);
		const brionacUrl =
			"https://www.tcgplayer.com/product/80926/yugioh-duel-terminal-1-brionac-dragon-of-the-ice-barrier";
		fakes.products = [
			{
				productId: 80926,
				productName: "Brionac, Dragon of the Ice Barrier",
				setName: "Duel Terminal 1",
				rarityName: "Duel Terminal Ultra Parallel Rare",
				setCode: "DT01-EN031",
				productUrl: brionacUrl,
			},
		];
		fakes.pick = { productId: 80926, probability: 0.95 };
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Ice Barrier",
		});
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName: "Brionac",
			setCode: "DT01-EN031",
			rarity: "Duel Terminal Ultra Parallel Rare",
			overloadedRarities: [],
			section: "extra",
			copiesNeeded: 1,
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect((await firstCandidate(t, deckId)).tcgplayer).toMatchObject({
			status: "found",
			productUrl: brionacUrl,
		});
	});

	test("rejects a product with another set code", async () => {
		const t = convexTest(schema, modules);
		fakes.products = [{ ...ashQcsrProduct, setCode: "RA02-EN008" }];
		const { deckId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect((await firstCandidate(t, deckId)).tcgplayer.status).toBe(
			"needsPaste",
		);
	});

	test("asks for a paste when the AI isn't sure or picks nothing", async () => {
		for (const pick of [
			{ productId: 524817, probability: 0.3 },
			{ productId: null, probability: 0.9 },
		]) {
			const t = convexTest(schema, modules);
			fakes.pick = pick;
			const { deckId } = await addAsh(t);
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			expect((await firstCandidate(t, deckId)).tcgplayer.status).toBe(
				"needsPaste",
			);
		}
	});

	test("asks for a paste when TCGplayer can't be reached", async () => {
		const t = convexTest(schema, modules);
		fakes.searchError = new Error("TCGplayer search failed: 503");
		const { deckId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect((await firstCandidate(t, deckId)).tcgplayer.status).toBe(
			"needsPaste",
		);
	});

	test("looks up a Candidate Printing added later, but not a Printing already saved", async () => {
		const t = convexTest(schema, modules);
		const { deckId, deckCardId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			setCode: "RA01-EN008",
			rarity: "Super Rare",
			overloadedRarities: [],
		});
		fakes.pick = { productId: 524809, probability: 0.9 };
		const otherDeckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Branded",
		});
		await t.mutation(api.yugioh.decks.addCard, {
			deckId: otherDeckId,
			...ashBlossom,
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(fakes.searches).toEqual(["RA01-EN008", "RA01-EN008"]);
		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		expect(
			deck?.sections[0]?.cards[0]?.candidates.map((c) => c.tcgplayer),
		).toMatchObject([
			{ status: "found", productUrl: ashQcsrUrl },
			{ status: "found", productUrl: ashSuperUrl },
		]);
	});
});

describe("changing a linked Printing's TCGplayer link", () => {
	// Another product page TCGplayer lists for the same Printing.
	const otherQcsrUrl =
		"https://www.tcgplayer.com/product/600001/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare";

	async function linkedAsh(t: ReturnType<typeof convexTest>) {
		const { deckId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		const candidate = await firstCandidate(t, deckId);
		expect(candidate.tcgplayer.productUrl).toBe(ashQcsrUrl);
		return { deckId, printingId: candidate.printingId };
	}

	test("a pasted product page for the Printing replaces the link and its image", async () => {
		const t = convexTest(schema, modules);
		const { deckId, printingId } = await linkedAsh(t);
		fakes.details.set(600001, {
			...ashQcsrProduct,
			productId: 600001,
			productUrl: otherQcsrUrl,
		});

		await t.action(api.yugioh.tcgplayer.setProductUrl, {
			printingId,
			url: `${otherQcsrUrl}?Language=English`,
		});

		expect((await firstCandidate(t, deckId)).tcgplayer).toEqual({
			status: "found",
			productUrl: otherQcsrUrl,
			imageUrl:
				"https://tcgplayer-cdn.tcgplayer.com/product/600001_in_400x400.jpg",
			searchUrl: searchFallback,
		});
	});

	test("a replacement that fails ticket 03's checks keeps the old link", async () => {
		const t = convexTest(schema, modules);
		const { deckId, printingId } = await linkedAsh(t);

		for (const url of ["https://www.ebay.com/itm/1234", ashSuperUrl]) {
			await expect(
				t.action(api.yugioh.tcgplayer.setProductUrl, { printingId, url }),
			).rejects.toThrow(
				"That isn't a TCGplayer product page for this Printing.",
			);
		}
		expect((await firstCandidate(t, deckId)).tcgplayer).toMatchObject({
			status: "found",
			productUrl: ashQcsrUrl,
		});
	});
});

describe("pasting a TCGplayer product URL", () => {
	async function ashNeedingPaste(t: ReturnType<typeof convexTest>) {
		fakes.pick = { productId: null, probability: 1 };
		const { deckId } = await addAsh(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		return { deckId, printingId: (await firstCandidate(t, deckId)).printingId };
	}

	test("a pasted product page for the Printing is saved without its query string", async () => {
		const t = convexTest(schema, modules);
		const { deckId, printingId } = await ashNeedingPaste(t);

		await t.action(api.yugioh.tcgplayer.setProductUrl, {
			printingId,
			url: `${ashQcsrUrl}?Language=English&Condition=Near+Mint`,
		});

		expect((await firstCandidate(t, deckId)).tcgplayer).toEqual({
			status: "found",
			productUrl: ashQcsrUrl,
			imageUrl:
				"https://tcgplayer-cdn.tcgplayer.com/product/524817_in_400x400.jpg",
			searchUrl: searchFallback,
		});
	});

	test("a pasted URL that fails the pattern check is rejected", async () => {
		const t = convexTest(schema, modules);
		const { deckId, printingId } = await ashNeedingPaste(t);

		for (const url of [
			"https://www.ebay.com/itm/1234",
			"https://www.tcgplayer.com/product/524804/yugioh-25th-anniversary-rarity-collection-called-by-the-grave-ur",
			"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-secret-rare",
		]) {
			await expect(
				t.action(api.yugioh.tcgplayer.setProductUrl, { printingId, url }),
			).rejects.toThrow(
				"That isn't a TCGplayer product page for this Printing.",
			);
		}
		expect((await firstCandidate(t, deckId)).tcgplayer.status).toBe(
			"needsPaste",
		);
	});

	test("a pasted bare product name is rejected when TCGplayer says it's another rarity", async () => {
		const t = convexTest(schema, modules);
		const { deckId, printingId } = await ashNeedingPaste(t);

		await expect(
			t.action(api.yugioh.tcgplayer.setProductUrl, {
				printingId,
				url: ashSuperUrl,
			}),
		).rejects.toThrow("That isn't a TCGplayer product page for this Printing.");
		expect((await firstCandidate(t, deckId)).tcgplayer.status).toBe(
			"needsPaste",
		);
	});

	// Bug: a Card named by its short name ("Brionac") was rejected, because the
	// slug's rest ("-dragon-of-the-ice-barrier") was read as a wrong rarity,
	// though TCGplayer's own data says the product is exactly this Printing.
	test("a pasted product page is saved when TCGplayer says it's the Printing, even if the Card has a short name", async () => {
		const t = convexTest(schema, modules);
		const brionacUrl =
			"https://www.tcgplayer.com/product/80926/yugioh-duel-terminal-1-brionac-dragon-of-the-ice-barrier";
		fakes.pick = { productId: null, probability: 1 };
		fakes.details.set(80926, {
			productId: 80926,
			productName: "Brionac, Dragon of the Ice Barrier",
			setName: "Duel Terminal 1",
			rarityName: "Duel Terminal Ultra Parallel Rare",
			setCode: "DT01-EN031",
			productUrl: brionacUrl,
		});
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Ice Barrier",
		});
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName: "Brionac",
			setCode: "DT01-EN031",
			rarity: "Duel Terminal Ultra Parallel Rare",
			overloadedRarities: [],
			section: "extra",
			copiesNeeded: 1,
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		const { printingId } = await firstCandidate(t, deckId);

		await t.action(api.yugioh.tcgplayer.setProductUrl, {
			printingId,
			url: `${brionacUrl}?page=1&Language=English`,
		});

		expect((await firstCandidate(t, deckId)).tcgplayer).toMatchObject({
			status: "found",
			productUrl: brionacUrl,
		});
	});

	test("a pasted product from another set code is rejected", async () => {
		const t = convexTest(schema, modules);
		const { printingId } = await ashNeedingPaste(t);
		fakes.details.set(524817, { ...ashQcsrProduct, setCode: "RA02-EN008" });

		await expect(
			t.action(api.yugioh.tcgplayer.setProductUrl, {
				printingId,
				url: ashQcsrUrl,
			}),
		).rejects.toThrow("That isn't a TCGplayer product page for this Printing.");
	});

	test("a paste that passes the pattern check is saved when TCGplayer can't be reached", async () => {
		const t = convexTest(schema, modules);
		const { deckId, printingId } = await ashNeedingPaste(t);
		fakes.detailsError = new Error("TCGplayer details failed: 503");

		await t.action(api.yugioh.tcgplayer.setProductUrl, {
			printingId,
			url: ashQcsrUrl,
		});

		expect((await firstCandidate(t, deckId)).tcgplayer.status).toBe("found");
	});

	test("a paste wins over a lookup that finishes later", async () => {
		const t = convexTest(schema, modules);
		fakes.pick = { productId: 524809, probability: 0.9 };
		const { deckId } = await addAsh(t);
		const { printingId } = await firstCandidate(t, deckId);

		await t.action(api.yugioh.tcgplayer.setProductUrl, {
			printingId,
			url: ashQcsrUrl,
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect((await firstCandidate(t, deckId)).tcgplayer).toMatchObject({
			status: "found",
			productUrl: ashQcsrUrl,
		});
	});
});

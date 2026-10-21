/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// A capture says which Deck's Listings show what the page captured, so the
// extension's dock can link there: the first Deck still missing copies of
// the page's Printings, and the Card when the page is about one. Null when
// no Deck has them.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// TCGplayer's product lookup finds nothing, so new Printings ask for a paste.
vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async () => [],
	fetchTcgplayerProduct: async () => null,
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";

const ASH = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "RA01-EN008",
	rarity: "Quarter Century Secret Rare",
};
const CROW = {
	cardName: "D.D. Crow",
	setCode: "RA01-EN009",
	rarity: "Quarter Century Secret Rare",
};

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function deck(t: T, name: string): Promise<Id<"yugiohDecks">> {
	return await t.mutation(api.yugioh.decks.createDeck, { name });
}

/** Adds a Card searching one Printing; `owned` of its 3 copies. */
async function addCard(
	t: T,
	deckId: Id<"yugiohDecks">,
	printing: typeof ASH,
	owned = 0,
): Promise<Id<"yugiohDeckCards">> {
	const cardId = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		section: "main",
		copiesNeeded: 3,
		...printing,
		overloadedRarities: [],
	});
	if (owned > 0) {
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: cardId,
			copiesOwned: owned,
		});
	}
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	return cardId;
}

async function post(t: T, path: string, body: unknown) {
	const res = await t.fetch(path, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify(body),
	});
	expect(res.status).toBe(200);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	return await res.json();
}

/** Ash's product page, which a capture links to the one Ash Printing. */
function captureAshPage(t: T) {
	return post(t, "/server/yugioh/tcgplayer-product", {
		product: {
			productId: 524817,
			url: "https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
			listingsFromCheapest: true,
			listings: [],
			sales: [
				{
					soldDate: "2026-10-01",
					condition: "Near Mint 1st Edition",
					price: 40,
					shipping: 0,
					quantity: 1,
					customTitle: null,
				},
			],
			details: {
				productName: ASH.cardName,
				setCode: ASH.setCode,
				rarity: ASH.rarity,
			},
		},
	});
}

/** An eBay Search page's capture, with the page's URL. */
function captureSearch(t: T, searchUrl?: string) {
	return post(t, "/server/yugioh/ebay-listings", {
		listings: [
			{
				itemId: "306512345678",
				url: "https://www.ebay.com/itm/306512345678",
				title: "Ash Blossom & Joyous Spring RA01-EN008 Quarter Century NM",
				imageUrl: null,
				price: 42.15,
				currency: "USD",
				shipping: 4.99,
				listingType: "buyItNow",
				bids: null,
				endsAt: null,
				listedAt: null,
				sellerLocation: null,
				sold: false,
				soldDate: null,
			},
		],
		...(searchUrl ? { searchUrl } : {}),
	});
}

test("a TCGplayer page links to the first Deck still missing copies of its Printing, and its Card", async () => {
	const t = setup();
	const done = await deck(t, "Done");
	await addCard(t, done, ASH, 3);
	const wanting = await deck(t, "Wanting");
	const cardId = await addCard(t, wanting, ASH);

	const report = await captureAshPage(t);

	expect(report.listingsPage).toEqual({ deckId: wanting, cardId });
});

test("when every Deck has all its copies, the page still links to the first Deck", async () => {
	const t = setup();
	const first = await deck(t, "First");
	const cardId = await addCard(t, first, ASH, 3);

	const report = await captureAshPage(t);

	expect(report.listingsPage).toEqual({ deckId: first, cardId });
});

test("a TCGplayer page no Deck has links nowhere", async () => {
	const t = setup();
	await addCard(t, await deck(t, "Crows"), CROW);

	const report = await captureAshPage(t);

	expect(report.printing).toBeNull();
	expect(report.listingsPage).toBeNull();
});

test("an eBay Search for one Card links to its Deck and that Card", async () => {
	const t = setup();
	const deckId = await deck(t, "Hand traps");
	const cardId = await addCard(t, deckId, ASH);

	const report = await captureSearch(
		t,
		"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_Sold=1&LH_Complete=1&_sop=13",
	);

	expect(report.listingsPage).toEqual({ deckId, cardId });
});

test("an eBay Search for several Cards links to their Deck, not one Card", async () => {
	const t = setup();
	const deckId = await deck(t, "Hand traps");
	await addCard(t, deckId, ASH);
	await addCard(t, deckId, CROW);

	const report = await captureSearch(
		t,
		"https://www.ebay.com/sch/i.html?_nkw=%28RA01-EN008%2CRA01-EN009%29&_sop=10",
	);

	expect(report.listingsPage).toEqual({ deckId, cardId: null });
});

test("an eBay capture without its page's URL, or for set codes no Deck has, links nowhere", async () => {
	const t = setup();
	await addCard(t, await deck(t, "Hand traps"), ASH);

	expect((await captureSearch(t)).listingsPage).toBeNull();
	expect(
		(
			await captureSearch(
				t,
				"https://www.ebay.com/sch/i.html?_nkw=LOB-001&_sop=10",
			)
		).listingsPage,
	).toBeNull();
});

/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The AI and TCGplayer are faked. Each title's read is whatever `fakes.reads`
// says for it, else a raw, English, Near Mint single in the Printing's rarity.
const fakes = vi.hoisted(() => ({
	reads: new Map<string, Partial<TitleJudgments>>(),
}));

vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (title: string): Promise<TitleJudgments> => ({
		setCode: null,
		rarity: null,
		condition: "nearMint",
		copies: 1,
		language: "english",
		graded: false,
		gradingCompany: null,
		...fakes.reads.get(title),
	}),
}));

vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async () => [],
	fetchTcgplayerProduct: async () => null,
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 12, 0);

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	fakes.reads = new Map();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function createDeck(
	t: T,
	name = "Snake-Eye",
): Promise<Id<"yugiohDecks">> {
	return await t.mutation(api.yugioh.decks.createDeck, { name });
}

type CardInput = {
	cardName: string;
	setCode: string;
	rarity?: string;
	section?: "main" | "extra" | "side";
	copiesNeeded?: number;
	copiesOwned?: number;
};

async function addCard(
	t: T,
	deckId: Id<"yugiohDecks">,
	{
		cardName,
		setCode,
		rarity = "Quarter Century Secret Rare",
		section = "main",
		copiesNeeded = 3,
		copiesOwned = 0,
	}: CardInput,
): Promise<Id<"yugiohDeckCards">> {
	const deckCardId = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName,
		section,
		copiesNeeded,
		setCode,
		rarity,
		overloadedRarities: [],
	});
	if (copiesOwned > 0) {
		await t.mutation(api.yugioh.decks.updateCard, { deckCardId, copiesOwned });
	}
	await settle(t);
	return deckCardId;
}

let nextItemId = 306600000000;

type Capture = {
	/** Price in dollars, free shipping from the US unless overridden. */
	price: number;
	read?: Partial<TitleJudgments>;
} & Record<string, unknown>;

/** Captures eBay Listings whose titles carry `setCode`, then lets the AI read them. */
async function capture(
	t: T,
	setCode: string,
	...listings: Capture[]
): Promise<void> {
	const body = listings.map(({ read, ...fields }) => {
		const id = String(nextItemId++);
		const title = `Yugioh ${setCode} Quarter Century Secret Rare #${id}`;
		if (read) fakes.reads.set(title, read);
		return {
			itemId: id,
			url: `https://www.ebay.com/itm/${id}`,
			title,
			imageUrl: null,
			currency: "USD",
			shipping: 0,
			listingType: "buyItNow",
			bids: null,
			endsAt: null,
			listedAt: null,
			sellerLocation: "United States",
			sold: false,
			soldDate: null,
			...fields,
		};
	});
	const res = await t.fetch("/server/yugioh/ebay-listings", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify({ listings: body }),
	});
	expect(res.status).toBe(200);
	await settle(t);
}

/** A sale on eBay's Sold page, 5 days before NOW. */
function sold(price: number, extra: Partial<Capture> = {}): Capture {
	return {
		price,
		sold: true,
		soldDate: new Date(NOW - 5 * DAY).toISOString().slice(0, 10),
		...extra,
	};
}

/** Three sales whose median is `price`. */
function salesAround(price: number): Capture[] {
	return [sold(price - 10), sold(price), sold(price + 10)];
}

async function deckAt(t: T, deckId: Id<"yugiohDecks">) {
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId, now: NOW });
	if (!deck) throw new Error("missing Deck");
	return deck;
}

function cardNamed(deck: Awaited<ReturnType<typeof deckAt>>, cardName: string) {
	const card = deck.sections
		.flatMap((group) => group.cards)
		.find((c) => c.cardName === cardName);
	if (!card) throw new Error(`missing ${cardName}`);
	return card;
}

describe("cost to finish", () => {
	test("is remaining Copies times the Reference price", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 3,
			copiesOwned: 1,
		});
		await capture(t, "RA01-EN008", ...salesAround(50));

		const deck = await deckAt(t, deckId);
		expect(cardNamed(deck, "Ash Blossom & Joyous Spring").cost).toEqual({
			remainingCopies: 2,
			toFinish: 100,
			buyNow: null,
		});
		expect(deck.cost?.toFinish).toBe(100);
	});

	test("an undecided Card uses its cheapest Candidate", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		const deckCardId = await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 2,
		});
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			setCode: "RA03-EN008",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: [],
		});
		await settle(t);
		await capture(t, "RA01-EN008", ...salesAround(80));
		await capture(t, "RA03-EN008", ...salesAround(30));

		const card = cardNamed(
			await deckAt(t, deckId),
			"Ash Blossom & Joyous Spring",
		);
		expect(card.cost?.toFinish).toBe(60);

		const pricey = card.candidates.find((c) => c.setCode === "RA01-EN008");
		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: pricey?.printingId ?? null,
		});
		const chosen = cardNamed(
			await deckAt(t, deckId),
			"Ash Blossom & Joyous Spring",
		);
		expect(chosen.cost?.toFinish).toBe(160);
	});

	test("Cards without a Reference price are named, not silently dropped", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		const ash = await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 2,
		});
		await addCard(t, deckId, {
			cardName: "Nibiru, the Primal Being",
			setCode: "RA01-EN019",
			copiesNeeded: 1,
		});
		await addCard(t, deckId, {
			cardName: "Called by the Grave",
			setCode: "RA01-EN060",
			copiesNeeded: 1,
			copiesOwned: 1,
		});
		await capture(t, "RA01-EN008", ...salesAround(50));
		await capture(t, "RA01-EN019", sold(20), sold(25));

		const deck = await deckAt(t, deckId);
		expect(
			cardNamed(deck, "Nibiru, the Primal Being").cost?.toFinish,
		).toBeNull();
		expect(deck.cost).toMatchObject({
			toFinish: 100,
			unfinishedCards: 2,
			cardsWithoutPrice: [{ cardName: "Nibiru, the Primal Being" }],
		});
		expect(deck.cost?.cardsWithoutPrice[0]?._id).not.toBe(ash);
	});

	test("a finished Card costs nothing and needs no price", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Called by the Grave",
			setCode: "RA01-EN060",
			copiesNeeded: 2,
			copiesOwned: 2,
		});

		const deck = await deckAt(t, deckId);
		expect(cardNamed(deck, "Called by the Grave").cost).toEqual({
			remainingCopies: 0,
			toFinish: 0,
			buyNow: 0,
		});
		expect(deck.cost).toEqual({
			toFinish: 0,
			buyNow: 0,
			unfinishedCards: 0,
			cardsWithoutPrice: [],
			cardsWithoutBuyNow: 0,
		});
	});

	test("Graded Listings count toward neither the estimate nor buy now", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 1,
		});
		const graded = { read: { graded: true, gradingCompany: "PSA" } };
		await capture(
			t,
			"RA01-EN008",
			...salesAround(50),
			sold(5, graded),
			sold(6, graded),
			sold(7, graded),
			{ price: 10, ...graded },
			{ price: 45 },
		);

		const card = cardNamed(
			await deckAt(t, deckId),
			"Ash Blossom & Joyous Spring",
		);
		expect(card.cost).toEqual({ remainingCopies: 1, toFinish: 50, buyNow: 45 });
	});
});

describe("buy-now total", () => {
	test("is remaining Copies times the cheapest Qualifying buy-it-now Per-copy price", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 3,
			copiesOwned: 1,
		});
		await capture(
			t,
			"RA01-EN008",
			{ price: 48, shipping: 2 },
			{ price: 44, listingType: "bestOffer" },
			{ price: 90, read: { copies: 3 } },
			{ price: 6, read: { condition: "lightlyPlayed" } },
			sold(7),
			{ price: 8, listingType: "auction", bids: 2, endsAt: NOW + DAY },
		);
		await capture(t, "RA01-KR008", { price: 5 });

		const deck = await deckAt(t, deckId);
		expect(cardNamed(deck, "Ash Blossom & Joyous Spring").cost?.buyNow).toBe(
			60,
		);
		expect(deck.cost).toMatchObject({ buyNow: 60, cardsWithoutBuyNow: 0 });
	});

	test("leaves out Listings no capture has seen for a week", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 1,
		});
		vi.setSystemTime(NOW - 8 * DAY);
		await capture(t, "RA01-EN008", { price: 30 });
		vi.setSystemTime(NOW - 6 * DAY);
		await capture(t, "RA01-EN008", { price: 40 });
		vi.setSystemTime(NOW);

		const deck = await deckAt(t, deckId);
		expect(cardNamed(deck, "Ash Blossom & Joyous Spring").cost?.buyNow).toBe(
			40,
		);
	});

	test("counts the unfinished Cards with nothing to buy now", async () => {
		const t = setup();
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 1,
		});
		await addCard(t, deckId, {
			cardName: "Nibiru, the Primal Being",
			setCode: "RA01-EN019",
			copiesNeeded: 2,
		});
		await capture(t, "RA01-EN019", { price: 20 });

		const deck = await deckAt(t, deckId);
		expect(
			cardNamed(deck, "Ash Blossom & Joyous Spring").cost?.buyNow,
		).toBeNull();
		expect(deck.cost).toMatchObject({ buyNow: 40, cardsWithoutBuyNow: 1 });
	});
});

describe("Sections and order", () => {
	async function threeCardDeck(t: T) {
		const deckId = await createDeck(t);
		await addCard(t, deckId, {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			copiesNeeded: 1,
		});
		await addCard(t, deckId, {
			cardName: "Bystial Magnamhut",
			setCode: "RA01-EN019",
			copiesNeeded: 2,
		});
		await addCard(t, deckId, {
			cardName: "Called by the Grave",
			setCode: "RA01-EN060",
			copiesNeeded: 1,
		});
		await addCard(t, deckId, {
			cardName: "Accesscode Talker",
			setCode: "RA01-EN045",
			section: "extra",
			copiesNeeded: 1,
		});
		await addCard(t, deckId, {
			cardName: "Droll & Lock Bird",
			setCode: "RA01-EN009",
			copiesNeeded: 1,
			copiesOwned: 1,
		});
		await capture(t, "RA01-EN008", ...salesAround(50), { price: 45 });
		await capture(t, "RA01-EN019", ...salesAround(40));
		await capture(t, "RA01-EN045", ...salesAround(120), { price: 110 });
		await capture(t, "RA01-EN009", ...salesAround(500));
		return deckId;
	}

	test("each Section has its own subtotals", async () => {
		const t = setup();
		const deck = await deckAt(t, await threeCardDeck(t));

		expect(deck.sections.map((group) => [group.section, group.cost])).toEqual([
			["main", { toFinish: 130, buyNow: 45 }],
			["extra", { toFinish: 120, buyNow: 110 }],
		]);
		expect(deck.cost).toMatchObject({ toFinish: 250, buyNow: 155 });
	});

	test("By cost puts the most to finish first, then Cards without a price, then finished Cards", async () => {
		const t = setup();
		const deck = await deckAt(t, await threeCardDeck(t));

		expect(deck.sections[0]?.cards.map((card) => card.cardName)).toEqual([
			"Bystial Magnamhut",
			"Ash Blossom & Joyous Spring",
			"Called by the Grave",
			"Droll & Lock Bird",
		]);
	});

	test("moveCard places unpositioned Cards in the same By cost order", async () => {
		const t = setup();
		const deckId = await threeCardDeck(t);
		await t.mutation(api.yugioh.decks.setCardOrder, {
			deckId,
			cardOrder: "custom",
		});
		const before = await deckAt(t, deckId);
		const called = cardNamed(before, "Called by the Grave");

		await t.mutation(api.yugioh.decks.moveCard, {
			deckCardId: called._id,
			toIndex: 0,
			now: NOW,
		});

		const after = await deckAt(t, deckId);
		expect(after.sections[0]?.cards.map((card) => card.cardName)).toEqual([
			"Called by the Grave",
			"Bystial Magnamhut",
			"Ash Blossom & Joyous Spring",
			"Droll & Lock Bird",
		]);
	});

	test("without now, a Deck isn't priced", async () => {
		const t = setup();
		const deckId = await threeCardDeck(t);

		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		expect(deck?.cost).toBeNull();
		expect(deck?.sections[0]?.cost).toBeNull();
		expect(deck?.sections[0]?.cards[0]?.cost).toBeNull();
	});

	test("the Decks overview shows each Deck's cost to finish", async () => {
		const t = setup();
		const deckId = await threeCardDeck(t);
		await createDeck(t, "Empty");

		const decks = await t.query(api.yugioh.decks.listDecks, { now: NOW });
		expect(
			decks.map((deck) => [deck._id === deckId, deck.cost?.toFinish]),
		).toEqual([
			[false, 0],
			[true, 250],
		]);
		expect(
			decks.find((deck) => deck._id === deckId)?.cost?.cardsWithoutPrice,
		).toEqual([{ _id: expect.any(String), cardName: "Called by the Grave" }]);
	});
});

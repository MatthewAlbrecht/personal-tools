/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ListingFilters } from "../../src/lib/yugioh/listing-filters";
import type { ListingSort } from "../../src/lib/yugioh/listing-sort";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The AI and TCGplayer are faked. Each title's read is whatever `fakes.reads`
// says for it, else a raw, English, Near Mint single.
const fakes = vi.hoisted(() => ({
	reads: new Map<string, Partial<TitleJudgments>>(),
}));

vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (title: string): Promise<TitleJudgments> => ({
		setCode: null,
		rarity: "Quarter Century Secret Rare",
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
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
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

/** A Deck wanting Ash Blossom in RA01-EN008 Quarter Century Secret Rare. */
async function ashDeck(t: T): Promise<{
	deckId: Id<"yugiohDecks">;
	deckCardId: Id<"yugiohDeckCards">;
}> {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Snake-Eye",
	});
	const deckCardId = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName: "Ash Blossom & Joyous Spring",
		section: "main",
		copiesNeeded: 3,
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
		overloadedRarities: [],
	});
	await settle(t);
	return { deckId, deckCardId };
}

let nextItemId = 306500000000;

type Capture = {
	read?: Partial<TitleJudgments>;
	title?: string;
	itemId?: string;
} & Record<string, unknown>;

/** Captures eBay results for Ash Blossom at the current time, then reads them. */
async function capture(t: T, ...listings: Capture[]): Promise<string[]> {
	const itemIds: string[] = [];
	const body = listings.map(({ read, title, itemId, ...fields }) => {
		const id = itemId ?? String(nextItemId++);
		itemIds.push(id);
		const fullTitle =
			title ?? `Ash Blossom RA01-EN008 Quarter Century Secret Rare #${id}`;
		if (read) fakes.reads.set(fullTitle, read);
		return {
			itemId: id,
			url: `https://www.ebay.com/itm/${id}`,
			title: fullTitle,
			imageUrl: null,
			price: 50,
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
	return itemIds;
}

async function visit(t: T, deckId: Id<"yugiohDecks">): Promise<void> {
	await t.mutation(api.yugioh.decks.recordDeckVisit, { deckId });
}

async function listings(
	t: T,
	deckId: Id<"yugiohDecks">,
	filters: ListingFilters = {},
	sort?: ListingSort,
) {
	return await t.query(api.yugioh.listings.listListings, {
		deckId,
		now: Date.now(),
		filters,
		sort,
	});
}

/** Item IDs of the Deck's Listings marked new, in the order shown. */
async function newItemIds(t: T, deckId: Id<"yugiohDecks">) {
	const { listings: shown } = await listings(t, deckId);
	return shown.filter((l) => l.isNew).map((l) => l.itemId);
}

function at(time: number): void {
	vi.setSystemTime(time);
}

describe("new since my last visit", () => {
	test("a Listing first seen after my last visit is new; one seen before isn't", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const [before] = await capture(t, {});
		at(NOW + MINUTE);
		await visit(t, deckId);

		at(NOW + 3 * HOUR);
		const [after] = await capture(t, {});
		at(NOW + 5 * HOUR);
		await visit(t, deckId);

		expect(await newItemIds(t, deckId)).toEqual([after]);
		expect(before).toBeDefined();
	});

	test("what's new stays new while I keep using the Deck", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await visit(t, deckId);
		at(NOW + 3 * HOUR);
		const [after] = await capture(t, {});

		at(NOW + 5 * HOUR);
		await visit(t, deckId);
		at(NOW + 5 * HOUR + 20 * MINUTE);
		await visit(t, deckId);
		at(NOW + 5 * HOUR + 45 * MINUTE);
		await visit(t, deckId);
		const [during] = await capture(t, {});

		expect(await newItemIds(t, deckId)).toEqual([during, after]);
	});

	test("the next visit, after a break, starts from where this one ended", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await visit(t, deckId);
		at(NOW + HOUR);
		await capture(t, {});
		at(NOW + 2 * HOUR);
		await visit(t, deckId);
		at(NOW + 2 * HOUR + 10 * MINUTE);
		await visit(t, deckId);

		at(NOW + 3 * HOUR);
		const [later] = await capture(t, {});
		at(NOW + 6 * HOUR);
		await visit(t, deckId);

		expect(await newItemIds(t, deckId)).toEqual([later]);
	});

	test("nothing is new before my first visit, or on it", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await capture(t, {}, {});
		expect(await newItemIds(t, deckId)).toEqual([]);

		at(NOW + HOUR);
		await visit(t, deckId);
		expect(await newItemIds(t, deckId)).toEqual([]);
	});

	test("visits are kept per Deck", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const { deckId: otherDeckId } = await ashDeck(t);
		await visit(t, deckId);
		at(NOW + HOUR);
		const [listing] = await capture(t, {});
		at(NOW + 2 * HOUR);
		await visit(t, deckId);
		// The other Deck was last opened after the capture.
		await visit(t, otherDeckId);

		expect(await newItemIds(t, deckId)).toEqual([listing]);
		expect(await newItemIds(t, otherDeckId)).toEqual([]);
	});

	test("the New filter shows only new Listings, and the Deck counts them", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await capture(t, {}, {});
		await visit(t, deckId);
		at(NOW + HOUR);
		const fresh = await capture(t, {}, {});
		at(NOW + 2 * HOUR);
		await visit(t, deckId);

		const all = await listings(t, deckId);
		expect(all.listings).toHaveLength(4);
		expect(all.newCount).toBe(2);

		const onlyNew = await listings(t, deckId, { new: true });
		expect(onlyNew.listings.map((l) => l.itemId).sort()).toEqual(
			[...fresh].sort(),
		);
		expect(onlyNew.matching).toBe(2);
		expect(onlyNew.newCount).toBe(2);
	});

	test("New counts within the view: Available and Sold each count their own", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await visit(t, deckId);
		at(NOW + HOUR);
		const [, soldNew] = await capture(
			t,
			{},
			{ sold: true, soldDate: "2026-10-19" },
			{},
		);
		at(NOW + 2 * HOUR);
		await visit(t, deckId);

		const available = await listings(t, deckId);
		expect(available.newCount).toBe(2);
		const sold = await listings(t, deckId, { view: "sold" });
		expect(sold.newCount).toBe(1);
		const soldOnlyNew = await listings(t, deckId, { view: "sold", new: true });
		expect(soldOnlyNew.listings.map((l) => l.itemId)).toEqual([soldNew]);
	});
});

describe("new Listings a week, per Card", () => {
	async function perWeek(t: T, deckId: Id<"yugiohDecks">) {
		const deck = await t.query(api.yugioh.decks.getDeck, {
			deckId,
			now: Date.now(),
		});
		return deck?.sections.flatMap((section) =>
			section.cards.map((card) => [card.cardName, card.newListingsPerWeek]),
		);
	}

	test("counts the Card's matched Listings listed in the last 4 weeks", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await capture(
			t,
			{ listedAt: NOW - 1 * DAY },
			{ listedAt: NOW - 6 * DAY },
			{ listedAt: NOW - 13 * DAY },
			{ listedAt: NOW - 20 * DAY },
			{ listedAt: NOW - 27 * DAY },
			// Listed before the 4 weeks.
			{ listedAt: NOW - 29 * DAY },
			// Another card's Listing.
			{ title: "Called by the Grave RA01-EN060 Quarter Century Secret Rare" },
			// A sale from the Sold page: when it was listed is unknown.
			{ sold: true, soldDate: "2026-10-18" },
		);

		expect(await perWeek(t, deckId)).toEqual([
			["Ash Blossom & Joyous Spring", 1.25],
		]);
	});

	test("a Listing without a listing date counts from when it was first captured", async () => {
		const t = setup();
		at(NOW - 30 * DAY);
		const { deckId } = await ashDeck(t);
		await capture(t, {});
		at(NOW - 3 * DAY);
		await capture(t, {}, {});
		at(NOW);

		expect(await perWeek(t, deckId)).toEqual([
			["Ash Blossom & Joyous Spring", 0.5],
		]);
	});

	test("an undecided Card counts every Candidate; a Chosen Printing counts alone", async () => {
		const t = setup();
		const { deckId, deckCardId } = await ashDeck(t);
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			setCode: "MP23-EN001",
			rarity: "Starlight Rare",
			overloadedRarities: [],
		});
		await settle(t);
		fakes.reads.set("Ash Blossom MP23-EN001 Starlight Rare", {
			rarity: "Starlight Rare",
		});
		await capture(
			t,
			{ listedAt: NOW - DAY },
			{ listedAt: NOW - DAY, title: "Ash Blossom MP23-EN001 Starlight Rare" },
		);
		expect(await perWeek(t, deckId)).toEqual([
			["Ash Blossom & Joyous Spring", 0.5],
		]);

		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		const starlight = deck?.sections[0]?.cards[0]?.candidates.find(
			(c) => c.setCode === "MP23-EN001",
		);
		if (!starlight) throw new Error("no Starlight Candidate");
		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: starlight.printingId,
		});
		expect(await perWeek(t, deckId)).toEqual([
			["Ash Blossom & Joyous Spring", 0.25],
		]);
	});

	test("is left out when getDeck isn't given the time", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		expect(deck?.sections[0]?.cards[0]?.newListingsPerWeek).toBeNull();
	});
});

describe("views, sorting and filters", () => {
	test("Available never shows a sale; Sold shows only sales", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const [bin, sold, ended, running] = await capture(
			t,
			{},
			{ sold: true, soldDate: "2026-10-19" },
			{ listingType: "auction", bids: 4, endsAt: NOW - HOUR },
			{ listingType: "auction", bids: 1, endsAt: NOW + HOUR },
		);
		const available = await listings(t, deckId);
		expect(available.listings.map((l) => l.itemId).sort()).toEqual(
			[bin, running].sort(),
		);
		const sales = await listings(t, deckId, { view: "sold" });
		expect(sales.listings.map((l) => l.itemId).sort()).toEqual(
			[sold, ended].sort(),
		);
	});

	test("ending soonest first: running auctions by end time, the rest after", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const [later, soon, , bin] = await capture(
			t,
			{ listingType: "auction", bids: 2, endsAt: NOW + 5 * HOUR },
			{ listingType: "auction", bids: 0, endsAt: NOW + 20 * MINUTE },
			{ listingType: "auction", bids: 4, endsAt: NOW - HOUR },
			{},
		);

		const page = await listings(
			t,
			deckId,
			{},
			{ key: "date", direction: "asc" },
		);
		expect(page.listings.map((l) => l.itemId)).toEqual([soon, later, bin]);
		expect(page.matching).toBe(3);
	});

	test("Sold defaults to the latest sale first", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const [june, september, july] = await capture(
			t,
			{ sold: true, soldDate: "2026-06-23" },
			{ sold: true, soldDate: "2026-09-01" },
			{ sold: true, soldDate: "2026-07-05" },
		);
		const page = await listings(t, deckId, { view: "sold" });
		expect(page.listings.map((l) => l.itemId)).toEqual([september, july, june]);
	});

	test("sorts by Per-copy price over every match, not just the newest 200", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		// The cheapest is captured first, so it's the oldest: the 201st newest.
		// (It has no set code: the Deck reads its set code's newest 200, plus
		// up to 50 that could be for any Deck.)
		const [cheapest] = await capture(
			t,
			{ price: 1, title: "Yugioh Quarter Century Secret Rare binder lot" },
			...Array.from({ length: 200 }, (_, i) => ({ price: 100 + i })),
		);
		const page = await listings(
			t,
			deckId,
			{},
			{ key: "price", direction: "asc" },
		);
		expect(page.matching).toBe(201);
		expect(page.listings).toHaveLength(200);
		expect(page.listings[0]?.itemId).toBe(cheapest);
		expect(page.listings[1]?.perCopyPrice?.perCopy).toBe(100);
		const priciest = await listings(
			t,
			deckId,
			{},
			{ key: "price", direction: "desc" },
		);
		expect(priciest.listings[0]?.perCopyPrice?.perCopy).toBe(299);
	});

	test("filters narrow; with none, nothing is hidden", async () => {
		const t = setup();
		const { deckId, deckCardId } = await ashDeck(t);
		const [kr, , , graded] = await capture(
			t,
			{ title: "Ash Blossom RA01-KR008 Quarter Century Secret Rare" },
			// No set code: it could be for any Deck, so it shows, unsure.
			{ title: "Yugioh Quarter Century Secret Rare binder lot" },
			{ sellerLocation: "Japan" },
			{ read: { graded: true, gradingCompany: "PSA" } },
		);

		const everything = await listings(t, deckId);
		expect(everything.listings).toHaveLength(4);
		// The location filter offers every seller country in the Deck's Listings.
		expect(everything.locations).toEqual(["Japan", "United States"]);
		const korean = await listings(t, deckId, { language: "korean" });
		expect(korean.listings.map((l) => l.itemId)).toEqual([kr]);
		const slabs = await listings(t, deckId, { graded: true });
		expect(slabs.listings.map((l) => l.itemId)).toEqual([graded]);
		const japan = await listings(t, deckId, { location: "Japan" });
		expect(japan.matching).toBe(1);
		const ash = await listings(t, deckId, { card: deckCardId });
		expect(ash.matching).toBe(3);
		const noSuchCard = await listings(t, deckId, { card: "not-an-id" });
		expect(noSuchCard.matching).toBe(0);
	});
});

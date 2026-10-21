/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The AI, TCGplayer and the exchange-rate source are faked. Each title's read
// is whatever `fakes.reads` says for it, else a raw, English, Near Mint single.
const fakes = vi.hoisted(() => ({
	reads: new Map<string, Partial<TitleJudgments>>(),
	rates: null as null | {
		source: string;
		rates: { currency: string; usdPerUnit: number }[];
	},
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

vi.mock("../model/yugioh/exchangeRateSource", () => ({
	fetchUsdRates: async () => {
		if (fakes.rates === null) throw new Error("rates source down");
		return fakes.rates;
	},
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
	fakes.rates = null;
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

/** A Deck wanting Ash Blossom in RA01-EN008 Quarter Century Secret Rare. */
async function ashDeck(
	t: T,
	condition:
		| "nearMint"
		| "lightlyPlayed"
		| "moderatelyPlayed"
		| "heavilyPlayed" = "nearMint",
): Promise<Id<"yugiohDecks">> {
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
	if (condition !== "nearMint") {
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			lowestAcceptableCondition: condition,
		});
	}
	await settle(t);
	return deckId;
}

async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

let nextItemId = 306500000000;

type Capture = {
	/** Price in dollars, free shipping from the US unless overridden. */
	price: number;
	/** What the AI reads from the title, on top of a raw English NM single. */
	read?: Partial<TitleJudgments>;
	title?: string;
	itemId?: string;
} & Record<string, unknown>;

/** Captures eBay results for Ash Blossom, then lets the AI read them. */
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

/** A sale on eBay's Sold page, `daysAgo` days before NOW (5 by default). */
function sold(
	price: number,
	{ daysAgo = 5, ...extra }: Partial<Capture> & { daysAgo?: number } = {},
): Capture {
	return {
		price,
		sold: true,
		soldDate: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10),
		...extra,
	};
}

async function ashReference(t: T, deckId: Id<"yugiohDecks">) {
	const references = await t.query(api.yugioh.deals.listReferencePrices, {
		deckId,
		now: NOW,
	});
	expect(references).toHaveLength(1);
	return references[0]?.ebay;
}

async function listings(t: T, deckId: Id<"yugiohDecks">) {
	// Every stored Listing, newest first, as this Deck grades it: the
	// Listings table hides unsure ones and those for Printings not needed.
	const ids = await t.run(async (ctx) =>
		(await ctx.db.query("yugiohListings").order("desc").collect()).map(
			(listing) => listing._id,
		),
	);
	const views = await Promise.all(
		ids.map((listingId) =>
			t.query(api.yugioh.listings.getListing, { listingId, deckId, now: NOW }),
		),
	);
	return views.flatMap((view) => {
		if (!view) return [];
		const { observations: _, ...listing } = view;
		return [listing];
	});
}

async function dealFor(t: T, deckId: Id<"yugiohDecks">, itemId: string) {
	const listing = (await listings(t, deckId)).find((l) => l.itemId === itemId);
	expect(listing).toBeDefined();
	return listing?.deal;
}

describe("eBay Reference price", () => {
	test("is the median Per-copy price of Qualifying sales", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(60), sold(50));

		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
	});

	test("shows 'not enough sales' with fewer than 3, and how many there are", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(60));

		expect(await ashReference(t, deckId)).toEqual({ price: null, sales: 2 });
	});

	test("an even number of sales takes the mean of the middle two", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60), sold(100));

		expect(await ashReference(t, deckId)).toEqual({ price: 55, sales: 4 });
	});

	test("uses Per-copy prices: shipping, import fees and lots", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(
			t,
			sold(45, { shipping: 5 }),
			sold(150, { read: { copies: 3 } }),
			sold(50, { sellerLocation: "Chile" }),
		);

		// $50, $50 and $57.50 (15% default import fee) a copy.
		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
	});

	test("only counts sales from the last 60 days", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(
			t,
			sold(40, { daysAgo: 59 }),
			sold(50),
			sold(60),
			sold(10, { daysAgo: 61 }),
		);

		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
	});

	test("Listings still for sale don't count", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(60), { price: 50 });

		expect(await ashReference(t, deckId)).toEqual({ price: null, sales: 2 });
	});
});

describe("Qualifying Listings", () => {
	test("only matched, English, raw sales at or above Near Mint count", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(
			t,
			sold(40),
			sold(50),
			sold(60),
			// Not Qualifying: each would pull the median down.
			sold(1, { title: "Ash Blossom RA01-KR008 Quarter Century Secret Rare" }),
			sold(3, { read: { graded: true, gradingCompany: "PSA" } }),
			sold(4, { read: { condition: "lightlyPlayed" } }),
			sold(5, { read: { condition: "damaged" } }),
			sold(6, { read: { rarity: "Secret Rare" } }),
			sold(7, { title: "Ash Blossom Joyous Spring lot" }),
		);

		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
	});

	test("unknown condition counts", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [unknown] = await capture(
			t,
			sold(40, { read: { condition: null } }),
			sold(50),
			sold(60),
		);

		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
		const listing = (await listings(t, deckId)).find(
			(l) => l.itemId === unknown,
		);
		expect(listing?.deal.qualifying).toBe(true);
		expect(listing?.titleRead?.condition).toBeNull();
	});

	test("the Card's Lowest acceptable condition sets the bar", async () => {
		const t = setup();
		const deckId = await ashDeck(t, "lightlyPlayed");
		const [lp, mp] = await capture(
			t,
			sold(40, { read: { condition: "lightlyPlayed" } }),
			sold(1, { read: { condition: "moderatelyPlayed" } }),
			sold(50),
			sold(60),
		);

		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
		expect(await dealFor(t, deckId, lp as string)).toMatchObject({
			qualifying: true,
			belowCondition: false,
		});
		expect(await dealFor(t, deckId, mp as string)).toMatchObject({
			qualifying: false,
			belowCondition: true,
			grade: null,
		});
	});

	test("a Printing two Cards want takes the more lenient condition for its Listings", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const sideCardId = await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName: "Ash Blossom & Joyous Spring",
			section: "side",
			copiesNeeded: 1,
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: [],
		});
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: sideCardId,
			lowestAcceptableCondition: "lightlyPlayed",
		});
		await settle(t);
		await capture(
			t,
			sold(40),
			sold(50),
			sold(60),
			sold(1, { read: { condition: "lightlyPlayed" } }),
		);
		const [lp] = await capture(t, {
			price: 30,
			read: { condition: "lightlyPlayed" },
		});

		const references = await t.query(api.yugioh.deals.listReferencePrices, {
			deckId,
			now: NOW,
		});
		// Each Card's own Reference price: the LP sale counts only for the Side Card.
		expect(
			references.map((r) => [r.deckCardId === sideCardId, r.ebay]),
		).toEqual(
			expect.arrayContaining([
				[false, { price: 50, sales: 3 }],
				[true, { price: 45, sales: 4 }],
			]),
		);
		expect(await dealFor(t, deckId, lp as string)).toMatchObject({
			qualifying: true,
			reference: { price: 45, sales: 4 },
			grade: "great",
			percentOfReference: 67,
		});
	});

	test("a match I set myself counts", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [vague] = await capture(
			t,
			sold(40, { title: "Ash Blossom QCSR rare pull" }),
			sold(50),
			sold(60),
		);
		expect(await ashReference(t, deckId)).toEqual({ price: null, sales: 2 });

		const listing = (await listings(t, deckId)).find((l) => l.itemId === vague);
		const printing = (
			await t.query(api.yugioh.deals.listReferencePrices, { deckId, now: NOW })
		)[0];
		await t.mutation(api.yugioh.listings.setListingMatch, {
			listingId: listing?._id as Id<"yugiohListings">,
			printingId: printing?.printingId as Id<"yugiohPrintings">,
		});

		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
	});
});

describe("Deal grades", () => {
	test("grade each Listing by its percent of the Reference price", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const ids = await capture(
			t,
			{ price: 40 },
			{ price: 40.5 },
			{ price: 47.5 },
			{ price: 47.75 },
			{ price: 55 },
			{ price: 55.5 },
		);

		const deals = await Promise.all(ids.map((id) => dealFor(t, deckId, id)));
		expect(
			deals.map((deal) => [deal?.grade, deal?.percentOfReference]),
		).toEqual([
			["great", 80],
			["good", 81],
			["good", 95],
			["fair", 96],
			["fair", 110],
			["poor", 111],
		]);
		expect(deals[0]).toMatchObject({
			qualifying: true,
			reference: { price: 50, sales: 3 },
		});
	});

	test("no grade without a Reference price, but the sales so far show", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(60));
		const [id] = await capture(t, { price: 30 });

		expect(await dealFor(t, deckId, id as string)).toEqual({
			qualifying: true,
			belowCondition: false,
			reference: { price: null, sales: 2 },
			grade: null,
			percentOfReference: null,
		});
	});

	test("a Graded Listing is still graded, but isn't Qualifying", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const [id] = await capture(t, {
			price: 30,
			title: "PSA 10 Ash Blossom RA01-EN008 Quarter Century Secret Rare",
			read: { graded: true, gradingCompany: "PSA" },
		});

		const listing = (await listings(t, deckId)).find((l) => l.itemId === id);
		expect(listing?.titleRead).toMatchObject({
			graded: true,
			gradingCompany: "PSA",
			grade: "10",
		});
		expect(listing?.deal).toMatchObject({
			qualifying: false,
			grade: "great",
			percentOfReference: 60,
		});
	});

	test("a non-English or unmatched Listing gets no grade", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const [korean, otherRarity] = await capture(
			t,
			{
				price: 30,
				title: "Ash Blossom RA01-KR008 Quarter Century Secret Rare",
			},
			{ price: 30, read: { rarity: "Secret Rare" } },
		);

		expect(await dealFor(t, deckId, korean as string)).toMatchObject({
			qualifying: false,
			grade: null,
		});
		expect(await dealFor(t, deckId, otherRarity as string)).toEqual({
			qualifying: false,
			belowCondition: false,
			reference: null,
			grade: null,
			percentOfReference: null,
		});
	});
});

describe("auctions", () => {
	test("a running auction gets no grade", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const [id] = await capture(t, {
			price: 30,
			listingType: "auction",
			bids: 3,
			endsAt: NOW + 60 * 60 * 1000,
		});

		expect(await dealFor(t, deckId, id as string)).toMatchObject({
			qualifying: true,
			grade: null,
			percentOfReference: null,
		});
	});

	test("an ended auction counts as a sale, and is graded", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [ended] = await capture(
			t,
			sold(40),
			sold(60),
			{
				price: 50,
				listingType: "auction",
				bids: 4,
				endsAt: NOW - 60 * 60 * 1000,
			},
			// Ended without a bid: it didn't sell.
			{
				price: 1,
				listingType: "auction",
				bids: 0,
				endsAt: NOW - 60 * 60 * 1000,
			},
		).then((ids) => ids.slice(2));

		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
		expect(await dealFor(t, deckId, ended as string)).toMatchObject({
			grade: "fair",
			percentOfReference: 100,
		});
	});

	test("an auction counts once it ends, without another capture", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(60), {
			price: 50,
			listingType: "auction",
			bids: 4,
			endsAt: NOW + 60 * 1000,
		});
		expect(await ashReference(t, deckId)).toEqual({ price: null, sales: 2 });

		const later = await t.query(api.yugioh.deals.listReferencePrices, {
			deckId,
			now: NOW + 2 * 60 * 1000,
		});
		expect(later[0]?.ebay).toEqual({ price: 50, sales: 3 });
	});
});

describe("a sale's Per-copy price", () => {
	async function rates(t: T, gbp: number): Promise<void> {
		fakes.rates = {
			source: "Frankfurter",
			rates: [{ currency: "GBP", usdPerUnit: gbp }],
		};
		await t.action(internal.yugioh.pricing.refreshExchangeRates, {});
	}

	test("keeps the exchange rate of when it sold", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await rates(t, 1.25);
		const [itemId] = await capture(t, { price: 40, currency: "GBP" });
		await capture(t, sold(40, { itemId, currency: "GBP" }));
		await capture(t, { price: 40, currency: "GBP" });
		await rates(t, 1.5);
		// Seen again on the Sold page after the rate moved.
		await capture(t, sold(40, { itemId, currency: "GBP" }));

		const all = await listings(t, deckId);
		const sale = all.find((l) => l.itemId === itemId);
		const forSale = all.find((l) => l.itemId !== itemId);
		expect(sale?.perCopyPrice?.perCopy).toBe(50);
		expect(forSale?.perCopyPrice?.perCopy).toBe(60);
	});
});

describe("backfill", () => {
	test("sales captured before Reference prices count once backfilled", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		await t.run(async (ctx) => {
			for (const listing of await ctx.db.query("yugiohListings").take(10)) {
				await ctx.db.patch("yugiohListings", listing._id, {
					saleAt: undefined,
					capturedUsdPerUnit: undefined,
				});
			}
		});
		expect(await ashReference(t, deckId)).toEqual({ price: null, sales: 0 });

		const result = await t.mutation(internal.yugioh.deals.backfillSaleTimes, {
			paginationOpts: { numItems: 100, cursor: null },
		});

		expect(result).toMatchObject({ updated: 3, isDone: true });
		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
	});

	test("the backfill is internal", async () => {
		const mod = (await import("./deals")) as unknown as Record<
			string,
			{ isInternal?: boolean; isPublic?: boolean }
		>;
		expect(mod.backfillSaleTimes?.isInternal).toBe(true);
		expect(mod.listReferencePrices?.isPublic).toBe(true);
	});
});

describe("Rejected Listings", () => {
	async function listingId(t: T, itemId: string) {
		return await t.run(async (ctx) => {
			const listing = await ctx.db
				.query("yugiohListings")
				.withIndex("by_marketplace_and_itemId", (q) =>
					q.eq("marketplace", "ebay").eq("itemId", itemId),
				)
				.unique();
			if (!listing) throw new Error(`missing Listing ${itemId}`);
			return listing._id;
		});
	}

	async function table(
		t: T,
		deckId: Id<"yugiohDecks">,
		filters: { rejected?: boolean } = {},
	) {
		return await t.query(api.yugioh.listings.listListings, {
			deckId,
			now: NOW,
			filters,
		});
	}

	test("a Rejected sale doesn't count toward the Reference price until unmarked", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [, , , fake] = await capture(
			t,
			sold(40),
			sold(50),
			sold(60),
			sold(5),
		);
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });

		const id = await listingId(t, fake as string);
		await t.mutation(api.yugioh.listings.setListingRejection, {
			listingId: id,
			reason: "fake",
		});
		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });

		await t.mutation(api.yugioh.listings.setListingRejection, {
			listingId: id,
			reason: null,
		});
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });
	});

	test("a Rejected Listing gets no grade, and stays rejected when captured again", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const [wrong] = await capture(t, { price: 30 });
		const id = await listingId(t, wrong as string);
		await t.mutation(api.yugioh.listings.setListingRejection, {
			listingId: id,
			reason: "wrongRarity",
		});
		await capture(t, { price: 29, itemId: wrong });

		expect(await dealFor(t, deckId, wrong as string)).toMatchObject({
			qualifying: false,
			grade: null,
		});
		const [listing] = (await listings(t, deckId)).filter(
			(l) => l.itemId === wrong,
		);
		expect(listing?.rejection).toEqual({ reason: "wrongRarity", at: NOW });
	});

	test("the table hides it; Marked wrong shows it with its reason", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [kept, wrong] = await capture(t, { price: 30 }, { price: 31 });
		await t.mutation(api.yugioh.listings.setListingRejection, {
			listingId: await listingId(t, wrong as string),
			reason: "wrongLanguage",
		});

		const available = await table(t, deckId);
		expect(available.listings.map((l) => l.itemId)).toEqual([kept]);
		expect(available.rejectedCount).toBe(1);
		const rejected = await table(t, deckId, { rejected: true });
		expect(
			rejected.listings.map((l) => [l.itemId, l.rejection?.reason]),
		).toEqual([[wrong, "wrongLanguage"]]);
	});

	test("the table leaves out a done Card's Listings", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, { price: 30 });
		expect((await table(t, deckId)).total).toBe(1);

		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		const deckCardId = deck?.sections[0]?.cards[0]?._id;
		if (!deckCardId) throw new Error("missing Card");
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			copiesOwned: 3,
		});
		expect((await table(t, deckId)).total).toBe(0);
	});
});

test("marking a Listing wrong is public; captures stay internal", async () => {
	const listings = (await import("./listings")) as Record<
		string,
		{ isInternal?: boolean; isPublic?: boolean }
	>;
	expect(listings.setListingRejection?.isPublic).toBe(true);
	expect(listings.ingestEbayListings?.isInternal).toBe(true);
	expect(listings.ingestTcgplayerProduct?.isInternal).toBe(true);
});

describe("Condition set by me", () => {
	async function idOf(t: T, itemId: string) {
		return await t.run(async (ctx) => {
			const listing = await ctx.db
				.query("yugiohListings")
				.withIndex("by_marketplace_and_itemId", (q) =>
					q.eq("marketplace", "ebay").eq("itemId", itemId),
				)
				.unique();
			if (!listing) throw new Error(`missing Listing ${itemId}`);
			return listing._id;
		});
	}

	async function viewOf(t: T, deckId: Id<"yugiohDecks">, itemId: string) {
		const listing = (await listings(t, deckId)).find(
			(l) => l.itemId === itemId,
		);
		if (!listing) throw new Error(`missing view ${itemId}`);
		return listing;
	}

	test("wins over the title's read in the Reference price, through recaptures and re-reads", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [, , , misread] = await capture(
			t,
			sold(40),
			sold(50),
			sold(60),
			sold(30, { read: { condition: "damaged" } }),
		);
		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });

		const id = await idOf(t, misread as string);
		await t.mutation(api.yugioh.listings.setListingCondition, {
			listingId: id,
			condition: "nearMint",
		});
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });

		// Captured again as is, then with a changed title the AI reads again.
		await capture(
			t,
			sold(30, { itemId: misread, read: { condition: "damaged" } }),
		);
		await capture(
			t,
			sold(30, {
				itemId: misread,
				title: "Ash Blossom RA01-EN008 QCSR DMG",
				read: { condition: "damaged" },
			}),
		);
		const view = await viewOf(t, deckId, misread as string);
		expect(view.titleRead?.condition).toBe("damaged");
		expect(view.conditionOverride).toBe("nearMint");
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });

		// Back to the title's read.
		await t.mutation(api.yugioh.listings.setListingCondition, {
			listingId: id,
			condition: null,
		});
		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
	});

	test("wins over the title's read in the Deal grade and Below minimum", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const [listing] = await capture(t, { price: 30 });
		const id = await idOf(t, listing as string);
		expect(await dealFor(t, deckId, listing as string)).toMatchObject({
			qualifying: true,
			belowCondition: false,
			grade: "great",
		});

		await t.mutation(api.yugioh.listings.setListingCondition, {
			listingId: id,
			condition: "heavilyPlayed",
		});
		expect(await dealFor(t, deckId, listing as string)).toMatchObject({
			qualifying: false,
			belowCondition: true,
			grade: null,
		});

		// "Not stated" counts, like a title that doesn't say.
		await t.mutation(api.yugioh.listings.setListingCondition, {
			listingId: id,
			condition: "notStated",
		});
		expect(await dealFor(t, deckId, listing as string)).toMatchObject({
			qualifying: true,
			belowCondition: false,
			grade: "great",
		});
	});

	test("filters and sorts by the condition I set", async () => {
		const t = setup();
		const deckId = await ashDeck(t, "heavilyPlayed");
		const [nm, set] = await capture(t, { price: 30 }, { price: 31 });
		await t.mutation(api.yugioh.listings.setListingCondition, {
			listingId: await idOf(t, set as string),
			condition: "moderatelyPlayed",
		});
		const page = await t.query(api.yugioh.listings.listListings, {
			deckId,
			now: NOW,
			filters: { condition: "moderatelyPlayed" },
		});
		expect(page.listings.map((l) => l.itemId)).toEqual([set]);
		const sorted = await t.query(api.yugioh.listings.listListings, {
			deckId,
			now: NOW,
			sort: { key: "condition", direction: "desc" },
		});
		expect(sorted.listings.map((l) => l.itemId)).toEqual([set, nm]);
	});
});

describe("Copies set by me", () => {
	async function idOf(t: T, itemId: string) {
		return await t.run(async (ctx) => {
			const listing = await ctx.db
				.query("yugiohListings")
				.withIndex("by_marketplace_and_itemId", (q) =>
					q.eq("marketplace", "ebay").eq("itemId", itemId),
				)
				.unique();
			if (!listing) throw new Error(`missing Listing ${itemId}`);
			return listing._id;
		});
	}

	async function viewOf(t: T, deckId: Id<"yugiohDecks">, itemId: string) {
		const listing = (await listings(t, deckId)).find(
			(l) => l.itemId === itemId,
		);
		if (!listing) throw new Error(`missing view ${itemId}`);
		return listing;
	}

	test("divide the Per-copy price, and the Deal grade follows", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const [lot] = await capture(t, { price: 60 });
		const id = await idOf(t, lot as string);
		expect((await viewOf(t, deckId, lot as string)).perCopyPrice).toMatchObject(
			{ copies: 1, perCopy: 60 },
		);

		await t.mutation(api.yugioh.listings.setListingCopies, {
			listingId: id,
			copies: 2,
		});
		const view = await viewOf(t, deckId, lot as string);
		expect(view.copiesOverride).toBe(2);
		expect(view.perCopyPrice).toMatchObject({ copies: 2, perCopy: 30 });
		expect(view.deal).toMatchObject({ percentOfReference: 60, grade: "great" });
	});

	test("win over the title's read in the Reference price, through recaptures and re-reads", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [, , , misread] = await capture(
			t,
			sold(40),
			sold(50),
			sold(60),
			sold(90, { read: { copies: 3 } }),
		);
		// Read as a lot of three: $30 a copy.
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });

		const id = await idOf(t, misread as string);
		await t.mutation(api.yugioh.listings.setListingCopies, {
			listingId: id,
			copies: 1,
		});
		expect(await ashReference(t, deckId)).toEqual({ price: 55, sales: 4 });

		// Captured again as is, then with a changed title the AI reads again.
		await capture(t, sold(90, { itemId: misread, read: { copies: 3 } }));
		await capture(
			t,
			sold(90, {
				itemId: misread,
				title: "Ash Blossom RA01-EN008 QCSR x3",
				read: { copies: 3 },
			}),
		);
		const view = await viewOf(t, deckId, misread as string);
		expect(view.titleRead?.copies).toBe(3);
		expect(view.copiesOverride).toBe(1);
		expect(view.perCopyPrice).toMatchObject({ copies: 1, perCopy: 90 });
		expect(await ashReference(t, deckId)).toEqual({ price: 55, sales: 4 });

		// Back to the title's read.
		await t.mutation(api.yugioh.listings.setListingCopies, {
			listingId: id,
			copies: null,
		});
		expect((await viewOf(t, deckId, misread as string)).copiesOverride).toBe(
			null,
		);
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });
	});

	test("are 1, 2 or 3", async () => {
		const t = setup();
		await ashDeck(t);
		const [listing] = await capture(t, { price: 60 });
		const id = await idOf(t, listing as string);
		await expect(
			t.mutation(api.yugioh.listings.setListingCopies, {
				listingId: id,
				copies: 4 as 3,
			}),
		).rejects.toThrow();
	});
});

describe("Rarity from the row", () => {
	async function idOf(t: T, itemId: string) {
		return await t.run(async (ctx) => {
			const listing = await ctx.db
				.query("yugiohListings")
				.withIndex("by_marketplace_and_itemId", (q) =>
					q.eq("marketplace", "ebay").eq("itemId", itemId),
				)
				.unique();
			if (!listing) throw new Error(`missing Listing ${itemId}`);
			return listing._id;
		});
	}

	/** My Secret Rare Printing of RA01-EN008, wanted by no Deck. */
	async function secretRare(t: T) {
		return await t.run(async (ctx) => {
			const qcsr = await ctx.db
				.query("yugiohPrintings")
				.withIndex("by_setCode_and_rarity", (q) =>
					q.eq("setCode", "RA01-EN008"),
				)
				.unique();
			if (!qcsr) throw new Error("missing QCSR Printing");
			await ctx.db.patch("yugiohPrintings", qcsr._id, {
				overloadedRarities: ["Platinum Secret Rare"],
			});
			const secret = await ctx.db.insert("yugiohPrintings", {
				cardName: "Ash Blossom & Joyous Spring",
				setCode: "RA01-EN008",
				rarity: "Secret Rare",
				overloadedRarities: [],
			});
			return { qcsr: qcsr._id, secret };
		});
	}

	test("offers my Printings under the set code, then Overloaded rarities I have none of", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const [listing] = await capture(t, { price: 30 });
		const { qcsr, secret } = await secretRare(t);
		const view = (await listings(t, deckId)).find((l) => l.itemId === listing);
		expect(view?.rarityChoices).toEqual([
			{ rarity: "Quarter Century Secret Rare", printingId: qcsr, needed: true },
			{ rarity: "Secret Rare", printingId: secret, needed: false },
			{ rarity: "Platinum Secret Rare", printingId: null, needed: false },
		]);
	});

	test("choosing another Printing re-matches it, prices follow, a recapture keeps it, and undo puts the AI's match back", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, sold(40), sold(50), sold(60));
		const [wrong] = await capture(t, sold(5));
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });
		const { qcsr, secret } = await secretRare(t);
		const id = await idOf(t, wrong as string);

		await t.mutation(api.yugioh.listings.setListingMatch, {
			listingId: id,
			printingId: secret,
		});
		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });
		await capture(t, sold(5, { itemId: wrong }));
		const table = await t.query(api.yugioh.listings.listListings, {
			deckId,
			now: NOW,
			filters: { view: "sold" },
		});
		// Not a Printing the Deck needs, so it leaves the table.
		expect(table.listings.map((l) => l.itemId)).not.toContain(wrong);
		expect(await ashReference(t, deckId)).toEqual({ price: 50, sales: 3 });

		await t.mutation(api.yugioh.listings.setListingMatch, {
			listingId: id,
			printingId: qcsr,
			overridden: false,
		});
		const restored = await t.run(async (ctx) =>
			ctx.db.get("yugiohListings", id),
		);
		expect(restored).toMatchObject({
			matchStatus: "match",
			matchedPrintingId: qcsr,
			matchOverridden: false,
		});
		expect(await ashReference(t, deckId)).toEqual({ price: 45, sales: 4 });
	});
});

test("setting a condition and a match is public", async () => {
	const listings = (await import("./listings")) as Record<
		string,
		{ isInternal?: boolean; isPublic?: boolean }
	>;
	expect(listings.setListingCondition?.isPublic).toBe(true);
	expect(listings.setListingCopies?.isPublic).toBe(true);
	expect(listings.setListingMatch?.isPublic).toBe(true);
});

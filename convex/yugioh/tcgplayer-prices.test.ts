/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: TCGplayer product pages captured by the extension, and what they do
// to Reference prices, Deal grades, the buy-now floor and cost to finish.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// eBay titles read as raw, English, Near Mint singles. TCGplayer's product
// lookup finds nothing, so Ash's product URL is pasted, and TCGplayer
// confirms that product is Ash.
vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (): Promise<TitleJudgments> => ({
		setCode: null,
		rarity: null,
		condition: "nearMint",
		copies: 1,
		language: "english",
		graded: false,
		gradingCompany: null,
	}),
}));

vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async () => [],
	fetchTcgplayerProduct: async (productId: number) => ({
		productId,
		productName: "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
		setName: "25th Anniversary Rarity Collection",
		rarityName: "Quarter Century Secret Rare",
		setCode: "RA01-EN008",
		productUrl: `https://www.tcgplayer.com/product/${productId}/x`,
	}),
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 12, 0);

const ASH = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "RA01-EN008",
	rarity: "Quarter Century Secret Rare",
	productId: 524817,
	productUrl:
		"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
};

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** A Deck wanting 3 Copies of Ash, its TCGplayer product URL pasted. */
async function ashDeck(
	t: T,
	{
		condition = "nearMint",
		copiesOwned = 0,
	}: {
		condition?: "nearMint" | "lightlyPlayed";
		copiesOwned?: number;
	} = {},
): Promise<{
	deckId: Id<"yugiohDecks">;
	deckCardId: Id<"yugiohDeckCards">;
	printingId: Id<"yugiohPrintings">;
}> {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Snake-Eye",
	});
	const deckCardId = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName: ASH.cardName,
		section: "main",
		copiesNeeded: 3,
		setCode: ASH.setCode,
		rarity: ASH.rarity,
		overloadedRarities: [],
	});
	await t.mutation(api.yugioh.decks.updateCard, {
		deckCardId,
		lowestAcceptableCondition: condition,
		...(copiesOwned > 0 ? { copiesOwned } : {}),
	});
	await settle(t);
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const printingId = deck?.sections[0]?.cards[0]?.candidates[0]?.printingId;
	if (!printingId) throw new Error("missing Printing");
	await t.action(api.yugioh.tcgplayer.setProductUrl, {
		printingId,
		url: ASH.productUrl,
	});
	return { deckId, deckCardId, printingId };
}

type TcgplayerListing = {
	listingId: string;
	seller: string;
	condition: string;
	price: number;
	shipping: number | null;
	quantity: number | null;
	customTitle: string | null;
};

type TcgplayerSale = {
	soldDate: string;
	condition: string;
	quantity: number;
	price: number;
	shipping: number | null;
	customTitle: string | null;
};

let nextListingId = 1;

/** A current Listing, Near Mint with free shipping unless overridden. */
function offer(
	price: number,
	extra: Partial<TcgplayerListing> = {},
): TcgplayerListing {
	const id = nextListingId++;
	return {
		listingId: `listing-${id}`,
		seller: `Seller ${id}`,
		condition: "Near Mint 1st Edition",
		price,
		shipping: 0,
		quantity: 1,
		customTitle: null,
		...extra,
	};
}

/** A latest sale, Near Mint, `daysAgo` days before NOW (5 by default). */
function sale(
	price: number,
	{ daysAgo = 5, ...extra }: Partial<TcgplayerSale> & { daysAgo?: number } = {},
): TcgplayerSale {
	return {
		soldDate: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10),
		condition: "Near Mint 1st Edition",
		quantity: 1,
		price,
		shipping: null,
		customTitle: null,
		...extra,
	};
}

/** Sends one TCGplayer product page, as the extension reads it. */
async function captureProduct(
	t: T,
	{
		listings = [],
		sales = [],
		productId = ASH.productId,
		listingsFromCheapest = true,
	}: {
		listings?: TcgplayerListing[];
		sales?: TcgplayerSale[];
		productId?: number;
		listingsFromCheapest?: boolean;
	},
) {
	const res = await t.fetch("/server/yugioh/tcgplayer-product", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify({
			product: {
				productId,
				url: `https://www.tcgplayer.com/product/${productId}/some-slug`,
				listingsFromCheapest,
				listings,
				sales,
			},
		}),
	});
	expect(res.status).toBe(200);
	await settle(t);
	return await res.json();
}

let nextEbayId = 306700000000;

/** eBay Listings whose titles carry Ash's set code. */
async function captureEbay(
	t: T,
	...listings: Array<{ price: number } & Record<string, unknown>>
): Promise<string[]> {
	const body = listings.map((fields) => {
		const id = String(nextEbayId++);
		return {
			itemId: id,
			url: `https://www.ebay.com/itm/${id}`,
			title: `Yugioh ${ASH.setCode} Quarter Century Secret Rare #${id}`,
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
	return body.map((listing) => listing.itemId);
}

function ebaySold(price: number) {
	return {
		price,
		sold: true,
		soldDate: new Date(NOW - 5 * DAY).toISOString().slice(0, 10),
	};
}

async function ashPrices(t: T, deckId: Id<"yugiohDecks">) {
	const prices = await t.query(api.yugioh.deals.listReferencePrices, {
		deckId,
		now: NOW,
	});
	expect(prices).toHaveLength(1);
	const [ash] = prices;
	if (!ash) throw new Error("missing prices");
	return ash;
}

async function deckListings(t: T, deckId: Id<"yugiohDecks">) {
	const page = await t.query(api.yugioh.listings.listListings, {
		deckId,
		now: NOW,
	});
	return page.listings;
}

async function ashCost(t: T, deckId: Id<"yugiohDecks">) {
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId, now: NOW });
	return deck?.sections[0]?.cards[0]?.cost;
}

describe("capture", () => {
	test("stores a product page's Listings and sales under its Printing", async () => {
		const t = setup();
		const { deckId, printingId } = await ashDeck(t);
		const report = await captureProduct(t, {
			listings: [
				offer(41.5, {
					seller: "Card Castle",
					shipping: 1.31,
					quantity: 3,
					condition: "Lightly Played 1st Edition",
				}),
			],
			sales: [sale(44)],
		});

		expect(report).toMatchObject({
			printing: { cardName: ASH.cardName, setCode: ASH.setCode },
			listings: 1,
			sales: 1,
			created: 2,
			updated: 0,
		});
		const shown = await deckListings(t, deckId);
		expect(shown).toHaveLength(2);
		const forSale = shown.find((listing) => !listing.sold);
		expect(forSale).toMatchObject({
			marketplace: "tcgplayer",
			price: 41.5,
			shipping: 1.31,
			currency: "USD",
			listingType: "buyItNow",
			url: ASH.productUrl,
			tcgplayer: {
				seller: "Card Castle",
				condition: "Lightly Played 1st Edition",
				quantity: 3,
			},
			titleRead: { condition: "lightlyPlayed", language: "english" },
			match: { status: "match", printing: { _id: printingId } },
		});
		expect(forSale?.perCopyPrice?.perCopy).toBe(42.81);
		expect(shown.find((listing) => listing.sold)).toMatchObject({
			marketplace: "tcgplayer",
			sold: true,
			price: 44,
		});
	});

	test("seeing the page again updates its Listings and sales instead of duplicating them", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const listing = offer(41.5);
		const sales = [sale(44), sale(44), sale(46, { daysAgo: 6 })];
		await captureProduct(t, { listings: [listing], sales });
		const again = await captureProduct(t, {
			listings: [{ ...listing, price: 39 }],
			sales: [sale(47, { daysAgo: 1 }), ...sales],
		});

		expect(again).toMatchObject({ created: 1, updated: 4 });
		const shown = await deckListings(t, deckId);
		expect(shown).toHaveLength(5);
		expect(shown.filter((l) => !l.sold).map((l) => l.price)).toEqual([39]);
	});

	test("a Listing or sale with photos is unsure, so it doesn't count until I match it", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, {
			listings: [
				offer(20, {
					customTitle: "Korean Ash Blossom Alt Art Quarter Century Rare",
				}),
			],
			sales: [
				sale(40),
				sale(45),
				sale(150, { customTitle: "CGC 8.5 Ash Blossom QCSR" }),
			],
		});

		const shown = await deckListings(t, deckId);
		const custom = shown.filter((l) => l.match.status === "unsure");
		expect(custom.map((l) => l.title).sort()).toEqual([
			"CGC 8.5 Ash Blossom QCSR",
			"Korean Ash Blossom Alt Art Quarter Century Rare",
		]);
		const prices = await ashPrices(t, deckId);
		expect(prices.tcgplayer).toEqual({ price: null, sales: 2 });
		expect(prices.tcgplayerBuyNow).toBeNull();
	});

	test("a Listing that gains photos becomes unsure", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const listing = offer(41);
		await captureProduct(t, { listings: [listing] });
		await captureProduct(t, {
			listings: [{ ...listing, customTitle: "CGC 9 Ash Blossom" }],
		});

		const [shown] = await deckListings(t, deckId);
		expect(shown?.match.status).toBe("unsure");
		expect(shown?.title).toBe("CGC 9 Ash Blossom");
	});

	test("adding a Printing on the same set code doesn't re-match TCGplayer Listings", async () => {
		const t = setup();
		const { deckId, deckCardId } = await ashDeck(t);
		await captureProduct(t, {
			listings: [offer(20, { customTitle: "Korean Ash Blossom Alt Art" })],
		});
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			setCode: ASH.setCode,
			rarity: "Super Rare",
			overloadedRarities: [],
		});
		await settle(t);

		const [custom] = await deckListings(t, deckId);
		expect(custom?.match.status).toBe("unsure");
	});

	test("a product none of my Printings has is reported and not stored", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		const report = await captureProduct(t, {
			productId: 999,
			listings: [offer(10)],
			sales: [sale(10)],
		});

		expect(report).toMatchObject({ printing: null, created: 0 });
		expect(await deckListings(t, deckId)).toHaveLength(0);
	});

	test("a Printing whose URL was saved before capture existed is found once backfilled", async () => {
		const t = setup();
		const { deckId, printingId } = await ashDeck(t);
		await t.run(async (ctx) => {
			await ctx.db.patch("yugiohPrintings", printingId, {
				tcgplayerProductId: undefined,
			});
		});
		expect(
			(await captureProduct(t, { sales: [sale(40)] })).printing,
		).toBeNull();

		const result = await t.mutation(
			internal.yugioh.tcgplayer.backfillTcgplayerProductIds,
			{ paginationOpts: { numItems: 50, cursor: null } },
		);
		expect(result).toMatchObject({ updated: 1, isDone: true });
		await captureProduct(t, { sales: [sale(40)] });
		expect(await deckListings(t, deckId)).toHaveLength(1);
	});

	test("the capture endpoint needs the server secret", async () => {
		const t = setup();
		const res = await t.fetch("/server/yugioh/tcgplayer-product", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ product: {} }),
		});
		expect(res.status).toBe(401);
	});
});

describe("TCGplayer Reference price", () => {
	test("is the median of Qualifying sales in the last 60 days", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, {
			sales: [
				sale(40),
				sale(50, { shipping: 2 }),
				sale(60),
				sale(10, { daysAgo: 61 }),
			],
		});

		expect((await ashPrices(t, deckId)).tcgplayer).toEqual({
			price: 52,
			sales: 3,
		});
	});

	test("only counts sales at or above the Card's Lowest acceptable condition", async () => {
		const t = setup();
		const { deckId, deckCardId } = await ashDeck(t);
		await captureProduct(t, {
			sales: [
				sale(40),
				sale(50),
				sale(20, { condition: "Lightly Played 1st Edition" }),
				sale(25, { condition: "Moderately Played 1st Edition" }),
			],
		});
		expect((await ashPrices(t, deckId)).tcgplayer).toEqual({
			price: null,
			sales: 2,
		});

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			lowestAcceptableCondition: "lightlyPlayed",
		});
		expect((await ashPrices(t, deckId)).tcgplayer).toEqual({
			price: 40,
			sales: 3,
		});
	});

	test("is never blended with the eBay Reference price", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, { sales: [sale(40), sale(42), sale(44)] });
		await captureEbay(t, ebaySold(60), ebaySold(70), ebaySold(80));

		const prices = await ashPrices(t, deckId);
		expect(prices.ebay).toEqual({ price: 70, sales: 3 });
		expect(prices.tcgplayer).toEqual({ price: 42, sales: 3 });
	});
});

describe("TCGplayer buy-now floor", () => {
	test("is the cheapest current Qualifying Listing, shipping included", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, {
			listings: [
				offer(30, { condition: "Moderately Played 1st Edition" }),
				offer(41, { shipping: 4 }),
				offer(43),
				offer(50),
			],
		});

		expect((await ashPrices(t, deckId)).tcgplayerBuyNow).toBe(43);
	});

	test("Listings gone from the latest capture of the page don't count", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, { listings: [offer(35), offer(50)] });
		vi.setSystemTime(NOW + 60_000);
		await captureProduct(t, { listings: [offer(48)] });

		expect((await ashPrices(t, deckId)).tcgplayerBuyNow).toBe(48);
	});

	test("a capture of a later or filtered page doesn't retire the cheaper Listings", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, { listings: [offer(35), offer(50)] });
		vi.setSystemTime(NOW + 60_000);
		await captureProduct(t, {
			listings: [offer(60)],
			listingsFromCheapest: false,
		});

		expect((await ashPrices(t, deckId)).tcgplayerBuyNow).toBe(35);
	});

	test("a Qualifying Listing pricier than everything the latest capture showed still counts", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		// Page 2 was once open: a Near Mint copy at $55.
		await captureProduct(t, {
			listings: [offer(55)],
			listingsFromCheapest: false,
		});
		vi.setSystemTime(NOW + 60_000);
		// Page 1 now shows only cheaper played copies, so the $55 one is still there.
		await captureProduct(t, {
			listings: [
				offer(30, { condition: "Lightly Played 1st Edition" }),
				offer(35, { condition: "Moderately Played 1st Edition" }),
			],
		});

		expect((await ashPrices(t, deckId)).tcgplayerBuyNow).toBe(55);
	});

	test("a page with no Listings retires every one seen before", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, { listings: [offer(55)] });
		vi.setSystemTime(NOW + 60_000);
		await captureProduct(t, { sales: [sale(40)] });

		expect((await ashPrices(t, deckId)).tcgplayerBuyNow).toBeNull();
	});

	test("is null with nothing for sale", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, { sales: [sale(40)] });

		expect((await ashPrices(t, deckId)).tcgplayerBuyNow).toBeNull();
	});
});

describe("TCGplayer Deal grades", () => {
	test("TCGplayer Listings are graded against the TCGplayer Reference, eBay's against eBay's", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await captureProduct(t, {
			listings: [offer(40)],
			sales: [sale(45), sale(50), sale(55)],
		});
		const [ebayId] = await captureEbay(
			t,
			ebaySold(90),
			ebaySold(100),
			ebaySold(110),
			{ price: 80 },
		).then((ids) => ids.slice(3));

		const shown = await deckListings(t, deckId);
		const tcgplayer = shown.find(
			(l) => l.marketplace === "tcgplayer" && !l.sold,
		);
		const ebay = shown.find((l) => l.itemId === ebayId);
		expect(tcgplayer?.deal).toMatchObject({
			reference: { price: 50, sales: 3 },
			grade: "great",
			percentOfReference: 80,
		});
		expect(ebay?.deal).toMatchObject({
			reference: { price: 100, sales: 3 },
			grade: "great",
			percentOfReference: 80,
		});
	});
});

describe("cost to finish with TCGplayer", () => {
	test("uses the lower of the two Reference prices", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t, { copiesOwned: 1 });
		await captureEbay(t, ebaySold(60), ebaySold(70), ebaySold(80));
		await captureProduct(t, { sales: [sale(40), sale(45), sale(50)] });
		expect((await ashCost(t, deckId))?.toFinish).toBe(90);

		await captureProduct(t, {
			sales: [sale(90, { daysAgo: 1 }), sale(95, { daysAgo: 2 })],
		});
		// TCGplayer's median rises to 50; eBay's 70 is still higher.
		expect((await ashCost(t, deckId))?.toFinish).toBe(100);
	});

	test("an eBay Reference alone still prices the Card", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t, { copiesOwned: 1 });
		await captureEbay(t, ebaySold(60), ebaySold(70), ebaySold(80));
		await captureProduct(t, { sales: [sale(20), sale(30)] });

		expect((await ashCost(t, deckId))?.toFinish).toBe(140);
	});

	test("the buy-now total takes the cheaper of eBay's and TCGplayer's floors", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t, { copiesOwned: 1 });
		await captureEbay(t, { price: 55 });
		await captureProduct(t, { listings: [offer(48)] });
		expect((await ashCost(t, deckId))?.buyNow).toBe(96);

		await captureEbay(t, { price: 45 });
		expect((await ashCost(t, deckId))?.buyNow).toBe(90);
	});
});

describe("changing a Printing's TCGplayer link", () => {
	const OTHER_PRODUCT_ID = 600001;
	const OTHER_PRODUCT_URL = ASH.productUrl.replace(
		String(ASH.productId),
		String(OTHER_PRODUCT_ID),
	);

	test("the old product's sales and Listings stop counting toward the Reference price and floor", async () => {
		const t = setup();
		const { deckId, printingId } = await ashDeck(t);
		await captureProduct(t, {
			listings: [offer(30)],
			sales: [sale(40), sale(42), sale(44)],
		});
		expect(await ashPrices(t, deckId)).toMatchObject({
			tcgplayer: { price: 42, sales: 3 },
			tcgplayerBuyNow: 30,
		});

		await t.action(api.yugioh.tcgplayer.setProductUrl, {
			printingId,
			url: OTHER_PRODUCT_URL,
		});
		expect(await ashPrices(t, deckId)).toMatchObject({
			tcgplayer: { price: null, sales: 0 },
			tcgplayerBuyNow: null,
		});

		vi.setSystemTime(NOW + 60_000);
		await captureProduct(t, {
			productId: OTHER_PRODUCT_ID,
			listings: [offer(55)],
			sales: [sale(60), sale(62), sale(64)],
		});
		expect(await ashPrices(t, deckId)).toMatchObject({
			tcgplayer: { price: 62, sales: 3 },
			tcgplayerBuyNow: 55,
		});
	});
});

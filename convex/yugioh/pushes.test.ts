/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The AI, TCGplayer and the push service are faked. Each title's read is
// whatever `fakes.reads` says for it, else a raw, English, Near Mint single.
// Every push "sent" lands in `fakes.sent`; `fakes.respond` answers for an
// endpoint (sent by default).
type Outcome =
	| { status: "sent" }
	| { status: "gone" }
	| { status: "failed"; reason: string };

const fakes = vi.hoisted(() => ({
	reads: new Map<string, Partial<TitleJudgments>>(),
	sent: [] as Array<{
		at: number;
		endpoint: string;
		payload: { title: string; body: string; url: string; tag: string };
		options: { ttlSeconds: number; urgency: string; topic: string | null };
	}>,
	respond: (_endpoint: string): Outcome => ({ status: "sent" }),
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

vi.mock("../model/yugioh/webPushSender", () => ({
	sendWebPush: async (
		subscription: { endpoint: string },
		payload: string,
		options: { ttlSeconds: number; urgency: string; topic: string | null },
	): Promise<Outcome> => {
		fakes.sent.push({
			at: Date.now(),
			endpoint: subscription.endpoint,
			payload: JSON.parse(payload),
			options,
		});
		return fakes.respond(subscription.endpoint);
	},
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** 12:00 UTC: 6am in Denver, 8am in New York. */
const NOW = Date.UTC(2026, 9, 20, 12, 0);

const PHONE = "https://web.push.apple.com/phone";
const LAPTOP = "https://fcm.googleapis.com/fcm/send/laptop";

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	fakes.reads = new Map();
	fakes.sent = [];
	fakes.respond = () => ({ status: "sent" });
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Turns push on for a device, in a time zone where NOW is daytime by default. */
async function turnOn(
	t: T,
	endpoint = PHONE,
	timeZone = "America/New_York",
): Promise<void> {
	await t.mutation(api.yugioh.pushes.savePushSubscription, {
		endpoint,
		keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
		timeZone,
	});
}

/** A Deck wanting Ash Blossom in RA01-EN008 Quarter Century Secret Rare. */
async function ashDeck(
	t: T,
	{
		name = "Snake-Eye",
		copiesOwned = 0,
	}: { name?: string; copiesOwned?: number } = {},
): Promise<{ deckId: Id<"yugiohDecks">; deckCardId: Id<"yugiohDeckCards"> }> {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, { name });
	const deckCardId = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName: "Ash Blossom & Joyous Spring",
		section: "main",
		copiesNeeded: 3,
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
		overloadedRarities: [],
	});
	if (copiesOwned > 0) {
		await t.mutation(api.yugioh.decks.updateCard, { deckCardId, copiesOwned });
	}
	await settle(t);
	return { deckId, deckCardId };
}

let nextItemId = 406500000000;

type Capture = {
	/** Price in dollars, free shipping from the US unless overridden. */
	price: number;
	/** What the AI reads from the title, on top of a raw English NM single. */
	read?: Partial<TitleJudgments>;
	title?: string;
	itemId?: string;
} & Record<string, unknown>;

/** Captures eBay results for Ash Blossom, then lets everything scheduled run. */
async function capture(t: T, ...listings: Capture[]): Promise<string[]> {
	const itemIds = await post(t, ...listings);
	await settle(t);
	return itemIds;
}

/**
 * Captures eBay results and runs only what's due in the next few seconds
 * (title reads, deal checks), not pushes held for later.
 */
async function captureNow(t: T, ...listings: Capture[]): Promise<string[]> {
	const itemIds = await post(t, ...listings);
	for (let i = 0; i < 5; i++) {
		vi.advanceTimersByTime(1000);
		await t.finishInProgressScheduledFunctions();
	}
	return itemIds;
}

async function post(t: T, ...listings: Capture[]): Promise<string[]> {
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
	return itemIds;
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

/** Three sales giving Ash Blossom a $50 eBay Reference price. */
async function fiftyDollarReference(t: T): Promise<void> {
	await capture(t, sold(45), sold(50), sold(55));
}

async function listingId(t: T, itemId: string): Promise<Id<"yugiohListings">> {
	const id = await t.run(async (ctx) => {
		const listing = await ctx.db
			.query("yugiohListings")
			.withIndex("by_marketplace_and_itemId", (q) =>
				q.eq("marketplace", "ebay").eq("itemId", itemId),
			)
			.unique();
		return listing?._id ?? null;
	});
	if (id === null) throw new Error(`No Listing ${itemId}`);
	return id;
}

describe("deal pushes", () => {
	test("a new Great Listing on a Card I still need is pushed to every device", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t, PHONE);
		await turnOn(t, LAPTOP);

		const [itemId] = await capture(t, { price: 39 });

		const id = await listingId(t, itemId as string);
		expect(fakes.sent.map((push) => push.endpoint).sort()).toEqual(
			[LAPTOP, PHONE].sort(),
		);
		expect(fakes.sent[0]?.payload).toEqual({
			title: "Great deal: Ash Blossom & Joyous Spring QCSR",
			body: "$39.00 a copy, 78% of $50 ref · eBay, buy it now",
			url: `/yugioh/decks/${deckId}/listings?listing=${id}`,
			tag: `deal-${id}`,
		});
		expect(fakes.sent[0]?.options).toMatchObject({ urgency: "normal" });
	});
	test("a Good deal is pushed; Fair and Poor ones aren't", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t);

		await capture(t, { price: 47 }, { price: 52 }, { price: 70 });

		expect(fakes.sent.map((push) => push.payload.title)).toEqual([
			"Good deal: Ash Blossom & Joyous Spring QCSR",
		]);
		expect(fakes.sent[0]?.payload.body).toBe(
			"$47.00 a copy, 94% of $50 ref · eBay, buy it now",
		);
	});

	test("only Qualifying Listings: not graded, not another language, not below my condition", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t);

		await capture(
			t,
			{ price: 30, read: { graded: true, gradingCompany: "PSA" } },
			{
				price: 30,
				title: "Ash Blossom RA01-JP008 Quarter Century Secret Rare",
			},
			{ price: 30, read: { condition: "lightlyPlayed" } },
		);

		expect(fakes.sent).toEqual([]);
	});

	test("no push without a Reference price, for an auction, or for a sale", async () => {
		const t = setup();
		await ashDeck(t);
		await turnOn(t);
		await capture(t, { price: 20 });
		expect(fakes.sent).toEqual([]);

		await fiftyDollarReference(t);
		await capture(
			t,
			{ price: 20, listingType: "auction", bids: 1, endsAt: NOW + HOUR },
			sold(20),
		);
		expect(fakes.sent).toEqual([]);
	});

	test("no push for a Card I own enough Copies of, or one whose Chosen Printing is another", async () => {
		const t = setup();
		const { deckId, deckCardId } = await ashDeck(t, { copiesOwned: 3 });
		await fiftyDollarReference(t);
		await turnOn(t);
		await capture(t, { price: 30 });
		expect(fakes.sent).toEqual([]);

		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId,
			copiesOwned: 1,
		});
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId,
			setCode: "MP23-EN001",
			rarity: "Starlight Rare",
			overloadedRarities: [],
		});
		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		const other = deck?.sections[0]?.cards[0]?.candidates.find(
			(candidate) => candidate.setCode === "MP23-EN001",
		);
		if (!other) throw new Error("missing Printing");
		await t.mutation(api.yugioh.decks.choosePrinting, {
			deckCardId,
			printingId: other.printingId,
		});
		await settle(t);
		await capture(t, { price: 30 });
		expect(fakes.sent).toEqual([]);
	});

	test("pushes a Listing once, even when its title changes and is read again", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t);

		const [itemId] = await capture(t, { price: 39 });
		await capture(t, {
			itemId,
			price: 38,
			title: "Ash Blossom RA01-EN008 QCSR NM",
		});

		expect(fakes.sent).toHaveLength(1);
	});

	test("matching a Listing myself pushes it while it's new, not once it's a day old", async () => {
		const t = setup();
		const { deckId } = await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t);
		const [fresh, old] = await capture(
			t,
			{ price: 39, title: "Ash Blossom QCSR quarter century" },
			{ price: 39, title: "Ash Blossom QCSR 25th" },
		);
		expect(fakes.sent).toEqual([]);
		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		const printingId = deck?.sections[0]?.cards[0]?.candidates[0]?.printingId;
		if (!printingId) throw new Error("missing Printing");

		await t.mutation(api.yugioh.listings.setListingMatch, {
			listingId: await listingId(t, fresh as string),
			printingId,
		});
		await settle(t);
		expect(fakes.sent).toHaveLength(1);

		vi.setSystemTime(NOW + 25 * HOUR);
		await t.mutation(api.yugioh.listings.setListingMatch, {
			listingId: await listingId(t, old as string),
			printingId,
		});
		await settle(t);
		expect(fakes.sent).toHaveLength(1);
	});

	test("opens the Deck I viewed most recently when two Decks need the Card", async () => {
		const t = setup();
		const { deckId: first } = await ashDeck(t, { name: "Snake-Eye" });
		const { deckId: second } = await ashDeck(t, { name: "Yubel" });
		await t.mutation(api.yugioh.decks.recordDeckVisit, { deckId: second });
		vi.setSystemTime(NOW + 60 * 1000);
		await t.mutation(api.yugioh.decks.recordDeckVisit, { deckId: first });
		await fiftyDollarReference(t);
		await turnOn(t);

		await capture(t, { price: 39 });

		expect(fakes.sent).toHaveLength(1);
		expect(fakes.sent[0]?.payload.url).toMatch(
			new RegExp(`^/yugioh/decks/${first}/listings\\?listing=`),
		);
	});

	test("a new TCGplayer Listing can be a deal too, but not on the product page's first capture", async () => {
		const t = setup();
		await ashDeck(t);
		await t.run(async (ctx) => {
			const printing = await ctx.db
				.query("yugiohPrintings")
				.withIndex("by_setCode_and_rarity", (q) =>
					q.eq("setCode", "RA01-EN008"),
				)
				.unique();
			if (!printing) throw new Error("missing Printing");
			await ctx.db.patch("yugiohPrintings", printing._id, {
				tcgplayerStatus: "found",
				tcgplayerProductId: 600001,
				tcgplayerProductUrl:
					"https://www.tcgplayer.com/product/600001/yugioh-ra01-ash-blossom-qcsr",
			});
		});
		await turnOn(t);
		const sale = (price: number) => ({
			soldDate: new Date(NOW - 5 * DAY).toISOString().slice(0, 10),
			condition: "Near Mint 1st Edition",
			quantity: 1,
			price,
			shipping: null,
			customTitle: null,
		});
		const offer = (listingId: string, price: number) => ({
			listingId,
			seller: `Seller ${listingId}`,
			condition: "Near Mint 1st Edition",
			price,
			shipping: 0,
			quantity: 1,
			customTitle: null,
		});
		async function captureProduct(listings: ReturnType<typeof offer>[]) {
			const res = await t.fetch("/server/yugioh/tcgplayer-product", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${SECRET}`,
				},
				body: JSON.stringify({
					product: {
						productId: 600001,
						url: "https://www.tcgplayer.com/product/600001/some-slug",
						listingsFromCheapest: true,
						listings,
						sales: [sale(45), sale(50), sale(55)],
					},
				}),
			});
			expect(res.status).toBe(200);
			await settle(t);
		}

		// The first capture finds Listings that were already there.
		await captureProduct([offer("listing-1", 39)]);
		expect(fakes.sent).toEqual([]);

		await captureProduct([offer("listing-1", 39), offer("listing-2", 40)]);
		expect(fakes.sent.map((push) => push.payload.body)).toEqual([
			"$40.00 a copy, 80% of $50 ref · TCGplayer, buy it now",
		]);
	});

	test("an eBay Listing listed days ago isn't new, even when first captured now", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t);

		await capture(t, { price: 39, listedAt: NOW - 3 * DAY });
		expect(fakes.sent).toEqual([]);

		await capture(t, { price: 39, listedAt: NOW - HOUR });
		expect(fakes.sent).toHaveLength(1);
	});
});

describe("quiet hours", () => {
	test("a deal found between 11pm and 8am is held, then delivered at 8am", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		// NOW is 6am in Denver.
		await turnOn(t, PHONE, "America/Denver");

		await captureNow(t, { price: 39 });
		expect(fakes.sent).toEqual([]);

		await settle(t);
		expect(fakes.sent).toHaveLength(1);
		// 8am in Denver (MDT) is 14:00 UTC.
		expect(fakes.sent[0]?.at).toBe(Date.UTC(2026, 9, 20, 14));
		expect(fakes.sent[0]?.payload.title).toBe(
			"Great deal: Ash Blossom & Joyous Spring QCSR",
		);
	});

	test("a held deal whose Listing sells before 8am isn't sent", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t, PHONE, "America/Denver");

		const [itemId] = await captureNow(t, { price: 39 });
		await captureNow(t, {
			itemId,
			price: 39,
			sold: true,
			soldDate: "2026-10-20",
		});
		await settle(t);

		expect(fakes.sent).toEqual([]);
	});

	test("in the day, a deal goes straight away", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		// NOW is 8am in New York.
		await turnOn(t, PHONE, "America/New_York");

		await captureNow(t, { price: 39 });

		expect(fakes.sent).toHaveLength(1);
	});
});

describe("devices", () => {
	test("with push off everywhere, nothing is pushed, even after turning it on later", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await capture(t, { price: 39 });

		await turnOn(t);
		await settle(t);

		expect(fakes.sent).toEqual([]);
	});

	test("turning push off on a device stops its pushes", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t, PHONE);
		await turnOn(t, LAPTOP);
		expect(
			await t.query(api.yugioh.pushes.hasPushSubscription, {
				endpoint: LAPTOP,
			}),
		).toBe(true);

		await t.mutation(api.yugioh.pushes.removePushSubscription, {
			endpoint: LAPTOP,
		});
		await capture(t, { price: 39 });

		expect(
			await t.query(api.yugioh.pushes.hasPushSubscription, {
				endpoint: LAPTOP,
			}),
		).toBe(false);
		expect(fakes.sent.map((push) => push.endpoint)).toEqual([PHONE]);
	});

	test("saving the same device again updates it rather than adding another", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t, PHONE, "America/Denver");
		await turnOn(t, PHONE, "America/New_York");

		await captureNow(t, { price: 39 });

		// New York's 8am, not Denver's 6am: sent at once, to one device.
		expect(fakes.sent).toHaveLength(1);
	});

	test("a device the push service says is gone is removed; the others still get it", async () => {
		const t = setup();
		await ashDeck(t);
		await fiftyDollarReference(t);
		await turnOn(t, PHONE);
		await turnOn(t, LAPTOP);
		fakes.respond = (endpoint) =>
			endpoint === LAPTOP ? { status: "gone" } : { status: "sent" };

		await capture(t, { price: 39 });
		await capture(t, { price: 38 });

		expect(fakes.sent.map((push) => push.endpoint)).toEqual([
			expect.any(String),
			expect.any(String),
			PHONE,
		]);
		expect(
			await t.query(api.yugioh.pushes.hasPushSubscription, {
				endpoint: LAPTOP,
			}),
		).toBe(false);
	});

	test("only https push endpoints are accepted", async () => {
		const t = setup();
		await expect(
			t.mutation(api.yugioh.pushes.savePushSubscription, {
				endpoint: "http://example.com/push",
				keys: { p256dh: "a", auth: "b" },
				timeZone: "UTC",
			}),
		).rejects.toThrow(/push subscription endpoint/);
	});

	test("a test push reaches every device at any hour", async () => {
		const t = setup();
		await expect(
			t.mutation(api.yugioh.pushes.sendTestPush, {}),
		).rejects.toThrow(/Turn on alerts/);
		await turnOn(t, PHONE, "America/Denver");

		await t.mutation(api.yugioh.pushes.sendTestPush, {});
		await settle(t);

		expect(fakes.sent).toHaveLength(1);
		expect(fakes.sent[0]?.at).toBe(NOW);
		expect(fakes.sent[0]?.payload.url).toBe("/yugioh/settings");
	});
});

test("deal checks and deliveries aren't publicly callable", async () => {
	const fns = [
		internal.yugioh.pushes.checkDeal,
		internal.yugioh.pushes.claimDelivery,
		internal.yugioh.pushes.recordDelivery,
		internal.yugioh.pushDelivery.deliver,
	];
	expect(fns).toHaveLength(4);
	const pushes = (await import("./pushes")) as Record<
		string,
		{ isInternal?: boolean; isPublic?: boolean }
	>;
	const delivery = (await import("./pushDelivery")) as Record<
		string,
		{ isInternal?: boolean; isPublic?: boolean }
	>;
	for (const fn of [
		pushes.checkDeal,
		pushes.claimDelivery,
		pushes.recordDelivery,
		delivery.deliver,
	]) {
		expect(fn?.isInternal).toBe(true);
		expect(fn?.isPublic).not.toBe(true);
	}
});

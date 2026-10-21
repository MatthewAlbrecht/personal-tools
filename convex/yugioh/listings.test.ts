/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Root-relative so keys stay consistent from this subdirectory.
const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const CAPTURE_PATH = "/server/yugioh/ebay-listings";

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

/** One eBay result as the extension's page reader sends it. */
function ebayListing(overrides: Record<string, unknown> = {}) {
	return {
		itemId: "306512345678",
		url: "https://www.ebay.com/itm/306512345678",
		title:
			"Ash Blossom & Joyous Spring RA01-EN008 Quarter Century Secret Rare NM",
		imageUrl: "https://i.ebayimg.com/images/g/abc/s-l500.jpg",
		price: 42.15,
		currency: "USD",
		shipping: 4.99,
		listingType: "buyItNow",
		bids: null,
		endsAt: null,
		listedAt: Date.UTC(2026, 9, 19, 21, 2),
		sellerLocation: null,
		sold: false,
		soldDate: null,
		...overrides,
	};
}

function capture(
	t: T,
	listings: unknown[],
	headers: Record<string, string> = { authorization: `Bearer ${SECRET}` },
) {
	return t.fetch(CAPTURE_PATH, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify({ listings }),
	});
}

const decks = new WeakMap<T, Id<"yugiohDecks">>();

/** The Listings of a Deck that wants the Printing these titles are for. */
async function listings(t: T) {
	let deckId = decks.get(t);
	if (!deckId) {
		deckId = await t.mutation(api.yugioh.decks.createDeck, { name: "Ash" });
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName: "Ash Blossom & Joyous Spring",
			section: "main",
			copiesNeeded: 3,
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: [],
		});
		decks.set(t, deckId);
	}
	const page = await t.query(api.yugioh.listings.listListings, {
		deckId,
		now: Date.now(),
	});
	return page.listings;
}

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(Date.UTC(2026, 9, 20, 12, 0));
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

/** Matches captured Listings to the Deck's Printing by hand, as an override would. */
async function matchToPrinting(t: T, itemIds: string[]): Promise<void> {
	await listings(t);
	await t.run(async (ctx) => {
		const printing = await ctx.db.query("yugiohPrintings").first();
		if (!printing) throw new Error("missing Printing");
		for (const itemId of itemIds) {
			const listing = await ctx.db
				.query("yugiohListings")
				.withIndex("by_marketplace_and_itemId", (q) =>
					q.eq("marketplace", "ebay").eq("itemId", itemId),
				)
				.unique();
			if (!listing) throw new Error(`missing Listing ${itemId}`);
			await ctx.db.patch("yugiohListings", listing._id, {
				matchStatus: "match",
				matchedPrintingId: printing._id,
				matchOverridden: true,
			});
		}
	});
}

describe("auctions without an end time", () => {
	test("a capture counts the matched running auctions its page showed no time left for", async () => {
		const t = setup();
		const auction = (itemId: string, endsAt: number | null) =>
			ebayListing({
				itemId,
				url: `https://www.ebay.com/itm/${itemId}`,
				listingType: "auction",
				bids: 2,
				endsAt,
			});
		const page = [
			auction("1", null),
			auction("2", Date.now() + 3_600_000),
			auction("3", null),
			ebayListing({ itemId: "4", url: "https://www.ebay.com/itm/4" }),
		];
		await capture(t, page);
		// 1, 2 and 4 are matched to a Printing; 3 isn't.
		await matchToPrinting(t, ["1", "2", "4"]);

		const res = await capture(t, page);

		expect(await res.json()).toMatchObject({ auctionsWithoutEndTime: 1 });
	});

	test("an end time from an earlier page doesn't hide that this page had none", async () => {
		const t = setup();
		const withEnd = ebayListing({
			listingType: "auction",
			bids: 1,
			endsAt: Date.now() + 3_600_000,
		});
		await capture(t, [withEnd]);
		await matchToPrinting(t, [withEnd.itemId as string]);

		const res = await capture(t, [{ ...withEnd, endsAt: null }]);

		expect(await res.json()).toMatchObject({ auctionsWithoutEndTime: 1 });
	});

	test("sold auctions don't count", async () => {
		const t = setup();
		const sold = ebayListing({
			listingType: "auction",
			bids: 4,
			sold: true,
			soldDate: "2026-10-19",
		});
		await capture(t, [sold]);
		await matchToPrinting(t, [sold.itemId as string]);

		const res = await capture(t, [sold]);

		expect(await res.json()).toMatchObject({ auctionsWithoutEndTime: 0 });
	});
});

describe("eBay capture", () => {
	test("a captured result becomes a Listing", async () => {
		const t = setup();
		const res = await capture(t, [ebayListing()]);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			captured: 1,
			created: 1,
			updated: 0,
			auctionsWithoutEndTime: 0,
			listingsPage: null,
		});

		const [listing, ...rest] = await listings(t);
		expect(rest).toEqual([]);
		expect(listing).toMatchObject({
			marketplace: "ebay",
			itemId: "306512345678",
			url: "https://www.ebay.com/itm/306512345678",
			title:
				"Ash Blossom & Joyous Spring RA01-EN008 Quarter Century Secret Rare NM",
			price: 42.15,
			currency: "USD",
			shipping: 4.99,
			listingType: "buyItNow",
			bids: null,
			endsAt: null,
			listedAt: Date.UTC(2026, 9, 19, 21, 2),
			sellerLocation: null,
			sold: false,
			soldDate: null,
			firstSeenAt: Date.UTC(2026, 9, 20, 12, 0),
			lastSeenAt: Date.UTC(2026, 9, 20, 12, 0),
		});
	});

	test("seeing a Listing again updates it instead of adding another", async () => {
		const t = setup();
		await capture(t, [ebayListing()]);
		vi.setSystemTime(Date.UTC(2026, 9, 20, 15, 0));
		const res = await capture(t, [
			ebayListing({ title: "Ash Blossom RA01-EN008 QCSR (price drop)" }),
		]);
		expect(await res.json()).toEqual({
			captured: 1,
			created: 0,
			updated: 1,
			auctionsWithoutEndTime: 0,
			listingsPage: null,
		});

		const all = await listings(t);
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({
			title: "Ash Blossom RA01-EN008 QCSR (price drop)",
			firstSeenAt: Date.UTC(2026, 9, 20, 12, 0),
			lastSeenAt: Date.UTC(2026, 9, 20, 15, 0),
		});
	});

	test("price changes are recorded as observations; repeat sightings are not", async () => {
		const t = setup();
		await capture(t, [ebayListing({ price: 42.15 })]);
		vi.setSystemTime(Date.UTC(2026, 9, 20, 13, 0));
		await capture(t, [ebayListing({ price: 42.15 })]);
		vi.setSystemTime(Date.UTC(2026, 9, 20, 14, 0));
		await capture(t, [ebayListing({ price: 38, shipping: 0 })]);

		const [listing] = await listings(t);
		if (!listing) throw new Error("Listing missing");
		expect(listing.price).toBe(38);
		const detail = await t.query(api.yugioh.listings.getListing, {
			listingId: listing._id,
			deckId: decks.get(t) as Id<"yugiohDecks">,
			now: Date.now(),
		});
		expect(
			detail?.observations.map((o) => ({
				observedAt: o.observedAt,
				price: o.price,
				shipping: o.shipping,
			})),
		).toEqual([
			{ observedAt: Date.UTC(2026, 9, 20, 14, 0), price: 38, shipping: 0 },
			{
				observedAt: Date.UTC(2026, 9, 20, 12, 0),
				price: 42.15,
				shipping: 4.99,
			},
		]);
	});

	test("an auction's new bids are observations", async () => {
		const t = setup();
		const auction = {
			listingType: "auction",
			endsAt: Date.UTC(2026, 9, 22, 2, 0),
		};
		await capture(t, [ebayListing({ ...auction, price: 10, bids: 1 })]);
		vi.setSystemTime(Date.UTC(2026, 9, 21, 12, 0));
		await capture(t, [ebayListing({ ...auction, price: 18.5, bids: 4 })]);

		const [listing] = await listings(t);
		if (!listing) throw new Error("Listing missing");
		const detail = await t.query(api.yugioh.listings.getListing, {
			listingId: listing._id,
			deckId: decks.get(t) as Id<"yugiohDecks">,
			now: Date.now(),
		});
		expect(detail?.observations.map((o) => [o.price, o.bids])).toEqual([
			[18.5, 4],
			[10, 1],
		]);
	});

	test("a sold page marks a known Listing sold and keeps what only the active page showed", async () => {
		const t = setup();
		await capture(t, [ebayListing({ sellerLocation: "Japan" })]);
		vi.setSystemTime(Date.UTC(2026, 9, 25, 12, 0));
		await capture(t, [
			ebayListing({
				price: 40,
				sold: true,
				soldDate: "2026-10-24",
				listedAt: null,
				sellerLocation: null,
				imageUrl: null,
			}),
		]);

		const [listing] = await listings(t);
		expect(listing).toMatchObject({
			price: 40,
			sold: true,
			soldDate: "2026-10-24",
			listedAt: Date.UTC(2026, 9, 19, 21, 2),
			sellerLocation: "Japan",
			imageUrl: "https://i.ebayimg.com/images/g/abc/s-l500.jpg",
		});
	});

	test("the same result twice on one page is one Listing", async () => {
		const t = setup();
		const res = await capture(t, [ebayListing(), ebayListing()]);
		expect(await res.json()).toEqual({
			captured: 1,
			created: 1,
			updated: 0,
			auctionsWithoutEndTime: 0,
			listingsPage: null,
		});
		expect(await listings(t)).toHaveLength(1);
	});

	test("Listings come newest first", async () => {
		const t = setup();
		await capture(t, [ebayListing({ itemId: "1", title: "first" })]);
		vi.setSystemTime(Date.UTC(2026, 9, 20, 13, 0));
		await capture(t, [ebayListing({ itemId: "2", title: "second" })]);

		expect((await listings(t)).map((l) => l.title)).toEqual([
			"second",
			"first",
		]);
	});
});

describe("the capture endpoint", () => {
	test("rejects a missing or wrong secret", async () => {
		const t = setup();
		expect((await capture(t, [ebayListing()], {})).status).toBe(401);
		expect(
			(
				await capture(t, [ebayListing()], {
					authorization: "Bearer not-the-secret-not-the-secret",
				})
			).status,
		).toBe(401);
		expect(await listings(t)).toEqual([]);
	});

	test("fails closed when the deployment secret is unset", async () => {
		const t = setup();
		vi.stubEnv("CONVEX_SERVER_SECRET", "");
		expect((await capture(t, [ebayListing()])).status).toBe(503);
	});

	test("rejects a malformed Listing and stores nothing", async () => {
		const t = setup();
		const { title: _title, ...untitled } = ebayListing();
		const res = await capture(t, [ebayListing({ itemId: "1" }), untitled]);
		expect(res.status).toBe(400);
		expect(await listings(t)).toEqual([]);
	});

	test("ingest is not callable from the public api", async () => {
		const mod = (await import("./listings")) as Record<
			string,
			{ isPublic?: boolean; isInternal?: boolean }
		>;
		expect(mod.ingestEbayListings?.isInternal).toBe(true);
		expect(mod.ingestEbayListings?.isPublic).not.toBe(true);
	});
});

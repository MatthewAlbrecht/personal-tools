/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The AI is faked: each test says what it judges a title to be. TCGplayer's
// product lookup (scheduled when a Printing is added) finds nothing.
const fakes = vi.hoisted(() => ({
	judgments: (_title: string): TitleJudgments => {
		throw new Error("set in beforeEach");
	},
	error: null as Error | null,
	reads: [] as string[],
	options: [] as { setCodes: string[]; rarities: string[] }[],
}));

vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (
		title: string,
		options: { setCodes: string[]; rarities: string[] },
	) => {
		fakes.reads.push(title);
		fakes.options.push(options);
		if (fakes.error) throw fakes.error;
		return fakes.judgments(title);
	},
}));

vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async () => [],
	fetchTcgplayerProduct: async () => null,
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";

/** What the AI reads from a plain, raw, English single. */
const plainRead: TitleJudgments = {
	setCode: null,
	rarity: "Quarter Century Secret Rare",
	condition: "nearMint",
	copies: 1,
	language: "english",
	graded: false,
	gradingCompany: null,
};

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(Date.UTC(2026, 9, 20, 12, 0));
	fakes.judgments = () => plainRead;
	fakes.error = null;
	fakes.reads = [];
	fakes.options = [];
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function ashDeck(t: T): Promise<Id<"yugiohDecks">> {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Snake-Eye",
	});
	await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName: "Ash Blossom & Joyous Spring",
		section: "main",
		copiesNeeded: 3,
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
		overloadedRarities: ["Super Rare"],
	});
	await settle(t);
	return deckId;
}

/** Runs scheduled work: title reads and TCGplayer lookups. */
async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function capture(
	t: T,
	itemId: string,
	title: string,
	extra: Record<string, unknown> = {},
): Promise<void> {
	const res = await t.fetch("/server/yugioh/ebay-listings", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify({
			listings: [
				{
					itemId,
					url: `https://www.ebay.com/itm/${itemId}`,
					title,
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
					...extra,
				},
			],
		}),
	});
	expect(res.status).toBe(200);
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
			t.query(api.yugioh.listings.getListing, {
				listingId,
				deckId,
				now: Date.now(),
			}),
		),
	);
	return views.flatMap((view) => {
		if (!view) return [];
		const { observations: _, ...listing } = view;
		return [listing];
	});
}

/** What the Deck's Listings table shows, Available view, before filters. */
async function tableListings(t: T, deckId: Id<"yugiohDecks">) {
	const page = await t.query(api.yugioh.listings.listListings, {
		deckId,
		now: Date.now(),
	});
	return page.listings;
}

async function only(t: T, deckId: Id<"yugiohDecks">) {
	const all = await listings(t, deckId);
	expect(all).toHaveLength(1);
	const [listing] = all;
	if (!listing) throw new Error("Listing missing");
	return listing;
}

describe("reading titles", () => {
	test("a new Listing's title is read once and shows what it says", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		fakes.judgments = () => ({
			...plainRead,
			condition: "lightlyPlayed",
			copies: 3,
		});
		await capture(t, "1", "3x Ash Blossom RA01-EN008 QCSR LP");

		expect((await only(t, deckId)).match.status).toBe("reading");
		await settle(t);

		const listing = await only(t, deckId);
		expect(listing.titleRead).toEqual({
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			condition: "lightlyPlayed",
			copies: 3,
			language: "english",
			graded: false,
			gradingCompany: null,
			grade: null,
		});
		expect(fakes.reads).toEqual(["3x Ash Blossom RA01-EN008 QCSR LP"]);
	});

	test("the AI chooses among my Printings' rarities as well as the known ones", async () => {
		const t = setup();
		await ashDeck(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 Quarter Century Secret");
		await settle(t);
		expect(fakes.options[0]?.setCodes).toEqual(["RA01-EN008"]);
		expect(fakes.options[0]?.rarities).toEqual(
			expect.arrayContaining(["Quarter Century Secret Rare", "Super Rare"]),
		);
	});

	test("seeing the same title again doesn't read it again; a changed title does", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR", { price: 39 });
		await settle(t);
		expect(fakes.reads).toHaveLength(1);

		fakes.judgments = () => ({ ...plainRead, condition: "heavilyPlayed" });
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR HP");
		await settle(t);
		expect(fakes.reads).toEqual([
			"Ash Blossom RA01-EN008 QCSR",
			"Ash Blossom RA01-EN008 QCSR HP",
		]);
		expect((await only(t, deckId)).titleRead?.condition).toBe("heavilyPlayed");
	});

	test("a -KR code makes the Listing Korean whatever the AI says", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom RA01-KR008 QCSR");
		await settle(t);
		const listing = await only(t, deckId);
		expect(listing.titleRead?.language).toBe("korean");
		expect(listing.match).toMatchObject({
			status: "match",
			printing: { setCode: "RA01-EN008" },
		});
	});

	test("when the AI fails, the set code still decides what it can", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName: "Ash Blossom & Joyous Spring",
			section: "main",
			copiesNeeded: 3,
			setCode: "MP23-EN001",
			rarity: "Starlight Rare",
			overloadedRarities: [],
		});
		await settle(t);
		fakes.error = new Error("TypeSafe is down");
		await capture(t, "1", "Ash Blossom MP23-EN001 Starlight");
		await capture(t, "2", "Ash Blossom RA01-EN008");
		await settle(t);

		const all = await tableListings(t, deckId);
		expect(all.map((l) => [l.title, l.match.status, l.titleRead])).toEqual([
			["Ash Blossom MP23-EN001 Starlight", "match", null],
		]);
	});
});

describe("matching", () => {
	test("my Printing's set code and rarity is a match", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		expect((await only(t, deckId)).match).toEqual({
			status: "match",
			printing: expect.objectContaining({
				cardName: "Ash Blossom & Joyous Spring",
				setCode: "RA01-EN008",
				rarity: "Quarter Century Secret Rare",
			}),
			overridden: false,
		});
	});

	test("another rarity under an Overloaded set code shows as not a match", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		fakes.judgments = () => ({ ...plainRead, rarity: "Super Rare" });
		await capture(t, "1", "Ash Blossom RA01-EN008 Super Rare");
		await settle(t);
		expect((await only(t, deckId)).match).toEqual({
			status: "notMatch",
			printing: null,
			overridden: false,
		});
	});

	test("a title without a set code is unsure", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom Quarter Century 25th");
		await settle(t);
		expect((await only(t, deckId)).match.status).toBe("unsure");
	});

	test("an Overloaded set code with no rarity in the title is unsure", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		fakes.judgments = () => ({ ...plainRead, rarity: null });
		await capture(t, "1", "Ash Blossom RA01-EN008 NM");
		await settle(t);
		expect((await only(t, deckId)).match.status).toBe("unsure");
	});

	test("a Deck's Listings leave out other Decks' Printings", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		const other = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Branded",
		});
		await t.mutation(api.yugioh.decks.addCard, {
			deckId: other,
			cardName: "Fallen of Albaz",
			section: "main",
			copiesNeeded: 3,
			setCode: "RA01-EN021",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: [],
		});
		await settle(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await capture(t, "2", "Fallen of Albaz RA01-EN021 QCSR");
		await settle(t);

		expect((await tableListings(t, deckId)).map((l) => l.itemId)).toEqual([
			"1",
		]);
		expect((await tableListings(t, other)).map((l) => l.itemId)).toEqual(["2"]);
	});

	test("a Printing added after the capture picks up its Listings", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			cardName: "Ash Blossom & Joyous Spring",
			section: "main",
			copiesNeeded: 3,
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: [],
		});
		await settle(t);
		expect((await only(t, deckId)).match.status).toBe("match");
	});
});

describe("overriding a match", () => {
	test("my override wins over the AI on later captures", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		const listing = await only(t, deckId);
		await t.mutation(api.yugioh.listings.setListingMatch, {
			listingId: listing._id,
			printingId: null,
		});
		expect((await only(t, deckId)).match).toEqual({
			status: "notMatch",
			printing: null,
			overridden: true,
		});

		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR (relisted)");
		await settle(t);
		const after = await only(t, deckId);
		expect(after.match).toEqual({
			status: "notMatch",
			printing: null,
			overridden: true,
		});
		expect(fakes.reads).toHaveLength(2);
	});

	test("I can match an unsure Listing to my Printing, and it stays matched", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom 25th Quarter Century");
		await settle(t);
		const listing = await only(t, deckId);
		const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
		const printingId = deck?.sections[0]?.cards[0]?.candidates[0]?.printingId;
		if (!printingId) throw new Error("Printing missing");

		await t.mutation(api.yugioh.listings.setListingMatch, {
			listingId: listing._id,
			printingId,
		});
		await capture(t, "1", "Ash Blossom 25th Quarter Century NM");
		await settle(t);
		// A new Printing on the same set code doesn't undo it either.
		await t.mutation(api.yugioh.decks.addCandidatePrinting, {
			deckCardId: deck?.sections[0]?.cards[0]?._id as Id<"yugiohDeckCards">,
			setCode: "RA01-EN008",
			rarity: "Super Rare",
			overloadedRarities: [],
		});
		await settle(t);

		expect((await only(t, deckId)).match).toEqual({
			status: "match",
			printing: expect.objectContaining({ _id: printingId }),
			overridden: true,
		});
	});

	test("overriding a missing Listing fails", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		const listing = await only(t, deckId);
		await t.run(async (ctx) => {
			await ctx.db.delete("yugiohListings", listing._id);
		});
		await expect(
			t.mutation(api.yugioh.listings.setListingMatch, {
				listingId: listing._id,
				printingId: null,
			}),
		).rejects.toThrow(/Listing/);
	});
});

describe("Listings captured before title reading", () => {
	test("a backfill queues their reads, a batch at a time", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await t.run(async (ctx) => {
			for (const itemId of ["1", "2"]) {
				await ctx.db.insert("yugiohListings", {
					marketplace: "ebay",
					itemId,
					url: `https://www.ebay.com/itm/${itemId}`,
					title: `Ash Blossom RA01-EN008 QCSR #${itemId}`,
					imageUrl: null,
					price: 40,
					currency: "USD",
					shipping: 0,
					listingType: "buyItNow",
					bids: null,
					endsAt: null,
					listedAt: null,
					sellerLocation: null,
					sold: false,
					soldDate: null,
					firstSeenAt: 0,
					lastSeenAt: 0,
				});
			}
		});

		expect(
			await t.mutation(internal.yugioh.titleReading.queueUnreadTitles, {
				batchSize: 1,
			}),
		).toEqual({ queued: 1 });
		await settle(t);
		expect(
			await t.mutation(internal.yugioh.titleReading.queueUnreadTitles, {
				batchSize: 1,
			}),
		).toEqual({ queued: 1 });
		await settle(t);
		expect(
			await t.mutation(internal.yugioh.titleReading.queueUnreadTitles, {
				batchSize: 1,
			}),
		).toEqual({ queued: 0 });

		const all = await listings(t, deckId);
		expect(all.map((l) => l.match.status)).toEqual(["match", "match"]);
		expect(fakes.reads).toHaveLength(2);
	});
});

describe("Listings read before a stated language beat the set code", () => {
	test("a backfill re-derives their language from the stored read, without the AI", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR Japanese");
		await capture(t, "2", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		// As the old rule stored them: the EN code made both English.
		await t.run(async (ctx) => {
			for (const listing of await ctx.db.query("yugiohListings").take(10)) {
				if (!listing.titleRead) throw new Error("Listing unread");
				await ctx.db.patch("yugiohListings", listing._id, {
					titleRead: { ...listing.titleRead, language: "english" },
				});
			}
		});
		// A TCGplayer Listing the seller titled "French" on the English page.
		await t.run(async (ctx) => {
			await ctx.db.insert("yugiohListings", {
				marketplace: "tcgplayer",
				itemId: "tcg-1",
				url: "https://www.tcgplayer.com/product/1",
				title: "French LP",
				imageUrl: null,
				price: 40,
				currency: "USD",
				shipping: 0,
				listingType: "buyItNow",
				bids: null,
				endsAt: null,
				listedAt: null,
				sellerLocation: null,
				sold: false,
				soldDate: null,
				firstSeenAt: 0,
				lastSeenAt: 0,
				titleReadStatus: "read",
				titleRead: {
					...plainRead,
					setCode: "RA01-EN008",
					grade: null,
				},
			});
		});
		const readsBefore = fakes.reads.length;

		const first = await t.mutation(
			internal.yugioh.titleReading.rederiveListingLanguages,
			{ paginationOpts: { numItems: 1, cursor: null } },
		);
		const second = await t.mutation(
			internal.yugioh.titleReading.rederiveListingLanguages,
			{ paginationOpts: { numItems: 10, cursor: first.cursor } },
		);
		expect(first.updated + second.updated).toBe(2);
		expect(second.isDone).toBe(true);

		const byTitle = new Map(
			(await listings(t, deckId)).map((l) => [l.title, l.titleRead?.language]),
		);
		expect(byTitle.get("Ash Blossom RA01-EN008 QCSR Japanese")).toBe(
			"japanese",
		);
		expect(byTitle.get("Ash Blossom RA01-EN008 QCSR")).toBe("english");
		const tcgplayer = await t.run(async (ctx) =>
			ctx.db
				.query("yugiohListings")
				.withIndex("by_marketplace_and_itemId", (q) =>
					q.eq("marketplace", "tcgplayer").eq("itemId", "tcg-1"),
				)
				.unique(),
		);
		expect(tcgplayer?.titleRead?.language).toBe("french");
		expect(fakes.reads).toHaveLength(readsBefore);
	});
});

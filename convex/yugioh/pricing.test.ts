/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The AI, TCGplayer and the exchange-rate source are faked.
const fakes = vi.hoisted(() => ({
	aiFails: false,
	rates: null as null | {
		source: string;
		rates: { currency: string; usdPerUnit: number }[];
	},
}));

vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (): Promise<TitleJudgments> => {
		if (fakes.aiFails) throw new Error("AI down");
		return {
			setCode: null,
			rarity: "Quarter Century Secret Rare",
			condition: "nearMint",
			language: "english",
			graded: false,
			gradingCompany: null,
		};
	},
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
const NOW = Date.UTC(2026, 9, 20, 12, 0);

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	fakes.aiFails = false;
	fakes.rates = null;
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
		overloadedRarities: [],
	});
	await settle(t);
	return deckId;
}

async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Captures one eBay result for Ash Blossom, then lets the AI read it. */
async function capture(
	t: T,
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
					itemId: "306512345678",
					url: "https://www.ebay.com/itm/306512345678",
					title: "Ash Blossom RA01-EN008 Quarter Century Secret Rare NM",
					imageUrl: null,
					price: 42.15,
					currency: "USD",
					shipping: 4.99,
					listingType: "buyItNow",
					bids: null,
					endsAt: null,
					listedAt: null,
					sellerLocation: "United States",
					sold: false,
					soldDate: null,
					...extra,
				},
			],
		}),
	});
	expect(res.status).toBe(200);
	await settle(t);
}

async function perCopyPrice(t: T, deckId: Id<"yugiohDecks">) {
	const { listings } = await t.query(api.yugioh.listings.listListings, {
		deckId,
		now: Date.now(),
	});
	expect(listings).toHaveLength(1);
	return listings[0]?.perCopyPrice;
}

describe("Per-copy price", () => {
	test("a US Listing in dollars is price plus shipping, with no import fees", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t);

		expect(await perCopyPrice(t, deckId)).toEqual({
			price: 42.15,
			shipping: 4.99,
			importFees: 0,
			importFeePercent: 0,
			importFeeDefaulted: false,
			copies: 1,
			perCopy: 47.14,
		});
	});

	test("a foreign Listing is converted at the daily rate and pays its country's import fee", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		fakes.rates = {
			source: "Test rates",
			rates: [{ currency: "GBP", usdPerUnit: 1.25 }],
		};
		await t.action(internal.yugioh.pricing.refreshExchangeRates, {});
		await t.mutation(api.yugioh.pricing.setImportFeeRate, {
			country: "United Kingdom",
			percent: 12,
		});
		await capture(t, {
			price: 20,
			currency: "GBP",
			shipping: 4,
			sellerLocation: "United Kingdom",
		});

		// £20 → $25, £4 → $5, 12% of $30 = $3.60.
		expect(await perCopyPrice(t, deckId)).toEqual({
			price: 25,
			shipping: 5,
			importFees: 3.6,
			importFeePercent: 12,
			importFeeDefaulted: false,
			copies: 1,
			perCopy: 33.6,
		});
	});

	test("a country not in the table pays 15%", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, { price: 50, shipping: 10, sellerLocation: "Chile" });

		expect(await perCopyPrice(t, deckId)).toMatchObject({
			importFees: 9,
			importFeePercent: 15,
			importFeeDefaulted: true,
			perCopy: 69,
		});
	});

	test("a Listing whose seller location is unknown pays the default 15%", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, { price: 50, shipping: 10, sellerLocation: null });

		expect(await perCopyPrice(t, deckId)).toMatchObject({
			importFees: 9,
			importFeePercent: 15,
			importFeeDefaulted: true,
			perCopy: 69,
		});
	});

	test("a currency with no exchange rate yet has no Per-copy price", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, { currency: "EUR", sellerLocation: "Germany" });

		expect(await perCopyPrice(t, deckId)).toBeNull();
	});

	test("a Listing without a price has no Per-copy price", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, { price: null });

		expect(await perCopyPrice(t, deckId)).toBeNull();
	});
});

describe("Copies in the Listing", () => {
	test("a lot is divided by the Copies the title reading found", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, {
			price: 60,
			shipping: 6,
			title: "Ash Blossom RA01-EN008 Quarter Century Secret Rare NM 3x",
		});

		expect(await perCopyPrice(t, deckId)).toMatchObject({
			copies: 3,
			perCopy: 22,
		});
	});

	test("Copies default to 1 when the title couldn't be read", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		fakes.aiFails = true;
		await capture(t, { price: 60, shipping: 6 });

		expect(await perCopyPrice(t, deckId)).toMatchObject({
			copies: 1,
			perCopy: 66,
		});
	});
});

describe("Exchange rates", () => {
	test("the daily refresh shows on Settings with its source and time", async () => {
		const t = setup();
		expect(
			(await t.query(api.yugioh.pricing.getPricingSettings, {})).exchangeRates,
		).toBeNull();

		fakes.rates = {
			source: "Test rates",
			rates: [
				{ currency: "GBP", usdPerUnit: 1.25 },
				{ currency: "EUR", usdPerUnit: 1.1 },
			],
		};
		await t.action(internal.yugioh.pricing.refreshExchangeRates, {});

		expect(
			(await t.query(api.yugioh.pricing.getPricingSettings, {})).exchangeRates,
		).toEqual({ fetchedAt: NOW, source: "Test rates", currencies: 2 });
	});

	test("a later refresh replaces the rate; a failed one keeps the last rates", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		fakes.rates = {
			source: "Test rates",
			rates: [{ currency: "GBP", usdPerUnit: 1.25 }],
		};
		await t.action(internal.yugioh.pricing.refreshExchangeRates, {});
		fakes.rates = {
			source: "Test rates",
			rates: [{ currency: "GBP", usdPerUnit: 1.5 }],
		};
		vi.setSystemTime(NOW + 86_400_000);
		await t.action(internal.yugioh.pricing.refreshExchangeRates, {});
		fakes.rates = null;
		await t.action(internal.yugioh.pricing.refreshExchangeRates, {});

		await capture(t, {
			price: 20,
			currency: "GBP",
			shipping: 0,
			sellerLocation: "United States",
		});
		expect(await perCopyPrice(t, deckId)).toMatchObject({ perCopy: 30 });
		expect(
			(await t.query(api.yugioh.pricing.getPricingSettings, {})).exchangeRates
				?.fetchedAt,
		).toBe(NOW + 86_400_000);
	});

	test("a daily cron refreshes the rates", async () => {
		const crons = (await import("../crons")).default as unknown as {
			crons: Record<string, { name: string; schedule: { type: string } }>;
		};
		const job = Object.values(crons.crons).find(
			(c) => c.name === "yugioh/pricing:refreshExchangeRates",
		);
		expect(job?.schedule.type).toBe("daily");
	});
});

describe("Import fee table", () => {
	test("seeding adds the researched rates once and keeps my edits", async () => {
		const t = setup();
		const first = await t.mutation(
			internal.yugioh.pricing.seedImportFeeRates,
			{},
		);
		expect(first.added).toBeGreaterThan(10);

		const seeded = await t.query(api.yugioh.pricing.getPricingSettings, {});
		expect(seeded.importFeeRates.map((r) => r.country)).toContain(
			"United Kingdom",
		);
		expect(seeded.importFeeRates.map((r) => r.country)).not.toContain(
			"United States",
		);

		await t.mutation(api.yugioh.pricing.setImportFeeRate, {
			country: "United Kingdom",
			percent: 7.5,
		});
		expect(
			await t.mutation(internal.yugioh.pricing.seedImportFeeRates, {}),
		).toEqual({ added: 0 });
		const after = await t.query(api.yugioh.pricing.getPricingSettings, {});
		expect(
			after.importFeeRates.find((r) => r.country === "United Kingdom"),
		).toEqual({ country: "United Kingdom", percent: 7.5 });
		expect(after.defaultImportFeePercent).toBe(15);
	});

	test("editing a country's rate changes its Listings' Per-copy price", async () => {
		const t = setup();
		const deckId = await ashDeck(t);
		await capture(t, { price: 50, shipping: 0, sellerLocation: "Japan" });
		expect(await perCopyPrice(t, deckId)).toMatchObject({ perCopy: 57.5 });

		await t.mutation(api.yugioh.pricing.setImportFeeRate, {
			country: "japan ",
			percent: 20,
		});

		expect(await perCopyPrice(t, deckId)).toMatchObject({
			importFees: 10,
			importFeePercent: 20,
			perCopy: 60,
		});
	});

	test("United States can't be given a rate, and rates stay within 0-100%", async () => {
		const t = setup();
		await expect(
			t.mutation(api.yugioh.pricing.setImportFeeRate, {
				country: "United States",
				percent: 5,
			}),
		).rejects.toThrow(/no import fees/);
		await expect(
			t.mutation(api.yugioh.pricing.setImportFeeRate, {
				country: "Japan",
				percent: 101,
			}),
		).rejects.toThrow(/0 to 100/);
		await expect(
			t.mutation(api.yugioh.pricing.setImportFeeRate, {
				country: "Japan",
				percent: -1,
			}),
		).rejects.toThrow(/0 to 100/);
	});

	test("the refresh and seed functions aren't public", async () => {
		const mod = (await import("./pricing")) as unknown as Record<
			string,
			{ isInternal?: boolean }
		>;
		for (const name of [
			"refreshExchangeRates",
			"saveExchangeRates",
			"seedImportFeeRates",
		]) {
			expect(mod[name]?.isInternal, name).toBe(true);
		}
	});
});

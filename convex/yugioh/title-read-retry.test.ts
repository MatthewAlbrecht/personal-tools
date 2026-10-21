/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	MAX_TITLE_READ_ATTEMPTS,
	TITLE_READ_RETRY_DELAY_MS,
} from "../../src/lib/yugioh/title-read-retry";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { internal } from "../_generated/api";
import { TypesafeKeyMissingError } from "../model/yugioh/typesafe";
import schema from "../schema";

// The AI is faked: `fail` says which titles it fails on, and with what error.
const fakes = vi.hoisted(() => ({
	fail: (_title: string): Error | null => null,
	reads: [] as string[],
}));

vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (title: string): Promise<TitleJudgments> => {
		fakes.reads.push(title);
		const error = fakes.fail(title);
		if (error) throw error;
		return {
			setCode: null,
			rarity: "Quarter Century Secret Rare",
			condition: "nearMint",
			copies: 1,
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

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(Date.UTC(2026, 9, 20, 12, 0));
	fakes.fail = () => null;
	fakes.reads = [];
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function settle(t: T): Promise<void> {
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function capture(t: T, itemId: string, title: string): Promise<void> {
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
				},
			],
		}),
	});
	expect(res.status).toBe(200);
}

/** Every Listing's title, read status and counted attempts, by title. */
async function reads(t: T) {
	return await t.run(async (ctx) => {
		const all = await ctx.db.query("yugiohListings").take(50);
		return Object.fromEntries(
			all.map((l) => [
				l.title,
				{ status: l.titleReadStatus, attempts: l.titleReadAttempts ?? 0 },
			]),
		);
	});
}

function later(ms: number): void {
	vi.setSystemTime(Date.now() + ms);
}

async function retryDue(t: T): Promise<number> {
	const { queued } = await t.mutation(
		internal.yugioh.titleReadRetry.retryFailedTitleReads,
		{},
	);
	await settle(t);
	return queued;
}

describe("re-queueing failed title reads", () => {
	test("the backfill re-reads failed Listings only, a page at a time", async () => {
		const t = setup();
		fakes.fail = (title) =>
			title.includes("fails") ? new Error("TypeSafe is down") : null;
		await capture(t, "1", "Ash Blossom RA01-EN008 fails 1");
		await capture(t, "2", "Ash Blossom RA01-EN008 reads");
		await capture(t, "3", "Ash Blossom RA01-EN008 fails 2");
		await settle(t);
		expect(await reads(t)).toEqual({
			"Ash Blossom RA01-EN008 fails 1": { status: "failed", attempts: 1 },
			"Ash Blossom RA01-EN008 reads": { status: "read", attempts: 0 },
			"Ash Blossom RA01-EN008 fails 2": { status: "failed", attempts: 1 },
		});

		fakes.fail = () => null;
		fakes.reads = [];
		const first = await t.mutation(
			internal.yugioh.titleReadRetry.requeueFailedTitleReads,
			{ paginationOpts: { numItems: 1, cursor: null } },
		);
		const second = await t.mutation(
			internal.yugioh.titleReadRetry.requeueFailedTitleReads,
			{ paginationOpts: { numItems: 10, cursor: first.cursor } },
		);
		expect([first.queued, second.queued, second.isDone]).toEqual([1, 1, true]);
		await settle(t);

		expect(fakes.reads.sort()).toEqual([
			"Ash Blossom RA01-EN008 fails 1",
			"Ash Blossom RA01-EN008 fails 2",
		]);
		expect(Object.values(await reads(t))).toEqual([
			{ status: "read", attempts: 0 },
			{ status: "read", attempts: 0 },
			{ status: "read", attempts: 0 },
		]);
	});
});

describe("retrying failed title reads", () => {
	test("a failed read is retried once it's old enough, up to the cap, then stays failed", async () => {
		const t = setup();
		fakes.fail = () => new Error("TypeSafe is down");
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		const title = "Ash Blossom RA01-EN008 QCSR";
		expect((await reads(t))[title]).toEqual({ status: "failed", attempts: 1 });

		// Not yet: it only just failed.
		expect(await retryDue(t)).toBe(0);

		for (let attempt = 2; attempt <= MAX_TITLE_READ_ATTEMPTS; attempt++) {
			later(TITLE_READ_RETRY_DELAY_MS);
			expect(await retryDue(t)).toBe(1);
			expect((await reads(t))[title]).toEqual({
				status: "failed",
				attempts: attempt,
			});
		}

		later(TITLE_READ_RETRY_DELAY_MS * 10);
		expect(await retryDue(t)).toBe(0);
		expect((await reads(t))[title]).toEqual({
			status: "failed",
			attempts: MAX_TITLE_READ_ATTEMPTS,
		});
		expect(fakes.reads).toHaveLength(MAX_TITLE_READ_ATTEMPTS);
	});

	test("a missing TypeSafe key doesn't use up attempts; the read lands once the key exists", async () => {
		const t = setup();
		fakes.fail = () => new TypesafeKeyMissingError();
		await capture(t, "1", "Ash Blossom RA01-EN008 QCSR");
		await settle(t);
		const title = "Ash Blossom RA01-EN008 QCSR";

		for (let run = 0; run < MAX_TITLE_READ_ATTEMPTS + 2; run++) {
			later(TITLE_READ_RETRY_DELAY_MS);
			expect(await retryDue(t)).toBe(1);
			expect((await reads(t))[title]).toEqual({
				status: "failed",
				attempts: 0,
			});
		}

		fakes.fail = () => null;
		later(TITLE_READ_RETRY_DELAY_MS);
		expect(await retryDue(t)).toBe(1);
		expect((await reads(t))[title]).toEqual({ status: "read", attempts: 0 });
	});
});

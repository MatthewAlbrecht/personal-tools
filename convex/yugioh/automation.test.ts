/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: automated browser runs. The script asks for a run, the extension in
// the automation Chrome profile claims it and gets the visit plan, reports
// each page it visits, then finishes. All of it goes through the server
// channel the Next routes forward to; the app shows the runs.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// No TCGplayer product is found automatically; tests paste URLs themselves.
vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async () => [],
	fetchTcgplayerProduct: async () => null,
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 9, 20, 12, 0);

const ASH = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "RA01-EN008",
	rarity: "Quarter Century Secret Rare",
	productUrl:
		"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
};
const CALLED = {
	cardName: "Called by the Grave",
	setCode: "RA01-EN060",
	rarity: "Quarter Century Secret Rare",
	overloadedRarities: ["Super Rare", "Ultra Rare"],
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

async function addCard(
	t: T,
	deckId: Id<"yugiohDecks">,
	card: {
		cardName: string;
		setCode: string;
		rarity: string;
		overloadedRarities?: string[];
	},
): Promise<Id<"yugiohPrintings">> {
	await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		section: "main",
		copiesNeeded: 3,
		cardName: card.cardName,
		setCode: card.setCode,
		rarity: card.rarity,
		overloadedRarities: card.overloadedRarities ?? [],
	});
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const candidate = deck?.sections
		.flatMap((s) => s.cards)
		.find((c) => c.cardName === card.cardName)?.candidates[0];
	if (!candidate) throw new Error("missing Printing");
	return candidate.printingId;
}

/** Pastes a Printing's TCGplayer product page, as the Card drawer would. */
async function pasteProductUrl(
	t: T,
	printingId: Id<"yugiohPrintings">,
	url: string,
): Promise<void> {
	await t.run(async (ctx) => {
		await ctx.db.patch("yugiohPrintings", printingId, {
			tcgplayerStatus: "found",
			tcgplayerProductUrl: url,
		});
	});
}

/** One call to the automation server channel, as the Next route forwards it. */
async function automation(
	t: T,
	body: Record<string, unknown>,
	secret = SECRET,
): Promise<{ status: number; json: unknown }> {
	const res = await t.fetch("/server/yugioh/automation", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${secret}`,
		},
		body: JSON.stringify(body),
	});
	return { status: res.status, json: await res.json() };
}

type Claimed = {
	run: {
		runId: string;
		visits: Array<{ url: string; kind: string; label: string }>;
	} | null;
};

describe("the visit plan", () => {
	test("a claimed run visits every Search's Newly Listed and Sold pages, then each TCGplayer product page, once across Decks", async () => {
		const t = setup();
		const first = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		const ash = await addCard(t, first, ASH);
		await addCard(t, first, CALLED);
		const second = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Yubel",
		});
		await addCard(t, second, ASH);
		await pasteProductUrl(t, ash, ASH.productUrl);
		const searches = await t.query(api.yugioh.searches.listSearches, {
			deckId: first,
		});
		if (!searches) throw new Error("missing Searches");

		const requested = await automation(t, { op: "request", trigger: "manual" });
		expect(requested.status).toBe(200);
		const claimed = await automation(t, { op: "claim" });

		expect(claimed.status).toBe(200);
		const run = (claimed.json as Claimed).run;
		expect(run?.runId).toBe((requested.json as { runId: string }).runId);
		expect(run?.visits).toEqual([
			...searches.flatMap((search) => [
				{
					url: search.newlyListedUrl,
					kind: "ebayNewlyListed",
					label: search.setCodes.join(", "),
				},
				{
					url: search.soldUrl,
					kind: "ebaySold",
					label: search.setCodes.join(", "),
				},
			]),
			{
				url: ASH.productUrl,
				kind: "tcgplayer",
				label: `${ASH.cardName} ${ASH.setCode}`,
			},
		]);
		expect(searches).toHaveLength(2);
	});

	test("there's nothing to claim until a run is asked for, and a run is claimed once", async () => {
		const t = setup();
		expect((await automation(t, { op: "claim" })).json).toEqual({ run: null });

		await automation(t, { op: "request", trigger: "launchAgent" });
		expect((await automation(t, { op: "claim" })).json).not.toEqual({
			run: null,
		});
		expect((await automation(t, { op: "claim" })).json).toEqual({ run: null });
	});
});

type Run = {
	_id: string;
	status: string;
	trigger: string;
	requestedAt: number;
	startedAt: number | null;
	endedAt: number | null;
	pagesPlanned: number;
	pagesVisited: number;
	searchPagesVisited: number;
	productPagesVisited: number;
	failedPages: number;
	listingsCaptured: number;
	newListings: number;
	auctionsWithoutEndTime?: number;
	error: string | null;
	pageErrors: Array<{ kind: string; label: string; error: string }>;
};

async function startRun(
	t: T,
	trigger = "launchAgent",
): Promise<{ runId: string; visits: Array<Record<string, string>> }> {
	await automation(t, { op: "request", trigger });
	const claimed = (await automation(t, { op: "claim" })).json as Claimed;
	if (!claimed.run) throw new Error("nothing claimed");
	return claimed.run;
}

describe("recording a run", () => {
	test("each visited page adds to the run, and the app lists it with start, end, Searches visited, Listings captured and errors", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		const ash = await addCard(t, deckId, ASH);
		await pasteProductUrl(t, ash, ASH.productUrl);
		const { runId, visits } = await startRun(t);
		expect(visits).toHaveLength(3);

		vi.setSystemTime(NOW + 1 * MINUTE);
		const reported = await automation(t, {
			op: "visit",
			runId,
			visit: {
				...visits[0],
				listingsCaptured: 48,
				newListings: 12,
				error: null,
			},
		});
		expect(reported.json).toEqual({ running: true });
		await automation(t, {
			op: "visit",
			runId,
			visit: {
				...visits[1],
				listingsCaptured: 60,
				newListings: 0,
				error: null,
			},
		});
		await automation(t, {
			op: "visit",
			runId,
			visit: {
				...visits[2],
				listingsCaptured: 0,
				newListings: 0,
				error: "The page sent nothing within 2 minutes.",
			},
		});
		vi.setSystemTime(NOW + 4 * MINUTE);
		const finished = await automation(t, { op: "finish", runId, error: null });
		expect(finished.status).toBe(200);

		const runs = (await t.query(api.yugioh.automation.listRuns, {})) as Run[];
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			_id: runId,
			trigger: "launchAgent",
			status: "finished",
			requestedAt: NOW,
			startedAt: NOW,
			endedAt: NOW + 4 * MINUTE,
			pagesPlanned: 3,
			pagesVisited: 3,
			searchPagesVisited: 2,
			productPagesVisited: 1,
			failedPages: 1,
			listingsCaptured: 108,
			newListings: 12,
			error: null,
			pageErrors: [
				{
					kind: "tcgplayer",
					label: `${ASH.cardName} ${ASH.setCode}`,
					error: "The page sent nothing within 2 minutes.",
				},
			],
		});
		// The script sees the same run while it waits.
		const status = await automation(t, { op: "status", runId });
		expect((status.json as { run: Run }).run.status).toBe("finished");
	});

	test("a run totals the matched auctions its pages showed no end time for", async () => {
		const t = setup();
		const deckId = await t.mutation(api.yugioh.decks.createDeck, {
			name: "Snake-Eye",
		});
		await addCard(t, deckId, ASH);
		const { runId, visits } = await startRun(t);

		await automation(t, {
			op: "visit",
			runId,
			visit: {
				...visits[0],
				listingsCaptured: 48,
				newListings: 2,
				auctionsWithoutEndTime: 3,
				error: null,
			},
		});
		// An extension from before this count reports none.
		await automation(t, {
			op: "visit",
			runId,
			visit: {
				...visits[1],
				listingsCaptured: 20,
				newListings: 0,
				error: null,
			},
		});

		const runs = (await t.query(api.yugioh.automation.listRuns, {})) as Run[];
		expect(runs[0]).toMatchObject({ auctionsWithoutEndTime: 3 });
	});

	test("runs are listed newest first", async () => {
		const t = setup();
		const { runId: first } = await startRun(t, "launchAgent");
		await automation(t, { op: "finish", runId: first, error: null });
		vi.setSystemTime(NOW + 3 * HOUR);
		const { runId: second } = await startRun(t, "t3");

		const runs = (await t.query(api.yugioh.automation.listRuns, {})) as Run[];
		expect(runs.map((run) => [run._id, run.status, run.trigger])).toEqual([
			[second, "running", "t3"],
			[first, "finished", "launchAgent"],
		]);
	});
});

describe("one run at a time", () => {
	test("asking again while a run is open returns that run", async () => {
		const t = setup();
		const first = await automation(t, {
			op: "request",
			trigger: "launchAgent",
		});
		await automation(t, { op: "claim" });
		vi.setSystemTime(NOW + 30 * MINUTE);

		const again = await automation(t, { op: "request", trigger: "t3" });

		expect(again.json).toEqual({
			runId: (first.json as { runId: string }).runId,
			alreadyOpen: true,
			kind: "full",
		});
		expect(await t.query(api.yugioh.automation.listRuns, {})).toHaveLength(1);
	});

	test("a run left open for over 2 hours is closed as failed when the next is asked for", async () => {
		const t = setup();
		const { runId: stuck } = await startRun(t);
		vi.setSystemTime(NOW + 2 * HOUR + MINUTE);

		// By hand: a scheduled ask wouldn't be due for a full run yet.
		const next = await automation(t, { op: "request", trigger: "manual" });

		expect((next.json as { alreadyOpen: boolean }).alreadyOpen).toBe(false);
		const runs = (await t.query(api.yugioh.automation.listRuns, {})) as Run[];
		expect(runs[1]).toMatchObject({
			_id: stuck,
			status: "failed",
			endedAt: NOW + 2 * HOUR + MINUTE,
			error: "Didn't finish. Closed when the next run was asked for.",
		});
		expect(runs[0]?.status).toBe("requested");
	});

	test("a run the extension never claimed fails when the script gives up on it", async () => {
		const t = setup();
		const requested = await automation(t, {
			op: "request",
			trigger: "launchAgent",
		});
		const { runId } = requested.json as { runId: string };

		await automation(t, {
			op: "finish",
			runId,
			error: "The extension didn't start the run within 3 minutes.",
		});

		const runs = (await t.query(api.yugioh.automation.listRuns, {})) as Run[];
		expect(runs[0]).toMatchObject({
			status: "failed",
			startedAt: null,
			error: "The extension didn't start the run within 3 minutes.",
		});
		expect((await automation(t, { op: "claim" })).json).toEqual({ run: null });
	});

	test("pages reported after the run ended are dropped, and ending it again changes nothing", async () => {
		const t = setup();
		const { runId } = await startRun(t);
		await automation(t, {
			op: "finish",
			runId,
			error: "Timed out after 90 minutes.",
		});

		const late = await automation(t, {
			op: "visit",
			runId,
			visit: {
				url: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10",
				kind: "ebayNewlyListed",
				label: "RA01-EN008",
				listingsCaptured: 5,
				newListings: 5,
				error: null,
			},
		});
		// The extension stops visiting.
		expect(late.json).toEqual({ running: false });
		await automation(t, { op: "finish", runId, error: null });

		const runs = (await t.query(api.yugioh.automation.listRuns, {})) as Run[];
		expect(runs[0]).toMatchObject({
			status: "failed",
			error: "Timed out after 90 minutes.",
			pagesVisited: 0,
			listingsCaptured: 0,
		});
	});
});

describe("the server channel", () => {
	test("needs the server secret", async () => {
		const t = setup();
		const res = await automation(
			t,
			{ op: "request", trigger: "manual" },
			"wrong-secret-0123456789",
		);
		expect(res.status).toBe(401);
		expect(await t.query(api.yugioh.automation.listRuns, {})).toEqual([]);
	});

	test("rejects an unknown step, trigger or run", async () => {
		const t = setup();
		expect((await automation(t, { op: "launch" })).status).toBe(400);
		expect((await automation(t, { op: "toString" })).status).toBe(400);
		expect(
			(await automation(t, { op: "request", trigger: "cron" })).status,
		).toBe(400);
		expect(
			(await automation(t, { op: "status", runId: "not-a-run" })).status,
		).toBe(400);
	});
});

describe("last captured", () => {
	test("is when any capture last saw a Listing", async () => {
		const t = setup();
		expect(await t.query(api.yugioh.automation.getLastCapturedAt, {})).toBe(
			null,
		);
		const listing = {
			itemId: "1",
			url: "https://www.ebay.com/itm/1",
			title: "Ash Blossom RA01-EN008 Quarter Century Secret Rare",
			imageUrl: null,
			price: 40,
			currency: "USD",
			shipping: 0,
			listingType: "buyItNow",
			bids: null,
			endsAt: null,
			listedAt: null,
			sellerLocation: "United States",
			sold: false,
			soldDate: null,
		};
		const capture = async () =>
			await t.fetch("/server/yugioh/ebay-listings", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${SECRET}`,
				},
				body: JSON.stringify({ listings: [listing] }),
			});
		await capture();
		vi.setSystemTime(NOW + 5 * HOUR);
		await capture();

		expect(await t.query(api.yugioh.automation.getLastCapturedAt, {})).toBe(
			NOW + 5 * HOUR,
		);
	});
});

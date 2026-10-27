/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: pre-auction refresh visits (ticket 16). The LaunchAgent asks the app
// every 10 minutes; the app answers with a full run at a slot of the day's
// plan, a refresh run when a matched, Qualifying auction on a Card I still need ends in about
// 20 minutes and hasn't been seen since, or nothing. Auctions ending close
// together share one run, and each Search's auctions share one page.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const fakes = vi.hoisted(() => ({
	reads: new Map<string, Partial<TitleJudgments>>(),
}));

vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (title: string): Promise<TitleJudgments> => ({
		setCode: null,
		rarity: "Quarter Century Secret Rare",
		condition: "nearMint",
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
	sendWebPush: async () => ({ status: "sent" }),
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 9, 20, 12, 0);

const ASH_ENDING_SOON =
	"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_Auction=1&_sop=1";
const CALLED_ENDING_SOON =
	"https://www.ebay.com/sch/i.html?_nkw=RA01-EN060+%28ultra%2Cur%29+-quarter+-super&LH_Auction=1&_sop=1";

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	fakes.reads = new Map();
	// Every draw 0.4: the day's plan (see `fullRun`) and start delays.
	vi.spyOn(Math, "random").mockReturnValue(0.4);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Runs what's due in the next few seconds (title reads), not later pushes. */
async function settleNow(t: T): Promise<void> {
	for (let i = 0; i < 5; i++) {
		vi.advanceTimersByTime(1000);
		await t.finishInProgressScheduledFunctions();
	}
}

/**
 * A Deck needing Ash Blossom (RA01-EN008) and Called by the Grave
 * (RA01-EN060 Ultra Rare, Overloaded: leaving out -quarter would drop Ash's
 * Printing, so a Search of its own), with push on.
 */
async function deck(t: T): Promise<{ ash: Id<"yugiohDeckCards"> }> {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Snake-Eye",
	});
	const ash = await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName: "Ash Blossom & Joyous Spring",
		section: "main",
		copiesNeeded: 3,
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
		overloadedRarities: [],
	});
	await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName: "Called by the Grave",
		section: "main",
		copiesNeeded: 2,
		setCode: "RA01-EN060",
		rarity: "Ultra Rare",
		overloadedRarities: ["Quarter Century Secret Rare", "Super Rare"],
	});
	await settleNow(t);
	await t.mutation(api.yugioh.pushes.savePushSubscription, {
		endpoint: "https://web.push.apple.com/phone",
		keys: { p256dh: "p256dh", auth: "auth" },
		timeZone: "America/New_York",
	});
	return { ash };
}

let nextItemId = 407700000000;

type Auction = {
	endsAt: number;
	/** Ash Blossom unless given. */
	title?: string;
	read?: Partial<TitleJudgments>;
	itemId?: string;
};

/** Captures running auctions as an eBay page would send them. */
async function capture(t: T, ...auctions: Auction[]): Promise<string[]> {
	const itemIds: string[] = [];
	const listings = auctions.map(({ endsAt, title, read, itemId }) => {
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
			price: 40,
			currency: "USD",
			shipping: 0,
			listingType: "auction",
			bids: 3,
			endsAt,
			listedAt: null,
			sellerLocation: "United States",
			sold: false,
			soldDate: null,
		};
	});
	const res = await t.fetch("/server/yugioh/ebay-listings", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify({ listings }),
	});
	expect(res.status).toBe(200);
	await settleNow(t);
	return itemIds;
}

function calledAuction(endsAt: number): Auction {
	return {
		endsAt,
		title: `Called by the Grave RA01-EN060 Ultra Rare #${nextItemId}`,
		read: { rarity: "Ultra Rare" },
	};
}

async function automation(
	t: T,
	body: Record<string, unknown>,
): Promise<unknown> {
	const res = await t.fetch("/server/yugioh/automation", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify(body),
	});
	expect(res.status).toBe(200);
	return await res.json();
}

type Asked = {
	runId: string | null;
	alreadyOpen: boolean;
	kind: string | null;
};
type Visit = { url: string; kind: string; label: string };

/** The LaunchAgent's ask at the current time. */
async function scheduledAsk(t: T): Promise<Asked> {
	return (await automation(t, {
		op: "request",
		trigger: "launchAgent",
	})) as Asked;
}

/** Claims the run asked for and returns its visit plan. */
async function claim(t: T): Promise<{ runId: string; visits: Visit[] }> {
	const { run } = (await automation(t, { op: "claim" })) as {
		run: { runId: string; visits: Visit[] } | null;
	};
	if (!run) throw new Error("nothing to claim");
	return run;
}

/** Runs a whole run at the current time, reporting its pages with `error`. */
async function runIt(t: T, error: string | null = null): Promise<Visit[]> {
	const { runId, visits } = await claim(t);
	for (const visit of visits) {
		await automation(t, {
			op: "visit",
			runId,
			visit: { ...visit, listingsCaptured: 0, newListings: 0, error },
		});
	}
	await automation(t, { op: "finish", runId, error: null });
	return visits;
}

/**
 * A scheduled full run at the current time. Draws of 0.4 put today's slots at
 * 7:12 AM, 11:07 AM, 3:02 PM and 6:57 PM in New York (11:12, 15:07, 19:02
 * and 22:57 UTC).
 */
async function fullRun(t: T): Promise<void> {
	expect((await scheduledAsk(t)).kind).toBe("full");
	await runIt(t);
}

function at(time: number): void {
	vi.setSystemTime(time);
}

describe("the schedule", () => {
	test("a scheduled ask starts a full run at a slot of the day's plan and nothing in between", async () => {
		const t = setup();
		await deck(t);

		await fullRun(t);
		at(NOW + 10 * MINUTE);
		expect(await scheduledAsk(t)).toEqual({
			runId: null,
			alreadyOpen: false,
			kind: null,
			lastCheckPage: null,
			startDelayMs: 0,
		});
		at(NOW + 3 * HOUR);
		expect((await scheduledAsk(t)).runId).toBeNull();
		at(NOW + 3 * HOUR + 10 * MINUTE);
		expect((await scheduledAsk(t)).kind).toBe("full");
	});

	test("a run from T3 Code or by hand is always a full run", async () => {
		const t = setup();
		await deck(t);
		await fullRun(t);

		at(NOW + 10 * MINUTE);
		const asked = (await automation(t, {
			op: "request",
			trigger: "manual",
		})) as Asked;

		expect(asked).toMatchObject({ alreadyOpen: false, kind: "full" });
		expect(asked.runId).not.toBeNull();
	});
});

describe("refresh visits", () => {
	test("about 20 minutes before a matched auction ends, a refresh run visits its Search's ending-soonest auctions", async () => {
		const t = setup();
		await deck(t);
		const endsAt = NOW + 2 * HOUR;
		await capture(t, { endsAt });
		at(endsAt - HOUR);
		await fullRun(t);

		// Not yet: the window opens 28 minutes before the end.
		at(endsAt - 30 * MINUTE);
		expect((await scheduledAsk(t)).runId).toBeNull();
		at(endsAt - 25 * MINUTE);
		expect((await scheduledAsk(t)).kind).toBe("refresh");

		expect((await claim(t)).visits).toEqual([
			{ url: ASH_ENDING_SOON, kind: "ebayEndingSoon", label: "RA01-EN008" },
		]);
	});

	test("a refresh run claimed after its start delay still visits the auction asked for near the window's end", async () => {
		const t = setup();
		await deck(t);
		const endsAt = NOW + 2 * HOUR;
		await capture(t, { endsAt });
		at(endsAt - HOUR);
		await fullRun(t);

		at(endsAt - 18 * MINUTE);
		expect((await scheduledAsk(t)).kind).toBe("refresh");
		// Up to 90 s of start delay, then Chrome opens and the extension claims.
		at(endsAt - 16 * MINUTE);

		expect((await claim(t)).visits).toEqual([
			{ url: ASH_ENDING_SOON, kind: "ebayEndingSoon", label: "RA01-EN008" },
		]);
	});

	test("auctions ending close together share one run, one page per Search, soonest first", async () => {
		const t = setup();
		await deck(t);
		const first = NOW + 2 * HOUR;
		await capture(
			t,
			calledAuction(first),
			{ endsAt: first + 12 * MINUTE },
			{ endsAt: first + 15 * MINUTE },
		);
		at(first - HOUR);
		await fullRun(t);

		at(first - 25 * MINUTE);
		expect((await scheduledAsk(t)).kind).toBe("refresh");
		const { visits } = await claim(t);

		expect(visits).toEqual([
			{
				url: CALLED_ENDING_SOON,
				kind: "ebayEndingSoon",
				label: "RA01-EN060",
			},
			{ url: ASH_ENDING_SOON, kind: "ebayEndingSoon", label: "RA01-EN008" },
		]);
	});

	test("a run that saw an auction coalesced into it isn't followed by another for it", async () => {
		const t = setup();
		await deck(t);
		const first = NOW + 2 * HOUR;
		const [, later] = await capture(t, calledAuction(first), {
			endsAt: first + 15 * MINUTE,
		});
		at(first - HOUR);
		await fullRun(t);
		at(first - 25 * MINUTE);
		await scheduledAsk(t);
		await runIt(t);
		await capture(t, { endsAt: first + 15 * MINUTE, itemId: later });

		// The later auction's own window: it was seen 20 minutes ago.
		at(first + 15 * MINUTE - 25 * MINUTE);
		expect((await scheduledAsk(t)).runId).toBeNull();
	});

	test("only matched, Qualifying auctions on Cards I still need get a refresh", async () => {
		const t = setup();
		const { ash } = await deck(t);
		const endsAt = NOW + 2 * HOUR;
		await capture(
			t,
			// Not one of my Printings.
			{ endsAt, title: "Maxx C RA01-EN001 Quarter Century Secret Rare" },
			// Not Qualifying.
			{ endsAt, read: { graded: true, gradingCompany: "PSA" } },
			{ endsAt, title: "Ash Blossom RA01-KR008 Quarter Century Secret Rare" },
		);
		at(endsAt - HOUR);
		await fullRun(t);
		at(endsAt - 25 * MINUTE);
		expect((await scheduledAsk(t)).runId).toBeNull();
	});

	test("no refresh for a Card I have all the Copies of", async () => {
		const t = setup();
		const { ash } = await deck(t);
		const endsAt = NOW + 2 * HOUR;
		await capture(t, { endsAt });
		await t.mutation(api.yugioh.decks.updateCard, {
			deckCardId: ash,
			copiesOwned: 3,
		});
		at(endsAt - HOUR);
		await fullRun(t);

		at(endsAt - 25 * MINUTE);
		expect((await scheduledAsk(t)).runId).toBeNull();
	});

	test("no refresh while no device has push on", async () => {
		const t = setup();
		await deck(t);
		const endsAt = NOW + 2 * HOUR;
		await capture(t, { endsAt });
		at(endsAt - HOUR);
		await fullRun(t);
		await t.mutation(api.yugioh.pushes.removePushSubscription, {
			endpoint: "https://web.push.apple.com/phone",
		});

		at(endsAt - 25 * MINUTE);
		expect((await scheduledAsk(t)).runId).toBeNull();
	});

	test("a full run puts the pages of auctions ending soon first", async () => {
		const t = setup();
		await deck(t);
		const endsAt = NOW + 3 * HOUR + 30 * MINUTE;
		await capture(t, { endsAt });
		await fullRun(t);

		// The 11:07 AM slot.
		at(NOW + 3 * HOUR + 10 * MINUTE);
		expect((await scheduledAsk(t)).kind).toBe("full");
		const { visits } = await claim(t);

		expect(visits[0]).toEqual({
			url: ASH_ENDING_SOON,
			kind: "ebayEndingSoon",
			label: "RA01-EN008",
		});
		expect(visits.slice(1).map((visit) => visit.kind)).toEqual([
			"ebayNewlyListed",
			"ebaySold",
			"ebayNewlyListed",
			"ebaySold",
		]);
	});

	test("a refresh whose page failed (a captcha) isn't tried again 10 minutes later", async () => {
		const t = setup();
		await deck(t);
		const endsAt = NOW + 2 * HOUR;
		await capture(t, { endsAt });
		at(endsAt - HOUR);
		await fullRun(t);
		at(endsAt - 28 * MINUTE);
		expect((await scheduledAsk(t)).kind).toBe("refresh");
		await runIt(
			t,
			"eBay asked for a captcha. Open eBay in the automation profile and solve it.",
		);

		at(endsAt - 18 * MINUTE);
		expect((await scheduledAsk(t)).runId).toBeNull();
	});

	test("too late to help the push: under 17 minutes left starts nothing", async () => {
		const t = setup();
		await deck(t);
		const endsAt = NOW + 2 * HOUR;
		await capture(t, { endsAt });
		at(endsAt - HOUR);
		await fullRun(t);

		at(endsAt - 16 * MINUTE);
		expect((await scheduledAsk(t)).runId).toBeNull();
	});
});

/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: adaptive timing (ticket 17). Once about 4 weeks of Listings exist,
// the app learns the hours of the week (in my time zone) when sellers post
// new Listings for my Printings, and times scheduled full runs around them:
// every hour in a busy hour and the hour after, and otherwise no more than 6
// hours apart. Before that it stays on the fixed 3 hours.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { api } from "../_generated/api";
import schema from "../schema";

vi.mock("../model/yugioh/titleReader", () => ({
	judgeTitle: async (): Promise<TitleJudgments> => ({
		setCode: null,
		rarity: "Quarter Century Secret Rare",
		condition: "nearMint",
		copies: 1,
		language: "english",
		graded: false,
		gradingCompany: null,
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
const DAY = 24 * HOUR;
/** Tuesday 20 October 2026, 8:00 AM in New York (EDT, UTC-4). */
const NOW = Date.UTC(2026, 9, 20, 12, 0);
/** Sunday 25 October 2026, 7:00 PM in New York. */
const SUNDAY_7PM = Date.UTC(2026, 9, 25, 23, 0);

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	// Each full run's gap draw (ticket 19): 0.4 is the fixed 3 hours while
	// learning, and an hour less 1 minute in busy hours.
	vi.spyOn(Math, "random").mockReturnValue(0.4);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function at(time: number): void {
	vi.setSystemTime(time);
}

async function settleNow(t: T): Promise<void> {
	for (let i = 0; i < 5; i++) {
		vi.advanceTimersByTime(1000);
		await t.finishInProgressScheduledFunctions();
	}
}

/** A Deck needing Ash Blossom (RA01-EN008), with my phone in New York. */
async function deck(t: T): Promise<void> {
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
	await settleNow(t);
	await t.mutation(api.yugioh.pushes.savePushSubscription, {
		endpoint: "https://web.push.apple.com/phone",
		keys: { p256dh: "p256dh", auth: "auth" },
		timeZone: "America/New_York",
	});
}

let nextItemId = 407800000000;

/**
 * Captures Ash Blossom buy-it-now Listings that eBay says went up at
 * `listedTimes`, as a Newly Listed page would send them now.
 */
async function capture(t: T, listedTimes: number[]): Promise<void> {
	const listings = listedTimes.map((listedAt) => {
		const id = String(nextItemId++);
		return {
			itemId: id,
			url: `https://www.ebay.com/itm/${id}`,
			title: `Ash Blossom RA01-EN008 Quarter Century Secret Rare #${id}`,
			imageUrl: null,
			price: 40,
			currency: "USD",
			shipping: 0,
			listingType: "buyItNow",
			bids: null,
			endsAt: null,
			listedAt,
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
}

/**
 * The fixed distribution: sellers post on Sunday evenings, 7 PM New York
 * (four Sundays running), plus one Listing a day at other hours.
 */
function sundayEveningsAndAQuietDay(): number[] {
	const sundays = [1, 2, 3, 4].map(
		(week) => SUNDAY_7PM - week * 7 * DAY + 20 * MINUTE,
	);
	const daily = Array.from(
		{ length: 20 },
		(_, day) => NOW - (day + 1) * DAY + (day % 12) * HOUR,
	);
	return [...sundays, ...daily];
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

/** What the LaunchAgent's ask at the current time starts: a kind, or null. */
async function scheduledAsk(t: T): Promise<string | null> {
	const asked = (await automation(t, {
		op: "request",
		trigger: "launchAgent",
	})) as { kind: string | null };
	return asked.kind;
}

/** Claims and finishes the run asked for, at the current time. */
async function runIt(t: T): Promise<void> {
	const { run } = (await automation(t, { op: "claim" })) as {
		run: { runId: string } | null;
	};
	if (!run) throw new Error("nothing to claim");
	await automation(t, { op: "finish", runId: run.runId, error: null });
}

async function fullRun(t: T): Promise<void> {
	expect(await scheduledAsk(t)).toBe("full");
	await runIt(t);
}

/** Captures the first Listing `days` before NOW, then the distribution. */
async function dataFor(t: T, days: number): Promise<void> {
	at(NOW - days * DAY);
	await capture(t, [NOW - days * DAY - HOUR]);
	at(NOW - HOUR);
	await capture(t, sundayEveningsAndAQuietDay());
	at(NOW);
}

describe("before about 4 weeks of data", () => {
	test("full runs stay on the fixed 3 hours, and Settings says how many days it has", async () => {
		const t = setup();
		await deck(t);
		await dataFor(t, 12);
		await fullRun(t);

		at(NOW + 2 * HOUR + 50 * MINUTE);
		expect(await scheduledAsk(t)).toBeNull();
		at(NOW + 3 * HOUR);
		expect(await scheduledAsk(t)).toBe("full");

		expect(await t.query(api.yugioh.automation.getRunTiming, {})).toEqual({
			status: "learning",
			dataSince: NOW - 12 * DAY,
			timeZone: "America/New_York",
			busyHours: [],
		});
	});
});

describe("once the posting times are learned", () => {
	test("Settings shows the busy hours of the week, in my time zone", async () => {
		const t = setup();
		await deck(t);
		await dataFor(t, 30);
		await fullRun(t);

		expect(await t.query(api.yugioh.automation.getRunTiming, {})).toEqual({
			status: "learned",
			dataSince: NOW - 30 * DAY,
			timeZone: "America/New_York",
			// Sunday 7 PM: hour 19 of a week that starts Sunday midnight.
			busyHours: [19],
		});
	});

	test("outside busy hours, full runs spread out but never more than 6 hours apart", async () => {
		// The longest gap draw.
		vi.spyOn(Math, "random").mockReturnValue(1);
		const t = setup();
		await deck(t);
		await dataFor(t, 30);
		await fullRun(t);

		at(NOW + 3 * HOUR);
		expect(await scheduledAsk(t)).toBeNull();
		at(NOW + 5 * HOUR + 30 * MINUTE);
		expect(await scheduledAsk(t)).toBeNull();
		at(NOW + 5 * HOUR + 40 * MINUTE);
		expect(await scheduledAsk(t)).toBe("full");
	});

	test("a busy hour and the hour after get a full run every hour", async () => {
		const t = setup();
		await deck(t);
		await dataFor(t, 30);
		await fullRun(t);

		at(SUNDAY_7PM - 50 * MINUTE);
		await fullRun(t);
		at(SUNDAY_7PM + 10 * MINUTE);
		await fullRun(t);
		at(SUNDAY_7PM + 70 * MINUTE);
		await fullRun(t);
		// 9 PM is quiet again.
		at(SUNDAY_7PM + 130 * MINUTE);
		expect(await scheduledAsk(t)).toBeNull();
	});

	test("a run from T3 Code or by hand is still always a full run", async () => {
		const t = setup();
		await deck(t);
		await dataFor(t, 30);
		await fullRun(t);

		at(NOW + 10 * MINUTE);
		const asked = (await automation(t, {
			op: "request",
			trigger: "manual",
		})) as { kind: string | null };
		expect(asked.kind).toBe("full");
	});
});

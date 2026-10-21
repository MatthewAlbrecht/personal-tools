/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: the daily run schedule. The LaunchAgent asks every 10 minutes; the
// day's first ask draws a plan of 4 full-run slots in my time zone (about
// 7 AM, 11 AM, 3 PM and 7 PM, sometimes one skipped) and stores it, so every
// later ask that day gets the same answer. A slot missed while the Mac slept
// runs once on wake. A scheduled full run visits TCGplayer only when no run
// did in the last 10 hours. Math.random is the injected draw.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

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
const ZONE = "America/New_York";

/** A local time on Wednesday 21 October 2026 in New York (EDT, UTC-4). */
function wednesday(hour: number, minute = 0): number {
	return Date.UTC(2026, 9, 21, hour + 4, minute);
}

/**
 * With every draw 0.5, the day's slots are 7:30 AM, 11:30 AM, 3:30 PM and
 * 7:30 PM, none skipped, and a scheduled run waits 2 minutes to start.
 */
const SLOTS = [
	wednesday(7, 30),
	wednesday(11, 30),
	wednesday(15, 30),
	wednesday(19, 30),
];

const ASH_PRODUCT =
	"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare";

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(wednesday(0, 10));
	vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function at(time: number): void {
	vi.setSystemTime(time);
}

/** The next draws Math.random gives, in order, before it goes back to 0.5. */
function draws(...values: number[]): void {
	const spy = vi.spyOn(Math, "random");
	for (const value of values) spy.mockReturnValueOnce(value);
}

async function automation(
	t: T,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const res = await t.fetch("/server/yugioh/automation", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify(body),
	});
	expect(res.status).toBe(200);
	return (await res.json()) as Record<string, unknown>;
}

async function ask(
	t: T,
	trigger: "launchAgent" | "manual" = "launchAgent",
): Promise<Record<string, unknown>> {
	return await automation(t, { op: "request", trigger });
}

/** What a scheduled ask at the current time starts: a kind, or null. */
async function scheduledKind(t: T): Promise<unknown> {
	return (await ask(t)).kind;
}

type Visit = { url: string; kind: string; label: string };

/** Claims the run asked for, reports every page and finishes it; its visits. */
async function runIt(t: T): Promise<Visit[]> {
	const { run } = (await automation(t, { op: "claim" })) as {
		run: { runId: string; visits: Visit[] } | null;
	};
	if (!run) throw new Error("nothing to claim");
	for (const visit of run.visits) {
		await automation(t, {
			op: "visit",
			runId: run.runId,
			visit: { ...visit, listingsCaptured: 0, newListings: 0, error: null },
		});
	}
	await automation(t, { op: "finish", runId: run.runId, error: null });
	return run.visits;
}

/** A scheduled ask now starts a full run, which runs to its end. */
async function scheduledFullRun(t: T): Promise<Visit[]> {
	expect(await scheduledKind(t)).toBe("full");
	return await runIt(t);
}

/** My phone is in New York (my time zone). */
async function phoneInNewYork(t: T): Promise<void> {
	await t.run(async (ctx) => {
		await ctx.db.insert("yugiohPushSubscriptions", {
			endpoint: "https://web.push.apple.com/phone",
			p256dh: "p256dh",
			auth: "auth",
			timeZone: ZONE,
			createdAt: wednesday(0),
			lastSeenAt: wednesday(0),
		});
	});
}

/** A Deck needing Ash Blossom, whose Printing has a TCGplayer product page. */
async function deckWithProductPage(t: T): Promise<void> {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Snake-Eye",
	});
	await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		section: "main",
		copiesNeeded: 3,
		cardName: "Ash Blossom & Joyous Spring",
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
		overloadedRarities: [],
	});
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const printingId = deck?.sections[0]?.cards[0]?.candidates[0]?.printingId as
		| Id<"yugiohPrintings">
		| undefined;
	if (!printingId) throw new Error("missing Printing");
	await t.run(async (ctx) => {
		await ctx.db.patch("yugiohPrintings", printingId, {
			tcgplayerStatus: "found",
			tcgplayerProductUrl: ASH_PRODUCT,
		});
	});
}

function kinds(visits: Visit[]): string[] {
	return [...new Set(visits.map((visit) => visit.kind))];
}

describe("the day's plan", () => {
	test("the day's first ask draws 4 slots, from between 6 and 9 AM about 4 hours apart, and Settings shows them", async () => {
		const t = setup();
		await phoneInNewYork(t);

		expect(await scheduledKind(t)).toBeNull();

		expect(await t.query(api.yugioh.automation.getRunDay, {})).toEqual({
			date: "2026-10-21",
			timeZone: ZONE,
			slots: SLOTS.map((slot) => ({ at: slot, status: "planned" })),
		});
	});

	test("it's drawn once: later asks that day keep it", async () => {
		const t = setup();
		await phoneInNewYork(t);
		expect(await scheduledKind(t)).toBeNull();

		// Redrawn with 0, the first slot would be 6 AM and due by now.
		vi.spyOn(Math, "random").mockReturnValue(0);
		at(wednesday(7, 20));
		expect(await scheduledKind(t)).toBeNull();
		at(wednesday(7, 30));
		expect(await scheduledKind(t)).toBe("full");
	});

	test("a full run at each slot, and none between", async () => {
		const t = setup();
		await phoneInNewYork(t);

		at(wednesday(7, 30));
		await scheduledFullRun(t);
		for (const time of [wednesday(7, 40), wednesday(9), wednesday(11, 20)]) {
			at(time);
			expect(await scheduledKind(t)).toBeNull();
		}
		at(wednesday(11, 30));
		await scheduledFullRun(t);
		at(wednesday(15, 30));
		await scheduledFullRun(t);
		at(wednesday(19, 30));
		await scheduledFullRun(t);
		at(wednesday(23, 50));
		expect(await scheduledKind(t)).toBeNull();
	});

	test("about 1 day in 3 skips a slot", async () => {
		const t = setup();
		await phoneInNewYork(t);
		// First slot, three gaps, skip (0.1 < 1/3), which slot (0.3: the 2nd).
		draws(0.5, 0.5, 0.5, 0.5, 0.1, 0.3);

		at(wednesday(7, 30));
		await scheduledFullRun(t);
		at(wednesday(11, 30));
		expect(await scheduledKind(t)).toBeNull();
		at(wednesday(15, 30));
		await scheduledFullRun(t);

		const day = await t.query(api.yugioh.automation.getRunDay, {});
		expect(day?.slots.map((slot) => slot.status)).toEqual([
			"ran",
			"skipped",
			"ran",
			"planned",
		]);
	});
});

describe("missed slots", () => {
	test("slots slept through give one run on wake, not one each", async () => {
		const t = setup();
		await phoneInNewYork(t);
		at(wednesday(7, 30));
		await scheduledFullRun(t);

		// Asleep through 11:30 and 3:30.
		at(wednesday(16, 0));
		await scheduledFullRun(t);
		at(wednesday(16, 10));
		expect(await scheduledKind(t)).toBeNull();
		at(wednesday(19, 30));
		expect(await scheduledKind(t)).toBe("full");

		const day = await t.query(api.yugioh.automation.getRunDay, {});
		expect(day?.slots.map((slot) => slot.status)).toEqual([
			"ran",
			"passed",
			"ran",
			"ran",
		]);
	});

	test("yesterday's missed slot isn't made up for: no full run outside the day's plan", async () => {
		const t = setup();
		await phoneInNewYork(t);
		at(wednesday(15, 30));
		await scheduledFullRun(t);

		// Asleep through 7:30 PM; Thursday 12:10 AM draws Thursday's plan.
		at(wednesday(24, 10));
		expect(await scheduledKind(t)).toBeNull();
		expect((await t.query(api.yugioh.automation.getRunDay, {}))?.date).toBe(
			"2026-10-22",
		);
	});

	test("a slot that comes due while a hand run is going is covered by it", async () => {
		const t = setup();
		await phoneInNewYork(t);
		at(wednesday(7, 0));
		expect((await ask(t, "manual")).kind).toBe("full");
		at(wednesday(7, 30));
		expect((await ask(t)).alreadyOpen).toBe(true);
		at(wednesday(8, 0));
		await runIt(t);

		at(wednesday(8, 10));
		expect(await scheduledKind(t)).toBeNull();
		at(wednesday(11, 30));
		expect(await scheduledKind(t)).toBe("full");
	});
});

describe("a run left open while the Mac slept", () => {
	test("doesn't swallow the slot due on wake", async () => {
		const t = setup();
		await phoneInNewYork(t);
		at(wednesday(7, 30));
		expect(await scheduledKind(t)).toBe("full");
		await automation(t, { op: "claim" });

		// Asleep mid-run until 4 PM: the open run is closed as abandoned, and
		// the 3:30 slot still runs.
		at(wednesday(16, 0));
		expect(await ask(t)).toMatchObject({ kind: "full", alreadyOpen: false });
	});
});

describe("TCGplayer twice a day", () => {
	test("a scheduled full run visits TCGplayer only when no run did in the last 10 hours", async () => {
		const t = setup();
		await phoneInNewYork(t);
		await deckWithProductPage(t);

		at(SLOTS[0] ?? 0);
		expect(kinds(await scheduledFullRun(t))).toEqual([
			"ebayNewlyListed",
			"ebaySold",
			"tcgplayer",
		]);
		at(SLOTS[1] ?? 0);
		expect(kinds(await scheduledFullRun(t))).toEqual([
			"ebayNewlyListed",
			"ebaySold",
		]);
		at(SLOTS[2] ?? 0);
		expect(kinds(await scheduledFullRun(t))).not.toContain("tcgplayer");
		// 12 hours after the first.
		at(SLOTS[3] ?? 0);
		expect(kinds(await scheduledFullRun(t))).toContain("tcgplayer");
	});

	test("a hand run always visits TCGplayer", async () => {
		const t = setup();
		await phoneInNewYork(t);
		await deckWithProductPage(t);
		at(SLOTS[0] ?? 0);
		await scheduledFullRun(t);

		at(wednesday(9));
		expect((await ask(t, "manual")).kind).toBe("full");
		expect(kinds(await runIt(t))).toContain("tcgplayer");
	});
});

describe("the start delay", () => {
	test("a scheduled full run waits 0 to 4 minutes, by a draw", async () => {
		const t = setup();
		at(wednesday(7, 30));
		await phoneInNewYork(t);
		expect(await ask(t)).toMatchObject({
			kind: "full",
			startDelayMs: 2 * MINUTE,
		});
	});

	test("a hand run doesn't wait, at any hour", async () => {
		const t = setup();
		await phoneInNewYork(t);
		at(wednesday(3));
		expect(await ask(t, "manual")).toMatchObject({
			kind: "full",
			startDelayMs: 0,
		});
	});

	test("nothing due: no wait", async () => {
		const t = setup();
		await phoneInNewYork(t);
		expect(await ask(t)).toEqual({
			runId: null,
			alreadyOpen: false,
			kind: null,
			lastCheckPage: null,
			startDelayMs: 0,
		});
	});
});

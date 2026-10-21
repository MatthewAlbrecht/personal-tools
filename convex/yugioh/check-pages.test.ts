/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: a run that hits a check page (ticket 18). When eBay or TCGplayer
// serves a captcha or bot challenge instead of results, the extension reports
// that page as challenged. The run ends there, a push says where it stopped
// (at any hour, once per run), and no scheduled run starts for 6 hours. Hand
// and T3 Code runs still start, and say the last run hit a check page.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const fakes = vi.hoisted(() => ({
	sent: [] as Array<{
		at: number;
		payload: { title: string; body: string; url: string; tag: string };
	}>,
}));

vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async () => [],
	fetchTcgplayerProduct: async () => null,
}));

vi.mock("../model/yugioh/webPushSender", () => ({
	sendWebPush: async (_subscription: unknown, payload: string) => {
		fakes.sent.push({ at: Date.now(), payload: JSON.parse(payload) });
		return { status: "sent" };
	},
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** 12:00 UTC: 6am in Denver, inside quiet hours there. */
const NOW = Date.UTC(2026, 9, 20, 12, 0);

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	fakes.sent = [];
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

/** One call to the automation server channel, as the Next route forwards it. */
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

type Visit = { url: string; kind: string; label: string };

/** A Deck whose Searches give a run at least two eBay pages. */
async function deckWithSearches(t: T): Promise<void> {
	const deckId: Id<"yugiohDecks"> = await t.mutation(
		api.yugioh.decks.createDeck,
		{ name: "Snake-Eye" },
	);
	for (const card of [
		{ cardName: "Ash Blossom & Joyous Spring", setCode: "RA01-EN008" },
		{ cardName: "Called by the Grave", setCode: "RA01-EN060" },
	]) {
		await t.mutation(api.yugioh.decks.addCard, {
			deckId,
			section: "main",
			copiesNeeded: 3,
			rarity: "Quarter Century Secret Rare",
			overloadedRarities: [],
			...card,
		});
	}
	await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Asks for a run and claims it, as the script and the extension do. */
async function startRun(
	t: T,
	trigger = "manual",
): Promise<{ runId: string; visits: Visit[] }> {
	await automation(t, { op: "request", trigger });
	const { run } = (await automation(t, { op: "claim" })) as {
		run: { runId: string; visits: Visit[] };
	};
	return run;
}

function captured(visit: Visit) {
	return {
		...visit,
		listingsCaptured: 0,
		newListings: 0,
		error: null,
	};
}

function challenged(visit: Visit) {
	return {
		...visit,
		listingsCaptured: 0,
		newListings: 0,
		error: "eBay showed a check page (a captcha) instead of results.",
		challenged: true,
	};
}

/** Turns push on for a phone in Denver, where NOW is 6am (quiet hours). */
async function turnOnPush(t: T): Promise<void> {
	await t.mutation(api.yugioh.pushes.savePushSubscription, {
		endpoint: "https://web.push.apple.com/phone",
		keys: { p256dh: "p256dh", auth: "auth" },
		timeZone: "America/Denver",
	});
}

/** A run that stopped on a check page at its second page. */
async function runStoppedOnCheckPage(t: T): Promise<string> {
	const run = await startRun(t);
	const [first, second] = run.visits;
	if (!first || !second) throw new Error("expected a plan");
	await automation(t, {
		op: "visit",
		runId: run.runId,
		visit: captured(first),
	});
	await automation(t, {
		op: "visit",
		runId: run.runId,
		visit: challenged(second),
	});
	return run.runId;
}

describe("a challenged page ends the run", () => {
	test("the run stops there, as stopped by a check page, with the page it hit", async () => {
		const t = setup();
		await deckWithSearches(t);
		const run = await startRun(t);
		const [first, second] = run.visits;
		if (!first || !second) throw new Error("expected a plan");

		const ok = await automation(t, {
			op: "visit",
			runId: run.runId,
			visit: captured(first),
		});
		expect(ok).toEqual({ running: true });
		vi.advanceTimersByTime(MINUTE);
		const stopped = await automation(t, {
			op: "visit",
			runId: run.runId,
			visit: challenged(second),
		});
		// The extension visits no further pages.
		expect(stopped).toEqual({ running: false });
		const late = await automation(t, {
			op: "visit",
			runId: run.runId,
			visit: captured(first),
		});
		expect(late).toEqual({ running: false });

		const [listed] = await t.query(api.yugioh.automation.listRuns, {});
		expect(listed).toMatchObject({
			status: "challenged",
			endedAt: NOW + MINUTE,
			pagesVisited: 2,
			failedPages: 1,
			checkPage: {
				marketplace: "ebay",
				kind: second.kind,
				label: second.label,
				url: second.url,
			},
			pageErrors: [
				{
					kind: second.kind,
					label: second.label,
					error: "eBay showed a check page (a captcha) instead of results.",
				},
			],
		});
		// The script sees it ended.
		const status = (await automation(t, {
			op: "status",
			runId: run.runId,
		})) as { run: { status: string } };
		expect(status.run.status).toBe("challenged");
	});

	test("the script's finish after a check page leaves it stopped by the check page", async () => {
		const t = setup();
		await deckWithSearches(t);
		const runId = await runStoppedOnCheckPage(t);

		await automation(t, { op: "finish", runId, error: null });

		const [listed] = await t.query(api.yugioh.automation.listRuns, {});
		expect(listed?.status).toBe("challenged");
	});

	test("a TCGplayer check page names TCGplayer", async () => {
		const t = setup();
		await deckWithSearches(t);
		const run = await startRun(t);
		await automation(t, {
			op: "visit",
			runId: run.runId,
			visit: challenged({
				url: "https://www.tcgplayer.com/product/524817/x",
				kind: "tcgplayer",
				label: "Ash Blossom & Joyous Spring RA01-EN008",
			}),
		});

		const [listed] = await t.query(api.yugioh.automation.listRuns, {});
		expect(listed?.checkPage?.marketplace).toBe("tcgplayer");
	});
});

describe("the push", () => {
	test("says where the run stopped, at once even in quiet hours, once per run", async () => {
		const t = setup();
		await deckWithSearches(t);
		await turnOnPush(t);

		const runId = await runStoppedOnCheckPage(t);
		// A second report for the ended run changes nothing.
		await automation(t, {
			op: "visit",
			runId,
			visit: challenged({
				url: "https://www.ebay.com/sch/i.html?_nkw=x",
				kind: "ebaySold",
				label: "RA01-EN060",
			}),
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(fakes.sent).toHaveLength(1);
		expect(fakes.sent[0]?.at).toBe(NOW);
		expect(fakes.sent[0]?.payload).toMatchObject({
			title: "Run stopped on a check page at eBay",
			url: "/yugioh/settings#automated-runs",
		});
		expect(fakes.sent[0]?.payload.body).toContain("automation Chrome profile");
	});

	test("no push without a device that has push on", async () => {
		const t = setup();
		await deckWithSearches(t);
		await runStoppedOnCheckPage(t);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(fakes.sent).toEqual([]);
		const pushes = await t.run(
			async (ctx) => await ctx.db.query("yugiohPushes").take(10),
		);
		expect(pushes).toEqual([]);
	});
});

describe("the cool-down", () => {
	test("no scheduled run of any kind for 6 hours; the slots in them are skipped, not made up for", async () => {
		// Every draw 0.5: today's slots are 7:30 AM, 11:30 AM, 3:30 PM and
		// 7:30 PM in Denver; the run stopped at 6 AM, so the cool-down runs to
		// noon.
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const t = setup();
		await deckWithSearches(t);
		await runStoppedOnCheckPage(t);
		const scheduledAsk = async () =>
			await automation(t, { op: "request", trigger: "launchAgent" });

		vi.setSystemTime(NOW + 5 * HOUR + 50 * MINUTE);
		expect(await scheduledAsk()).toMatchObject({ runId: null, kind: null });

		vi.setSystemTime(NOW + 6 * HOUR);
		expect(await scheduledAsk()).toMatchObject({ runId: null, kind: null });

		vi.setSystemTime(NOW + 9 * HOUR + 30 * MINUTE);
		expect(await scheduledAsk()).toMatchObject({
			kind: "full",
			alreadyOpen: false,
		});
		vi.restoreAllMocks();
	});

	test.each(["manual", "t3"])(
		"a %s run still starts, and says the last run hit a check page",
		async (trigger) => {
			const t = setup();
			await deckWithSearches(t);
			await runStoppedOnCheckPage(t);

			vi.setSystemTime(NOW + HOUR);
			const reply = await automation(t, { op: "request", trigger });

			expect(reply).toMatchObject({
				kind: "full",
				alreadyOpen: false,
				lastCheckPage: {
					marketplace: "ebay",
					at: NOW,
					coolDownEndsAt: NOW + 6 * HOUR,
				},
			});
			expect(reply.runId).not.toBe(null);
		},
	);

	test("a hand run after the cool-down doesn't mention the check page", async () => {
		const t = setup();
		await deckWithSearches(t);
		await runStoppedOnCheckPage(t);

		vi.setSystemTime(NOW + 7 * HOUR);
		const reply = await automation(t, { op: "request", trigger: "manual" });

		expect(reply.lastCheckPage).toBe(null);
	});
});

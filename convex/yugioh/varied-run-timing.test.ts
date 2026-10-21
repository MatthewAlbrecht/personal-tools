/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: varied run timing (ticket 19). Scheduled runs stop looking
// clockwork: the gap after a full run is picked at random when it ends and
// stored on it, so the next ask's answer is deterministic; a scheduled run
// waits a random moment before it starts; and no full run starts from 1 to 7
// AM in my time zone. Math.random is the injected draw.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../schema";

vi.mock("../model/yugioh/webPushSender", () => ({
	sendWebPush: async () => ({ status: "sent" }),
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** Tuesday 20 October 2026, noon in New York (EDT, UTC-4), 10 AM in Denver. */
const NOW = Date.UTC(2026, 9, 20, 16, 0);

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
	vi.restoreAllMocks();
});

function at(time: number): void {
	vi.setSystemTime(time);
}

/** The next draws Math.random gives, in order. */
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

/** Runs the run asked for to its end, at the current time. */
async function runIt(t: T): Promise<void> {
	const { run } = (await automation(t, { op: "claim" })) as {
		run: { runId: string } | null;
	};
	if (!run) throw new Error("nothing to claim");
	await automation(t, { op: "finish", runId: run.runId, error: null });
}

/** My phone is in New York (my time zone). */
async function phoneInNewYork(t: T): Promise<void> {
	await t.run(async (ctx) => {
		await ctx.db.insert("yugiohPushSubscriptions", {
			endpoint: "https://web.push.apple.com/phone",
			p256dh: "p256dh",
			auth: "auth",
			timeZone: "America/New_York",
			createdAt: NOW,
			lastSeenAt: NOW,
		});
	});
}

describe("the gap after a full run", () => {
	test("is drawn when the run ends: the shortest draw gives 2½ hours", async () => {
		const t = setup();
		await ask(t, "manual");
		draws(0);
		await runIt(t);

		at(NOW + 2 * HOUR + 20 * MINUTE);
		expect((await ask(t)).runId).toBeNull();
		at(NOW + 2 * HOUR + 30 * MINUTE);
		expect((await ask(t)).kind).toBe("full");
	});

	test("the longest draw gives 3¾ hours, and it stays put between asks", async () => {
		const t = setup();
		await ask(t, "manual");
		draws(1);
		await runIt(t);

		for (const minutes of [150, 180, 210]) {
			at(NOW + minutes * MINUTE);
			expect((await ask(t)).runId).toBeNull();
		}
		at(NOW + 3 * HOUR + 40 * MINUTE);
		expect((await ask(t)).kind).toBe("full");
	});

	test("a run that stopped on a check page draws one too", async () => {
		const t = setup();
		await ask(t, "manual");
		const { run } = (await automation(t, { op: "claim" })) as {
			run: { runId: string };
		};
		draws(0);
		await automation(t, {
			op: "visit",
			runId: run.runId,
			visit: {
				url: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10",
				kind: "ebayNewlyListed",
				label: "RA01-EN008",
				listingsCaptured: 0,
				newListings: 0,
				error: "eBay is checking for bots.",
				challenged: true,
			},
		});
		const stored = await t.run(
			async (ctx) => await ctx.db.query("yugiohAutomationRuns").first(),
		);
		expect(stored?.gapDraw).toBe(0);
	});
});

describe("the start delay", () => {
	test("a scheduled full run waits 0 to 4 minutes, by a draw", async () => {
		const t = setup();
		draws(0.5);
		expect(await ask(t)).toMatchObject({
			kind: "full",
			startDelayMs: 2 * MINUTE,
		});
	});

	test("a hand run doesn't wait", async () => {
		const t = setup();
		draws(1);
		expect(await ask(t, "manual")).toMatchObject({
			kind: "full",
			startDelayMs: 0,
		});
	});

	test("nothing due: no wait", async () => {
		const t = setup();
		await ask(t, "manual");
		await runIt(t);
		at(NOW + 10 * MINUTE);
		expect(await ask(t)).toEqual({
			runId: null,
			alreadyOpen: false,
			kind: null,
			lastCheckPage: null,
			startDelayMs: 0,
		});
	});
});

describe("overnight", () => {
	test("no scheduled full run from 1 to 7 AM in my time zone; the first ask after 7 starts one", async () => {
		const t = setup();
		await phoneInNewYork(t);
		/** Wednesday 21 October 2026 in New York, at a local hour. */
		function wednesday(hour: number): number {
			return Date.UTC(2026, 9, 21, hour + 4, 0);
		}
		at(wednesday(0) - 6 * HOUR);
		await ask(t, "manual");
		await runIt(t);

		at(wednesday(1));
		expect((await ask(t)).runId).toBeNull();
		at(wednesday(6) + 50 * MINUTE);
		expect((await ask(t)).runId).toBeNull();
		at(wednesday(7));
		expect((await ask(t)).kind).toBe("full");
	});

	test("hand runs still start overnight", async () => {
		const t = setup();
		await phoneInNewYork(t);
		at(Date.UTC(2026, 9, 21, 7, 0));
		expect((await ask(t, "manual")).kind).toBe("full");
	});
});

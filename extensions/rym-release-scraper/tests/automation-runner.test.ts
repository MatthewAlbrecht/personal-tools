// @vitest-environment node
// The automated run as the service worker drives it: claim a run, visit each
// page in its plan with a modest pause between them, report every page, then
// finish. The app, the tabs and the clock are fakes.

import { describe, expect, test } from "vitest";
import "../automation-runner.js";

type Visit = { url: string; kind: string; label: string };
type Outcome = {
	listingsCaptured: number;
	newListings: number;
	error: string | null;
	challenged?: boolean;
};
type Call = Record<string, unknown> & { op: string };

declare global {
	var runAutomatedRun: (deps: {
		call: (body: Call) => Promise<unknown>;
		visitPage: (visit: Visit) => Promise<Outcome>;
		pause: (ms: number) => Promise<void>;
		random: () => number;
	}) => Promise<{ runId: string; pagesVisited: number } | null>;
	var visitOutcome: (response: unknown) => Outcome;
	var checkPageAt: (url: string | undefined) => string | null;
	var MIN_PAUSE_MS: number;
	var MAX_PAUSE_MS: number;
}

const PLAN: Visit[] = [
	{
		url: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10",
		kind: "ebayNewlyListed",
		label: "RA01-EN008",
	},
	{
		url: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_Sold=1&LH_Complete=1&_sop=13",
		kind: "ebaySold",
		label: "RA01-EN008",
	},
	{
		url: "https://www.tcgplayer.com/product/524817/x",
		kind: "tcgplayer",
		label: "Ash Blossom & Joyous Spring RA01-EN008",
	},
];

function fakeRun(
	outcomes: Array<Outcome | Error>,
	{ plan = PLAN, runningFor = Number.POSITIVE_INFINITY } = {},
) {
	const events: string[] = [];
	const calls: Call[] = [];
	let reported = 0;
	const deps = {
		async call(body: Call) {
			calls.push(body);
			events.push(`call ${body.op}`);
			if (body.op === "claim") {
				return { run: plan.length ? { runId: "run1", visits: plan } : null };
			}
			if (body.op === "visit") {
				reported += 1;
				return { running: reported < runningFor };
			}
			return { ok: true };
		},
		async visitPage(visit: Visit) {
			events.push(`visit ${visit.kind}`);
			const outcome = outcomes.shift();
			if (outcome instanceof Error) throw outcome;
			return outcome ?? { listingsCaptured: 0, newListings: 0, error: null };
		},
		async pause(ms: number) {
			events.push(`pause ${ms}`);
		},
		random: () => 0.5,
	};
	return { deps, events, calls };
}

describe("an automated run", () => {
	test("visits each page in order with a pause between, reports each one, then finishes", async () => {
		const { deps, events, calls } = fakeRun([
			{ listingsCaptured: 48, newListings: 12, error: null },
			{ listingsCaptured: 60, newListings: 0, error: null },
			{ listingsCaptured: 15, newListings: 3, error: null },
		]);

		const result = await globalThis.runAutomatedRun(deps);

		expect(result).toEqual({ runId: "run1", pagesVisited: 3 });
		const pause = `pause ${(globalThis.MIN_PAUSE_MS + globalThis.MAX_PAUSE_MS) / 2}`;
		expect(events).toEqual([
			"call claim",
			"visit ebayNewlyListed",
			"call visit",
			pause,
			"visit ebaySold",
			"call visit",
			pause,
			"visit tcgplayer",
			"call visit",
			"call finish",
		]);
		expect(calls.filter((c) => c.op === "visit")[0]).toEqual({
			op: "visit",
			runId: "run1",
			visit: { ...PLAN[0], listingsCaptured: 48, newListings: 12, error: null },
		});
		expect(calls.at(-1)).toEqual({ op: "finish", runId: "run1", error: null });
	});

	test("pauses a modest 15 to 30 seconds between pages", () => {
		expect(globalThis.MIN_PAUSE_MS).toBe(15_000);
		expect(globalThis.MAX_PAUSE_MS).toBe(30_000);
	});

	test("does nothing when no run was asked for", async () => {
		const { deps, events } = fakeRun([], { plan: [] });
		expect(await globalThis.runAutomatedRun(deps)).toBe(null);
		expect(events).toEqual(["call claim"]);
	});

	test("a page that breaks is reported with its error and the run goes on", async () => {
		const { deps, calls } = fakeRun([
			new Error("No tab with id: 12."),
			{ listingsCaptured: 60, newListings: 0, error: null },
		]);

		await globalThis.runAutomatedRun(deps);

		const visits = calls.filter((c) => c.op === "visit");
		expect(visits).toHaveLength(3);
		expect(visits[0]?.visit).toEqual({
			...PLAN[0],
			listingsCaptured: 0,
			newListings: 0,
			error: "No tab with id: 12.",
		});
		expect(calls.at(-1)).toEqual({ op: "finish", runId: "run1", error: null });
	});

	test("a run that breaks part way is ended with the reason", async () => {
		const { deps, calls } = fakeRun([]);
		const call = deps.call;
		let visits = 0;
		deps.call = async (body: Call) => {
			if (body.op === "visit" && ++visits === 2) {
				throw new Error("Failed to fetch");
			}
			return await call(body);
		};

		await expect(globalThis.runAutomatedRun(deps)).rejects.toThrow(
			"Failed to fetch",
		);
		expect(calls.at(-1)).toEqual({
			op: "finish",
			runId: "run1",
			error: "Stopped after 2 pages: Failed to fetch",
		});
	});

	test("stops when the app says the run has ended", async () => {
		const { deps, events } = fakeRun([], { runningFor: 1 });

		const result = await globalThis.runAutomatedRun(deps);

		expect(result).toEqual({ runId: "run1", pagesVisited: 1 });
		expect(events).toEqual([
			"call claim",
			"visit ebayNewlyListed",
			"call visit",
		]);
	});
});

describe("a check page", () => {
	const CHECK_PAGE: Outcome = {
		listingsCaptured: 0,
		newListings: 0,
		error: "eBay showed a check page instead of results.",
		challenged: true,
	};

	test("ends the run: the page is reported and no further page is visited", async () => {
		const { deps, events, calls } = fakeRun(
			[{ listingsCaptured: 48, newListings: 12, error: null }, CHECK_PAGE],
			// The app ends the run when the check page is reported.
			{ runningFor: 2 },
		);

		const result = await globalThis.runAutomatedRun(deps);

		expect(result).toEqual({
			runId: "run1",
			pagesVisited: 2,
			stoppedOnCheckPage: true,
		});
		expect(events).toEqual([
			"call claim",
			"visit ebayNewlyListed",
			"call visit",
			`pause ${(globalThis.MIN_PAUSE_MS + globalThis.MAX_PAUSE_MS) / 2}`,
			"visit ebaySold",
			"call visit",
		]);
		expect(calls.at(-1)).toEqual({
			op: "visit",
			runId: "run1",
			visit: { ...PLAN[1], ...CHECK_PAGE },
		});
	});

	test("stops even when the app doesn't end the run, and ends it with the reason", async () => {
		const { deps, events, calls } = fakeRun([CHECK_PAGE]);

		await globalThis.runAutomatedRun(deps);

		expect(events).toEqual([
			"call claim",
			"visit ebayNewlyListed",
			"call visit",
			"call finish",
		]);
		expect(calls.at(-1)).toEqual({
			op: "finish",
			runId: "run1",
			error:
				"Stopped on a check page: eBay showed a check page instead of results.",
		});
	});

	test("a check page the content script reported counts as challenged", () => {
		expect(
			globalThis.visitOutcome({
				ok: true,
				empty: true,
				error: "eBay showed a check page instead of results.",
				challenged: true,
			}),
		).toEqual(CHECK_PAGE);
	});

	test("eBay's check pages are known by their URL", () => {
		expect(
			globalThis.checkPageAt(
				"https://www.ebay.com/splashui/captcha?ap=1&appName=orch&ru=https%3A%2F%2Fwww.ebay.com%2Fsch%2Fi.html",
			),
		).toBe("eBay");
		expect(
			globalThis.checkPageAt(
				"https://www.ebay.com/splashui/challenge?ap=1&appName=orch",
			),
		).toBe("eBay");
		expect(
			globalThis.checkPageAt(
				"https://www.ebay.com/sch/i.html?_nkw=splashui%2Fcaptcha",
			),
		).toBe(null);
		expect(
			globalThis.checkPageAt(
				"https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&ru=x",
			),
		).toBe(null);
		expect(globalThis.checkPageAt(undefined)).toBe(null);
	});
});

describe("what a page's capture counts as", () => {
	test("an eBay page counts its Listings, the new ones and the auctions with no end time", () => {
		expect(
			globalThis.visitOutcome({
				ok: true,
				backend: {
					synced: true,
					captured: 48,
					created: 12,
					updated: 36,
					auctionsWithoutEndTime: 2,
				},
			}),
		).toEqual({
			listingsCaptured: 48,
			newListings: 12,
			auctionsWithoutEndTime: 2,
			error: null,
		});
	});

	test("a TCGplayer page counts its Listings and sales", () => {
		expect(
			globalThis.visitOutcome({
				ok: true,
				backend: {
					synced: true,
					printing: { cardName: "Ash", setCode: "RA01-EN008", rarity: "x" },
					listings: 10,
					sales: 5,
					created: 2,
					updated: 13,
				},
			}),
		).toEqual({ listingsCaptured: 15, newListings: 2, error: null });
	});

	test("a TCGplayer product that isn't one of my Printings is an error", () => {
		expect(
			globalThis.visitOutcome({
				ok: true,
				backend: { synced: true, printing: null, listings: 10, sales: 5 },
			}).error,
		).toBe("Not one of your Printings.");
	});

	test("a TCGplayer product the tracker couldn't place gives the tracker's reason", () => {
		const reason =
			"Brionac, Dragon of the Ice Barrier DT01-EN014 Duel Terminal Ultra Parallel Rare isn't in a Deck yet. Add it in the tracker first.";
		expect(
			globalThis.visitOutcome({
				ok: true,
				backend: {
					synced: true,
					printing: null,
					reason,
					listings: 1,
					sales: 0,
				},
			}).error,
		).toBe(reason);
	});

	test("a page with nothing on it captures nothing, without an error", () => {
		expect(globalThis.visitOutcome({ ok: true, empty: true })).toEqual({
			listingsCaptured: 0,
			newListings: 0,
			error: null,
		});
		expect(
			globalThis.visitOutcome({
				ok: true,
				empty: true,
				error: "Not a TCGplayer product page.",
			}).error,
		).toBe("Not a TCGplayer product page.");
	});

	test("a capture the app refused carries the app's reason", () => {
		expect(
			globalThis.visitOutcome({
				ok: true,
				backend: { synced: false, status: 401, error: "Unauthorized" },
			}).error,
		).toBe("Couldn't send the page: Unauthorized.");
		expect(
			globalThis.visitOutcome({
				ok: true,
				backend: {
					synced: false,
					status: 404,
					error:
						"The app at www.moooose.dev doesn't have this capture yet (404).",
				},
			}).error,
		).toBe(
			"Couldn't send the page: The app at www.moooose.dev doesn't have this capture yet (404).",
		);
		expect(
			globalThis.visitOutcome({ ok: true, backend: { skipped: true } }).error,
		).toBe("Couldn't send the page: the ingest secret isn't set.");
	});
});

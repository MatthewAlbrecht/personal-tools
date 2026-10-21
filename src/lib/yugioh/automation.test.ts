import { describe, expect, test } from "vitest";
import {
	MAX_VISITS_PER_RUN,
	buildVisitPlan,
	scheduledRunDue,
	startDelay,
} from "./automation";
import type { RunTiming } from "./run-timing";

const ash = {
	setCodes: ["MP23-EN001", "RA01-EN008"],
	newlyListedUrl: "https://www.ebay.com/sch/i.html?_nkw=ash&_sop=10",
	soldUrl:
		"https://www.ebay.com/sch/i.html?_nkw=ash&LH_Sold=1&LH_Complete=1&_sop=13",
};
const called = {
	setCodes: ["RA01-EN060"],
	newlyListedUrl: "https://www.ebay.com/sch/i.html?_nkw=called&_sop=10",
	soldUrl:
		"https://www.ebay.com/sch/i.html?_nkw=called&LH_Sold=1&LH_Complete=1&_sop=13",
};
const ashProduct = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "MP23-EN001",
	productUrl: "https://www.tcgplayer.com/product/524817/ash",
};

describe("the visit plan", () => {
	test("each Search's Newly Listed then Sold page, then the TCGplayer pages", () => {
		expect(buildVisitPlan([ash, called], [ashProduct], [])).toEqual([
			{
				url: ash.newlyListedUrl,
				kind: "ebayNewlyListed",
				label: "MP23-EN001, RA01-EN008",
			},
			{ url: ash.soldUrl, kind: "ebaySold", label: "MP23-EN001, RA01-EN008" },
			{
				url: called.newlyListedUrl,
				kind: "ebayNewlyListed",
				label: "RA01-EN060",
			},
			{ url: called.soldUrl, kind: "ebaySold", label: "RA01-EN060" },
			{
				url: ashProduct.productUrl,
				kind: "tcgplayer",
				label: "Ash Blossom & Joyous Spring MP23-EN001",
			},
		]);
	});

	test("visits a page once, even when two Printings share a TCGplayer product", () => {
		const plan = buildVisitPlan(
			[ash],
			[ashProduct, { ...ashProduct, setCode: "MP23-EN001a" }],
			[],
		);
		expect(plan.map((visit) => visit.kind)).toEqual([
			"ebayNewlyListed",
			"ebaySold",
			"tcgplayer",
		]);
	});

	test("is capped", () => {
		const many = Array.from({ length: 400 }, (_, i) => ({
			cardName: `Card ${i}`,
			setCode: `SET-EN${i}`,
			productUrl: `https://www.tcgplayer.com/product/${i}/x`,
		}));
		expect(buildVisitPlan([], many, [])).toHaveLength(MAX_VISITS_PER_RUN);
	});
});

describe("when a scheduled ask starts a run", () => {
	const MINUTE = 60 * 1000;
	const HOUR = 60 * MINUTE;
	const NOW = Date.UTC(2026, 9, 20, 12, 0);
	const learning = {
		status: "learning",
		dataSince: null,
		timeZone: "America/New_York",
		busyHours: [],
	} as const satisfies RunTiming;
	const recent = {
		lastFullRunAt: NOW - HOUR,
		lastRunAt: NOW - HOUR,
		lastCheckPageAt: null,
		// Where the gap falls in its range: 0.4 is 3 hours while learning.
		gapDraw: 0.4,
		timing: learning,
	};
	/** An auction ending `minutesLeft` from now, last seen 2 hours ago. */
	function endingIn(minutesLeft: number) {
		return { endsAt: NOW + minutesLeft * MINUTE, lastSeenAt: NOW - 2 * HOUR };
	}

	test("a full run 3 hours after the last (gap draw 0.4), allowing a few minutes' slack", () => {
		expect(scheduledRunDue({ ...recent, auctions: [], now: NOW })).toBe(null);
		expect(
			scheduledRunDue({
				lastFullRunAt: NOW - 3 * HOUR + 4 * MINUTE,
				lastRunAt: null,
				lastCheckPageAt: null,
				gapDraw: 0.4,
				auctions: [],
				timing: learning,
				now: NOW,
			}),
		).toBe("full");
		expect(
			scheduledRunDue({
				lastFullRunAt: null,
				lastRunAt: null,
				lastCheckPageAt: null,
				gapDraw: 0.4,
				auctions: [],
				timing: learning,
				now: NOW,
			}),
		).toBe("full");
	});

	test("a refresh run from 28 to 17 minutes before an auction ends", () => {
		const due = (minutesLeft: number) =>
			scheduledRunDue({
				...recent,
				auctions: [endingIn(minutesLeft)],
				now: NOW,
			});
		expect(due(29)).toBe(null);
		expect(due(28)).toBe("refresh");
		expect(due(17.5)).toBe("refresh");
		expect(due(17)).toBe(null);
	});

	test("no refresh for an auction seen within 45 minutes of its end", () => {
		expect(
			scheduledRunDue({
				...recent,
				auctions: [
					{ endsAt: NOW + 25 * MINUTE, lastSeenAt: NOW - 20 * MINUTE },
				],
				now: NOW,
			}),
		).toBe(null);
	});

	test("nothing for 6 hours after a run stopped on a check page", () => {
		const due = (hoursSinceCheckPage: number) =>
			scheduledRunDue({
				lastFullRunAt: NOW - 8 * HOUR,
				lastRunAt: NOW - 8 * HOUR,
				lastCheckPageAt: NOW - hoursSinceCheckPage * HOUR,
				gapDraw: 0.4,
				auctions: [endingIn(25)],
				timing: learning,
				now: NOW,
			});
		expect(due(1)).toBe(null);
		expect(due(5.99)).toBe(null);
		expect(due(6)).toBe("full");
	});

	test("a refresh run waits out the cool-down too", () => {
		expect(
			scheduledRunDue({
				...recent,
				lastCheckPageAt: NOW - 2 * HOUR,
				auctions: [endingIn(25)],
				now: NOW,
			}),
		).toBe(null);
	});

	test("overnight (1–7 AM), refresh runs still happen but full runs wait", () => {
		/** Wednesday 21 October 2026, 3 AM in New York. */
		const night = Date.UTC(2026, 9, 21, 7, 0);
		const due = (auctions: ReturnType<typeof endingIn>[]) =>
			scheduledRunDue({
				lastFullRunAt: night - 8 * HOUR,
				lastRunAt: night - 8 * HOUR,
				lastCheckPageAt: null,
				gapDraw: 0.4,
				auctions: auctions.map((a) => ({
					...a,
					endsAt: a.endsAt - NOW + night,
					lastSeenAt: night - 2 * HOUR,
				})),
				timing: learning,
				now: night,
			});
		expect(due([])).toBe(null);
		expect(due([endingIn(25)])).toBe("refresh");
	});
});

describe("how long a run waits before it starts", () => {
	const MINUTE = 60 * 1000;

	test("a scheduled full run waits 0 to 4 minutes, by its draw", () => {
		expect(startDelay("launchAgent", "full", 0)).toBe(0);
		expect(startDelay("launchAgent", "full", 0.5)).toBe(2 * MINUTE);
		expect(startDelay("launchAgent", "full", 1)).toBe(4 * MINUTE);
	});

	test("a refresh run waits at most 90 seconds, so its lead before the auction ends holds", () => {
		expect(startDelay("launchAgent", "refresh", 1)).toBe(90 * 1000);
	});

	test("T3 Code and hand runs don't wait", () => {
		expect(startDelay("manual", "full", 1)).toBe(0);
		expect(startDelay("t3", "full", 1)).toBe(0);
	});
});

import { describe, expect, test } from "vitest";
import {
	MAX_VISITS_PER_RUN,
	buildVisitPlan,
	scheduledRunDue,
	startDelay,
	visitsTcgplayer,
} from "./automation";
import type { RunSlot } from "./run-timing";

const ash = {
	setCodes: ["MP23-EN001", "RA01-EN008"],
	newlyListedUrl: "https://www.ebay.com/sch/i.html?_nkw=ash&_sop=10",
	soldUrl:
		"https://www.ebay.com/sch/i.html?_nkw=ash&LH_Sold=1&LH_Complete=1&_sop=13",
	endingSoonUrl: "https://www.ebay.com/sch/i.html?_nkw=ash&LH_Auction=1&_sop=1",
};
const called = {
	setCodes: ["RA01-EN060"],
	newlyListedUrl: "https://www.ebay.com/sch/i.html?_nkw=called&_sop=10",
	soldUrl:
		"https://www.ebay.com/sch/i.html?_nkw=called&LH_Sold=1&LH_Complete=1&_sop=13",
	endingSoonUrl:
		"https://www.ebay.com/sch/i.html?_nkw=called&LH_Auction=1&_sop=1",
};
const ashProduct = {
	cardName: "Ash Blossom & Joyous Spring",
	setCode: "MP23-EN001",
	productUrl: "https://www.tcgplayer.com/product/524817/ash",
};

describe("the visit plan", () => {
	test("each Search's Newly Listed, Sold and Ending soon pages, then the TCGplayer pages", () => {
		expect(buildVisitPlan([ash, called], [ashProduct], [])).toEqual([
			{
				url: ash.newlyListedUrl,
				kind: "ebayNewlyListed",
				label: "MP23-EN001, RA01-EN008",
			},
			{ url: ash.soldUrl, kind: "ebaySold", label: "MP23-EN001, RA01-EN008" },
			{
				url: ash.endingSoonUrl,
				kind: "ebayEndingSoon",
				label: "MP23-EN001, RA01-EN008",
			},
			{
				url: called.newlyListedUrl,
				kind: "ebayNewlyListed",
				label: "RA01-EN060",
			},
			{ url: called.soldUrl, kind: "ebaySold", label: "RA01-EN060" },
			{
				url: called.endingSoonUrl,
				kind: "ebayEndingSoon",
				label: "RA01-EN060",
			},
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
			"ebayEndingSoon",
			"tcgplayer",
		]);
	});

	test("a Search's Ending soon page already visited for an auction about to end stays first, once", () => {
		const refresh = {
			url: called.endingSoonUrl,
			kind: "ebayEndingSoon" as const,
			label: "RA01-EN060",
		};
		const plan = buildVisitPlan([ash, called], [], [refresh]);
		expect(plan[0]).toEqual(refresh);
		expect(
			plan.filter((visit) => visit.url === called.endingSoonUrl),
		).toHaveLength(1);
		expect(plan[1]?.kind).toBe("ebayNewlyListed");
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
	/** Wednesday 21 October 2026, noon in New York. */
	const NOW = Date.UTC(2026, 9, 21, 16, 0);
	/** Today's slots: 7 AM, 11 AM (ran), 3 PM and 7 PM in New York. */
	const slots: RunSlot[] = [
		{ at: NOW - 5 * HOUR, status: "passed" },
		{ at: NOW - HOUR, status: "ran" },
		{ at: NOW + 3 * HOUR, status: "planned" },
		{ at: NOW + 7 * HOUR, status: "planned" },
	];
	const quiet = {
		slots,
		lastFullRunEndedAt: NOW - 40 * MINUTE,
		lastRunAt: NOW - HOUR,
		lastCheckPageAt: null,
	};
	/** An auction ending `minutesLeft` from `now`, last seen 2 hours before. */
	function endingIn(minutesLeft: number, now = NOW) {
		return { endsAt: now + minutesLeft * MINUTE, lastSeenAt: now - 2 * HOUR };
	}

	test("a full run once a planned slot's time has passed, and nothing between slots", () => {
		expect(scheduledRunDue({ ...quiet, auctions: [], now: NOW })).toBe(null);
		expect(
			scheduledRunDue({ ...quiet, auctions: [], now: NOW + 3 * HOUR - MINUTE }),
		).toBe(null);
		expect(
			scheduledRunDue({ ...quiet, auctions: [], now: NOW + 3 * HOUR }),
		).toBe("full");
	});

	test("a slot that came due while a full run was going is covered by it", () => {
		expect(
			scheduledRunDue({
				...quiet,
				lastFullRunEndedAt: NOW + 3 * HOUR + 30 * MINUTE,
				auctions: [],
				now: NOW + 3 * HOUR + 40 * MINUTE,
			}),
		).toBe(null);
	});

	test("a refresh run from 28 to 17 minutes before an auction ends", () => {
		const due = (minutesLeft: number) =>
			scheduledRunDue({
				...quiet,
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
				...quiet,
				auctions: [
					{ endsAt: NOW + 25 * MINUTE, lastSeenAt: NOW - 20 * MINUTE },
				],
				now: NOW,
			}),
		).toBe(null);
	});

	test("nothing for 6 hours after a run stopped on a check page, and the slots in those hours are skipped", () => {
		// 12:30 PM: the cool-down runs to 6:30 PM.
		const checkPageAt = NOW + 30 * MINUTE;
		const due = (now: number, auctions = [endingIn(25, now)]) =>
			scheduledRunDue({
				...quiet,
				lastCheckPageAt: checkPageAt,
				auctions,
				now,
			});
		// The 3 PM slot falls in the cool-down: no full run, no refresh.
		expect(due(NOW + 3 * HOUR)).toBe(null);
		expect(due(checkPageAt + 6 * HOUR - MINUTE)).toBe(null);
		// After it, the 3 PM slot isn't made up for: only refresh runs…
		expect(due(checkPageAt + 6 * HOUR, [])).toBe(null);
		expect(due(checkPageAt + 6 * HOUR)).toBe("refresh");
		// …until the 7 PM slot.
		expect(due(NOW + 7 * HOUR, [])).toBe("full");
	});
});

describe("whether a full run visits TCGplayer", () => {
	const HOUR = 60 * 60 * 1000;
	const NOW = Date.UTC(2026, 9, 21, 16, 0);

	test("a scheduled one does when no run visited TCGplayer in the last 10 hours", () => {
		const visits = (hoursAgo: number | null) =>
			visitsTcgplayer({
				trigger: "launchAgent",
				lastTcgplayerRunAt: hoursAgo === null ? null : NOW - hoursAgo * HOUR,
				now: NOW,
			});
		expect(visits(null)).toBe(true);
		expect(visits(4)).toBe(false);
		expect(visits(9.9)).toBe(false);
		expect(visits(10)).toBe(true);
		expect(visits(12)).toBe(true);
	});

	test("hand and T3 Code runs always do", () => {
		for (const trigger of ["manual", "t3"] as const) {
			expect(
				visitsTcgplayer({ trigger, lastTcgplayerRunAt: NOW - HOUR, now: NOW }),
			).toBe(true);
		}
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

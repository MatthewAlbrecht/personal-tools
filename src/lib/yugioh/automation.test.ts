import { describe, expect, test } from "vitest";
import {
	MAX_VISITS_PER_RUN,
	buildVisitPlan,
	scheduledRunDue,
} from "./automation";

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
	const recent = { lastFullRunAt: NOW - HOUR, lastRunAt: NOW - HOUR };
	/** An auction ending `minutesLeft` from now, last seen 2 hours ago. */
	function endingIn(minutesLeft: number) {
		return { endsAt: NOW + minutesLeft * MINUTE, lastSeenAt: NOW - 2 * HOUR };
	}

	test("a full run 3 hours after the last, allowing a few minutes' slack", () => {
		expect(scheduledRunDue({ ...recent, auctions: [], now: NOW })).toBe(null);
		expect(
			scheduledRunDue({
				lastFullRunAt: NOW - 3 * HOUR + 4 * MINUTE,
				lastRunAt: null,
				auctions: [],
				now: NOW,
			}),
		).toBe("full");
		expect(
			scheduledRunDue({
				lastFullRunAt: null,
				lastRunAt: null,
				auctions: [],
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
});

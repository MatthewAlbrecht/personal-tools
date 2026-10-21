import { describe, expect, test } from "vitest";
import { auctionPushText, dealPushText, pushDeliveryTime } from "./pushes";

const DENVER = "America/Denver";

/** A Denver wall-clock time on a date in October 2026 (MDT, UTC-6). */
function denver(day: number, hour: number, minute = 0): number {
	return Date.UTC(2026, 9, day, hour + 6, minute);
}

describe("pushDeliveryTime: deal pushes are held 11pm-8am", () => {
	test("in the day, a push goes now", () => {
		expect(pushDeliveryTime(denver(20, 8), DENVER)).toBe(denver(20, 8));
		expect(pushDeliveryTime(denver(20, 14, 30), DENVER)).toBe(
			denver(20, 14, 30),
		);
		expect(pushDeliveryTime(denver(20, 22, 59), DENVER)).toBe(
			denver(20, 22, 59),
		);
	});

	test("from 11pm, it waits for 8am the next morning", () => {
		expect(pushDeliveryTime(denver(20, 23), DENVER)).toBe(denver(21, 8));
		expect(pushDeliveryTime(denver(20, 23, 45), DENVER)).toBe(denver(21, 8));
	});

	test("after midnight, it waits for 8am the same morning", () => {
		expect(pushDeliveryTime(denver(21, 0, 10), DENVER)).toBe(denver(21, 8));
		expect(pushDeliveryTime(denver(21, 7, 59), DENVER)).toBe(denver(21, 8));
	});

	test("uses the device's time zone", () => {
		// 23:30 in Denver is 01:30 in New York: still quiet, 8am New York time.
		const now = denver(20, 23, 30);
		expect(pushDeliveryTime(now, "America/New_York")).toBe(
			Date.UTC(2026, 9, 21, 12),
		);
		// 23:30 in Denver is 22:30 in Los Angeles: not quiet there.
		expect(pushDeliveryTime(now, "America/Los_Angeles")).toBe(now);
	});

	test("8am is 8am on the morning the clocks change", () => {
		// US clocks fall back at 2am on 2026-11-01: 8am MST is 15:00 UTC.
		const elevenPm = Date.UTC(2026, 9, 31, 23 + 6);
		expect(pushDeliveryTime(elevenPm, DENVER)).toBe(Date.UTC(2026, 10, 1, 15));
	});

	test("an unknown time zone falls back to Denver", () => {
		expect(pushDeliveryTime(denver(20, 23), "Not/AZone")).toBe(denver(21, 8));
	});
});

describe("dealPushText", () => {
	test("names the grade, Card and rarity, then the price against the Reference", () => {
		expect(
			dealPushText({
				grade: "great",
				cardName: "Ash Blossom & Joyous Spring",
				rarity: "Quarter Century Secret Rare",
				perCopy: 42.15,
				percentOfReference: 78,
				reference: 54,
				marketplace: "ebay",
				listingType: "buyItNow",
			}),
		).toEqual({
			title: "Great deal: Ash Blossom & Joyous Spring QCSR",
			body: "$42.15 a copy, 78% of $54 ref · eBay, buy it now",
		});
	});

	test("Good deals, best offers and TCGplayer", () => {
		expect(
			dealPushText({
				grade: "good",
				cardName: "Called by the Grave",
				rarity: "Ultra Rare",
				perCopy: 3,
				percentOfReference: 91,
				reference: 3.3,
				marketplace: "tcgplayer",
				listingType: "bestOffer",
			}),
		).toEqual({
			title: "Good deal: Called by the Grave UR",
			body: "$3.00 a copy, 91% of $3.30 ref · TCGplayer, best offer",
		});
	});
});

describe("auctionPushText", () => {
	const now = Date.UTC(2026, 9, 20, 12);
	const minute = 60 * 1000;
	const auction = {
		cardName: "Ash Blossom & Joyous Spring",
		rarity: "Quarter Century Secret Rare",
		perCopy: 40,
		reference: 54,
		bids: 4,
		endsAt: now + 15 * minute,
		lastSeenAt: now - 22 * minute,
	};

	test("says how long is left, then the last seen price, how old it is, the Reference and bids", () => {
		expect(auctionPushText(auction, now)).toEqual({
			title: "Ending in 15 min: Ash Blossom & Joyous Spring QCSR",
			body: "Last seen $40.00 a copy (22m ago) · ref $54 · 4 bids",
		});
	});

	test("found late, it says the time actually left", () => {
		expect(
			auctionPushText({ ...auction, endsAt: now + 8 * minute + 20_000 }, now)
				.title,
		).toBe("Ending in 8 min: Ash Blossom & Joyous Spring QCSR");
		// A check may run a little before 15 minutes are left.
		expect(
			auctionPushText({ ...auction, endsAt: now + 15 * minute + 40_000 }, now)
				.title,
		).toBe("Ending in 15 min: Ash Blossom & Joyous Spring QCSR");
	});

	test("ages the price in minutes, hours or days", () => {
		const body = (lastSeenAt: number) =>
			auctionPushText({ ...auction, lastSeenAt }, now).body;
		expect(body(now - 20_000)).toMatch(/\(just now\)/);
		expect(body(now - 3 * 60 * minute - 10 * minute)).toMatch(/\(3h ago\)/);
		expect(body(now - 2 * 24 * 60 * minute)).toMatch(/\(2d ago\)/);
	});

	test("without a Reference price, bids or a price, says so", () => {
		expect(
			auctionPushText(
				{ ...auction, reference: null, bids: 0, perCopy: 12.5 },
				now,
			).body,
		).toBe("Last seen $12.50 a copy (22m ago) · no ref yet · no bids yet");
		expect(
			auctionPushText({ ...auction, bids: 1, reference: 54.3 }, now).body,
		).toBe("Last seen $40.00 a copy (22m ago) · ref $54.30 · 1 bid");
		expect(
			auctionPushText({ ...auction, perCopy: null, bids: null }, now).body,
		).toBe("No price seen yet · ref $54");
	});
});

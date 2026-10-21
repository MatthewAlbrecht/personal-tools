import { describe, expect, test } from "vitest";
import { dealPushText, pushDeliveryTime } from "./pushes";

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

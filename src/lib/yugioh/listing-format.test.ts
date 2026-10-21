import { describe, expect, test } from "vitest";
import { formatMoney, listingTypeLabel, timeLeft } from "./listing-format";

const NOW = Date.UTC(2026, 9, 20, 12, 0);
const MINUTE = 60_000;

describe("formatMoney", () => {
	test("dollars with cents", () => {
		expect(formatMoney(42.15, "USD")).toBe("$42.15");
		expect(formatMoney(1240, "USD")).toBe("$1,240.00");
	});

	test("other currencies keep their own symbol", () => {
		expect(formatMoney(31, "GBP")).toBe("£31.00");
		expect(formatMoney(4500, "JPY")).toBe("¥4,500");
	});

	test("an unknown currency code still reads", () => {
		expect(formatMoney(12, "ZZZ")).toMatch(/^ZZZ\s12\.00$/);
	});
});

describe("timeLeft", () => {
	test("days and hours, hours and minutes, minutes", () => {
		expect(timeLeft(NOW + (2 * 24 * 60 + 4 * 60 + 5) * MINUTE, NOW)).toBe(
			"2d 4h",
		);
		expect(timeLeft(NOW + 72 * MINUTE, NOW)).toBe("1h 12m");
		expect(timeLeft(NOW + 14 * MINUTE, NOW)).toBe("14m");
		expect(timeLeft(NOW + 20_000, NOW)).toBe("<1m");
	});

	test("an end time in the past has ended", () => {
		expect(timeLeft(NOW - MINUTE, NOW)).toBe("Ended");
	});
});

describe("listingTypeLabel", () => {
	const base = {
		listingType: "buyItNow" as const,
		bids: null,
		endsAt: null,
		sold: false,
		soldDate: null,
	};

	test("fixed-price Listings", () => {
		expect(listingTypeLabel(base, NOW)).toBe("Buy it now");
		expect(listingTypeLabel({ ...base, listingType: "bestOffer" }, NOW)).toBe(
			"Best offer",
		);
	});

	test("a running auction shows time left and bids", () => {
		expect(
			listingTypeLabel(
				{
					...base,
					listingType: "auction",
					bids: 4,
					endsAt: NOW + 72 * MINUTE,
				},
				NOW,
			),
		).toBe("Auction · 1h 12m · 4 bids");
		expect(
			listingTypeLabel({ ...base, listingType: "auction", bids: 1 }, NOW),
		).toBe("Auction · 1 bid");
	});

	test("a sold Listing says when it sold", () => {
		expect(
			listingTypeLabel({ ...base, sold: true, soldDate: "2026-10-18" }, NOW),
		).toBe("Sold Oct 18");
		expect(listingTypeLabel({ ...base, sold: true }, NOW)).toBe("Sold");
	});
});

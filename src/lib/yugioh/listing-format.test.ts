import { describe, expect, test } from "vitest";
import {
	formatMoney,
	listingSeller,
	listingTypeLabel,
	newListingsRate,
	timeLeft,
	titleFlags,
} from "./listing-format";

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

describe("titleFlags", () => {
	const raw = {
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
		condition: "nearMint" as const,
		copies: 1,
		language: "english" as const,
		graded: false,
		gradingCompany: null,
		grade: null,
	};

	test("a raw English Near Mint single has no flags", () => {
		expect(titleFlags(raw)).toEqual([]);
	});

	test("flags grading, unknown condition, language and lots", () => {
		expect(
			titleFlags({
				...raw,
				graded: true,
				gradingCompany: "PSA",
				grade: "10",
				condition: null,
				language: "korean",
				copies: 3,
			}),
		).toEqual([
			{ kind: "graded", label: "PSA 10" },
			{ kind: "language", label: "KR" },
			{ kind: "lot", label: "×3 copies" },
		]);
		expect(titleFlags({ ...raw, condition: null })).toEqual([
			{ kind: "unknownCondition", label: "Condition?" },
		]);
	});

	test("a graded Listing without a stated company still says Graded", () => {
		expect(titleFlags({ ...raw, graded: true })).toEqual([
			{ kind: "graded", label: "Graded" },
		]);
	});

	test("flags a condition below the Card's Lowest acceptable condition", () => {
		expect(
			titleFlags(
				{ ...raw, condition: "lightlyPlayed" },
				{ belowCondition: true },
			),
		).toEqual([{ kind: "belowCondition", label: "LP" }]);
		expect(
			titleFlags({ ...raw, condition: "damaged" }, { belowCondition: true }),
		).toEqual([{ kind: "belowCondition", label: "DMG" }]);
		expect(titleFlags({ ...raw, condition: "lightlyPlayed" })).toEqual([]);
	});

	test("an unread title has no flags", () => {
		expect(titleFlags(null)).toEqual([]);
	});
});

describe("newListingsRate", () => {
	test("reads plainly, never as a fraction of a Listing", () => {
		expect(newListingsRate(0)).toBe("No new Listings in 4 weeks");
		expect(newListingsRate(0.25)).toBe("Under 1 new a week");
		expect(newListingsRate(1)).toBe("1 new a week");
		expect(newListingsRate(1.25)).toBe("About 1 new a week");
		expect(newListingsRate(2.75)).toBe("About 3 new a week");
		expect(newListingsRate(12)).toBe("12 new a week");
	});
});

describe("listingSeller", () => {
	test("an eBay Listing shows the seller's country", () => {
		expect(
			listingSeller({
				marketplace: "ebay",
				sellerLocation: "United Kingdom",
				tcgplayer: null,
			}),
		).toBe("United Kingdom");
	});

	test("a TCGplayer Listing shows the seller, with how many Copies they have", () => {
		const listing = {
			marketplace: "tcgplayer" as const,
			sellerLocation: "United States",
			tcgplayer: {
				seller: "Card Castle",
				condition: "Near Mint 1st Edition",
				quantity: 3,
			},
		};
		expect(listingSeller(listing)).toBe("Card Castle · 3 Copies");
		expect(
			listingSeller({
				...listing,
				tcgplayer: { ...listing.tcgplayer, quantity: 1 },
			}),
		).toBe("Card Castle");
	});

	test("a TCGplayer sale names no seller", () => {
		expect(
			listingSeller({
				marketplace: "tcgplayer",
				sellerLocation: "United States",
				tcgplayer: { seller: null, condition: "Near Mint", quantity: 2 },
			}),
		).toBeNull();
	});
});

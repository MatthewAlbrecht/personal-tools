import { describe, expect, test } from "vitest";
import {
	dealGrade,
	isBelowCondition,
	isQualifying,
	isRunningAuction,
	isSale,
	listingLanguage,
	mostLenientCondition,
	percentOfReference,
	referencePrice,
	saleTime,
} from "./deals";

const NOW = Date.UTC(2026, 9, 20, 12, 0);

const forSale = {
	listingType: "buyItNow" as const,
	sold: false,
	soldDate: null,
	endsAt: null,
	bids: null,
};

describe("dealGrade", () => {
	test("Great to 80%, Good to 95%, Fair to 110%, Poor above", () => {
		expect([0, 80, 81, 95, 96, 110, 111, 400].map(dealGrade)).toEqual([
			"great",
			"great",
			"good",
			"good",
			"fair",
			"fair",
			"poor",
			"poor",
		]);
	});

	test("grades the percent as shown, rounded to a whole number", () => {
		expect(percentOfReference(40.2, 50)).toBe(80);
		expect(dealGrade(percentOfReference(40.2, 50))).toBe("great");
		expect(percentOfReference(40.3, 50)).toBe(81);
	});
});

describe("referencePrice", () => {
	test("the median, rounded to cents", () => {
		expect(referencePrice([10, 10.01, 10.02, 10.04])).toEqual({
			price: 10.02,
			sales: 4,
		});
		expect(referencePrice([30, 10, 20])).toEqual({ price: 20, sales: 3 });
	});

	test("no price under 3 sales", () => {
		expect(referencePrice([])).toEqual({ price: null, sales: 0 });
		expect(referencePrice([5, 6])).toEqual({ price: null, sales: 2 });
	});
});

describe("sales", () => {
	test("a sold Listing sold on its sold date, else its end, else when seen sold", () => {
		const sold = { ...forSale, sold: true };
		expect(saleTime({ ...sold, soldDate: "2026-10-18" }, NOW)).toBe(
			Date.UTC(2026, 9, 18),
		);
		expect(saleTime({ ...sold, endsAt: NOW - 1000 }, NOW)).toBe(NOW - 1000);
		expect(saleTime(sold, NOW)).toBe(NOW);
	});

	test("an auction's sale time is when it ends; a fixed price has none", () => {
		const auction = { ...forSale, listingType: "auction" as const };
		expect(saleTime({ ...auction, endsAt: NOW + 5 }, NOW)).toBe(NOW + 5);
		expect(saleTime(forSale, NOW)).toBeNull();
	});

	test("an auction is a sale once it has ended, unless nobody bid", () => {
		const ended = {
			...forSale,
			listingType: "auction" as const,
			endsAt: NOW - 1,
		};
		expect(isSale({ ...ended, bids: 2 }, NOW)).toBe(true);
		expect(isSale({ ...ended, bids: null }, NOW)).toBe(true);
		expect(isSale({ ...ended, bids: 0 }, NOW)).toBe(false);
		expect(isRunningAuction({ ...ended, bids: 2 }, NOW)).toBe(false);
		expect(isRunningAuction({ ...ended, endsAt: NOW + 1 }, NOW)).toBe(true);
		expect(isRunningAuction({ ...ended, endsAt: null }, NOW)).toBe(true);
		expect(isSale(forSale, NOW)).toBe(false);
	});
});

describe("mostLenientCondition", () => {
	test("takes the most played condition any Card accepts", () => {
		expect(mostLenientCondition(["nearMint", "moderatelyPlayed"])).toBe(
			"moderatelyPlayed",
		);
		expect(mostLenientCondition([])).toBeNull();
	});
});

describe("listingLanguage", () => {
	test("an unread title that states Japanese is Japanese, whatever its set code", () => {
		expect(
			listingLanguage({
				title:
					"Bottomless Trap Hole CP04-EN003 Champion Pack 4 Unlimited Japanese",
			}),
		).toBe("japanese");
	});

	test("an unread title that states nothing goes by its set code, else English", () => {
		expect(listingLanguage({ title: "Ash Blossom RA01-KR008" })).toBe("korean");
		expect(listingLanguage({ title: "Ash Blossom QCSR" })).toBe("english");
	});
});

describe("a condition I set", () => {
	const read = {
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
		condition: "nearMint" as const,
		copies: 1,
		language: "english" as const,
		graded: false,
		gradingCompany: null,
		grade: null,
	};
	const title = "Ash Blossom RA01-EN008 QCSR";

	test("wins over the title's read for Below minimum and Qualifying", () => {
		const played = {
			title,
			titleRead: read,
			conditionOverride: "heavilyPlayed" as const,
		};
		expect(isBelowCondition(played, "lightlyPlayed")).toBe(true);
		expect(isQualifying(played, "lightlyPlayed")).toBe(false);
		expect(isQualifying({ title, titleRead: read }, "lightlyPlayed")).toBe(
			true,
		);
	});

	test("'not stated' counts, like a title that doesn't say", () => {
		const unknown = {
			title,
			titleRead: { ...read, condition: "damaged" as const },
			conditionOverride: "notStated" as const,
		};
		expect(isBelowCondition(unknown, "nearMint")).toBe(false);
		expect(isQualifying(unknown, "nearMint")).toBe(true);
	});
});

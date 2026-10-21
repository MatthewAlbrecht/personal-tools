import { describe, expect, test } from "vitest";
import {
	type FilterableListing,
	type ListingFilters,
	activeFilterCount,
	applyListingFilters,
	listingFiltersFromParams,
	quickView,
	withListingFilters,
	withQuickView,
} from "./listing-filters";

const NOW = Date.UTC(2026, 9, 20, 12, 0);
const HOUR = 60 * 60 * 1000;

let nextId = 1;

function listing(
	overrides: Partial<FilterableListing> & { id?: string } = {},
): FilterableListing & { id: string } {
	return {
		id: String(nextId++),
		marketplace: "ebay",
		title: "Ash Blossom RA01-EN008 Quarter Century Secret Rare",
		listingType: "buyItNow",
		sold: false,
		soldDate: null,
		endsAt: null,
		bids: null,
		firstSeenAt: NOW - HOUR,
		sellerLocation: "United States",
		titleRead: null,
		titleReadStatus: "read",
		matchStatus: "match",
		matchOverridden: false,
		matchedPrintingId: "p1",
		...overrides,
	};
}

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

const context = {
	now: NOW,
	newSince: NOW - 2 * HOUR,
	cardPrintings: new Map([["card1", new Set(["p1"])]]),
};

function ids(
	listings: Array<FilterableListing & { id: string }>,
	filters: ListingFilters,
): string[] {
	return applyListingFilters(listings, filters, context).map((l) => l.id);
}

describe("applyListingFilters", () => {
	test("no filters: everything shows, in the order given", () => {
		const all = [
			listing({ id: "a", matchStatus: "notMatch", matchedPrintingId: null }),
			listing({ id: "b", sold: true }),
			listing({ id: "c", titleRead: { ...read, graded: true } }),
		];
		expect(ids(all, {})).toEqual(["a", "b", "c"]);
	});

	test("type: buy it now (with Best Offer), auction, or sold", () => {
		const all = [
			listing({ id: "bin" }),
			listing({ id: "offer", listingType: "bestOffer" }),
			listing({ id: "auction", listingType: "auction", endsAt: NOW + HOUR }),
			listing({ id: "sold", sold: true, soldDate: "2026-10-18" }),
			// An auction that ended with bids is a sale.
			listing({
				id: "ended",
				listingType: "auction",
				endsAt: NOW - HOUR,
				bids: 3,
			}),
		];
		expect(ids(all, { type: "buyItNow" })).toEqual(["bin", "offer"]);
		expect(ids(all, { type: "auction" })).toEqual(["auction"]);
		expect(ids(all, { type: "sold" })).toEqual(["sold", "ended"]);
	});

	test("language: from the title read, else the set code's region", () => {
		const all = [
			listing({ id: "en", titleRead: read }),
			listing({ id: "kr-read", titleRead: { ...read, language: "korean" } }),
			listing({ id: "kr-code", title: "Ash Blossom RA01-KR008" }),
		];
		expect(ids(all, { language: "korean" })).toEqual(["kr-read", "kr-code"]);
		expect(ids(all, { language: "english" })).toEqual(["en"]);
	});

	test("condition: as read, or unknown when the title doesn't say", () => {
		const all = [
			listing({ id: "nm", titleRead: read }),
			listing({ id: "lp", titleRead: { ...read, condition: "lightlyPlayed" } }),
			listing({ id: "unsaid", titleRead: { ...read, condition: null } }),
			listing({ id: "unread", titleRead: null }),
		];
		expect(ids(all, { condition: "lightlyPlayed" })).toEqual(["lp"]);
		expect(ids(all, { condition: "unknown" })).toEqual(["unsaid", "unread"]);
	});

	test("graded or raw", () => {
		const all = [
			listing({ id: "raw", titleRead: read }),
			listing({ id: "psa", titleRead: { ...read, graded: true } }),
		];
		expect(ids(all, { graded: true })).toEqual(["psa"]);
		expect(ids(all, { graded: false })).toEqual(["raw"]);
	});

	test("match status, with a title still being read as its own status", () => {
		const all = [
			listing({ id: "match" }),
			listing({ id: "unsure", matchStatus: "unsure", matchedPrintingId: null }),
			listing({ id: "no", matchStatus: "notMatch", matchedPrintingId: null }),
			listing({ id: "reading", titleReadStatus: "reading" }),
			// My override wins over a read in progress.
			listing({
				id: "mine",
				titleReadStatus: "reading",
				matchOverridden: true,
				matchStatus: "notMatch",
			}),
		];
		expect(ids(all, { match: "match" })).toEqual(["match"]);
		expect(ids(all, { match: "unsure" })).toEqual(["unsure"]);
		expect(ids(all, { match: "notMatch" })).toEqual(["no", "mine"]);
		expect(ids(all, { match: "reading" })).toEqual(["reading"]);
	});

	test("marketplace, location and Card", () => {
		const all = [
			listing({ id: "us" }),
			listing({ id: "uk", sellerLocation: "United Kingdom" }),
			listing({ id: "none", sellerLocation: null, matchedPrintingId: "p2" }),
		];
		expect(ids(all, { marketplace: "ebay" })).toEqual(["us", "uk", "none"]);
		expect(ids(all, { marketplace: "tcgplayer" })).toEqual([]);
		expect(ids(all, { location: "united  kingdom" })).toEqual(["uk"]);
		expect(ids(all, { card: "card1" })).toEqual(["us", "uk"]);
		expect(ids(all, { card: "gone" })).toEqual([]);
	});

	test("new: first seen since my last visit", () => {
		const all = [
			listing({ id: "old", firstSeenAt: NOW - 3 * HOUR }),
			listing({ id: "fresh", firstSeenAt: NOW - HOUR }),
		];
		expect(ids(all, { new: true })).toEqual(["fresh"]);
	});

	test("ending soon: running auctions, soonest end first, unknown ends last", () => {
		const all = [
			listing({ id: "bin" }),
			listing({ id: "later", listingType: "auction", endsAt: NOW + 5 * HOUR }),
			listing({ id: "unknown", listingType: "auction", endsAt: null }),
			listing({ id: "soon", listingType: "auction", endsAt: NOW + HOUR }),
			listing({ id: "over", listingType: "auction", endsAt: NOW - HOUR }),
		];
		expect(ids(all, { ending: true })).toEqual(["soon", "later", "unknown"]);
	});

	test("filters combine", () => {
		const all = [
			listing({ id: "a", sellerLocation: "Japan", firstSeenAt: NOW }),
			listing({
				id: "b",
				sellerLocation: "Japan",
				firstSeenAt: NOW - 3 * HOUR,
			}),
			listing({ id: "c", firstSeenAt: NOW }),
		];
		expect(ids(all, { new: true, location: "Japan" })).toEqual(["a"]);
	});
});

describe("filters in the URL", () => {
	test("round-trip through search params", () => {
		const filters: ListingFilters = {
			new: true,
			marketplace: "ebay",
			type: "auction",
			language: "korean",
			condition: "unknown",
			graded: false,
			match: "notMatch",
			location: "United Kingdom",
			card: "k57abc",
		};
		const params = withListingFilters(new URLSearchParams(), filters);
		expect(listingFiltersFromParams(params)).toEqual(filters);
	});

	test("an unset filter leaves no param, and other params are kept", () => {
		const params = withListingFilters(
			new URLSearchParams("listing=abc&type=sold&new=1"),
			{ type: "auction" },
		);
		expect(params.toString()).toBe("listing=abc&type=auction");
	});

	test("unknown values are ignored rather than hiding everything", () => {
		const params = new URLSearchParams(
			"type=preorder&language=klingon&graded=maybe&new=yes&location=%20&ending=1",
		);
		expect(listingFiltersFromParams(params)).toEqual({ ending: true });
	});
});

describe("quick views", () => {
	test("All, New, Ending soon and Sold each set one view and keep other filters", () => {
		const base: ListingFilters = { language: "english", new: true };
		expect(withQuickView(base, "all")).toEqual({ language: "english" });
		expect(withQuickView(base, "ending")).toEqual({
			language: "english",
			ending: true,
		});
		expect(withQuickView(base, "sold")).toEqual({
			language: "english",
			type: "sold",
		});
		expect(withQuickView({ type: "sold" }, "new")).toEqual({ new: true });
	});

	test("the quick view reads back, or none when filters mix them", () => {
		expect(quickView({})).toBe("all");
		expect(quickView({ location: "Japan" })).toBe("all");
		expect(quickView({ new: true })).toBe("new");
		expect(quickView({ ending: true })).toBe("ending");
		expect(quickView({ type: "sold" })).toBe("sold");
		expect(quickView({ type: "auction" })).toBeNull();
		expect(quickView({ new: true, type: "sold" })).toBeNull();
		expect(quickView({ new: true, ending: true })).toBeNull();
	});

	test("the Filters button counts what the quick views don't show", () => {
		expect(activeFilterCount({})).toBe(0);
		expect(activeFilterCount({ new: true })).toBe(0);
		expect(activeFilterCount({ ending: true })).toBe(0);
		expect(activeFilterCount({ type: "sold" })).toBe(0);
		expect(activeFilterCount({ type: "auction", graded: false })).toBe(2);
		// No quick view shows these together, so each one counts.
		expect(activeFilterCount({ new: true, type: "sold", card: "x" })).toBe(3);
	});
});

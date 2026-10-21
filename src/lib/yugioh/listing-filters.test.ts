import { describe, expect, test } from "vitest";
import {
	type FilterableListing,
	type ListingFilters,
	activeFilterCount,
	applyListingFilters,
	defaultListingFilters,
	extraFilters,
	isDefaultListingFilters,
	listingFiltersFromParams,
	withListingFilters,
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
	test("no filters: every Available Listing shows, in the order given", () => {
		const all = [
			listing({ id: "a", matchStatus: "notMatch", matchedPrintingId: null }),
			listing({ id: "b", sold: true }),
			listing({ id: "c", titleRead: { ...read, graded: true } }),
		];
		expect(ids(all, {})).toEqual(["a", "c"]);
	});

	test("Available and Sold never share a Listing", () => {
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
		expect(ids(all, {})).toEqual(["bin", "offer", "auction"]);
		expect(ids(all, { view: "available" })).toEqual([
			"bin",
			"offer",
			"auction",
		]);
		expect(ids(all, { view: "sold" })).toEqual(["sold", "ended"]);
	});

	test("type: buy it now (with Best Offer) or auction, within either view", () => {
		const all = [
			listing({ id: "bin" }),
			listing({ id: "offer", listingType: "bestOffer" }),
			listing({ id: "auction", listingType: "auction", endsAt: NOW + HOUR }),
			listing({ id: "soldBin", sold: true, soldDate: "2026-10-18" }),
			listing({
				id: "ended",
				listingType: "auction",
				endsAt: NOW - HOUR,
				bids: 3,
			}),
		];
		expect(ids(all, { type: "buyItNow" })).toEqual(["bin", "offer"]);
		expect(ids(all, { type: "auction" })).toEqual(["auction"]);
		expect(ids(all, { view: "sold", type: "buyItNow" })).toEqual(["soldBin"]);
		expect(ids(all, { view: "sold", type: "auction" })).toEqual(["ended"]);
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

	test("new: first seen since my last visit, within the view", () => {
		const all = [
			listing({ id: "old", firstSeenAt: NOW - 3 * HOUR }),
			listing({ id: "fresh", firstSeenAt: NOW - HOUR }),
			listing({ id: "freshSale", firstSeenAt: NOW - HOUR, sold: true }),
		];
		expect(ids(all, { new: true })).toEqual(["fresh"]);
		expect(ids(all, { view: "sold", new: true })).toEqual(["freshSale"]);
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
			view: "sold",
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

	test("Available, English and not graded are the defaults and leave no param", () => {
		const params = withListingFilters(new URLSearchParams(), {
			view: "available",
			new: true,
			language: "english",
			graded: false,
		});
		expect(params.toString()).toBe("new=1");
		expect(listingFiltersFromParams(params)).toEqual({
			new: true,
			language: "english",
			graded: false,
		});
	});

	test("no language or graded param means English and not graded", () => {
		expect(listingFiltersFromParams(new URLSearchParams())).toEqual({
			language: "english",
			graded: false,
		});
	});

	test("any language and graded or not are kept as language=any and graded=any", () => {
		const params = withListingFilters(new URLSearchParams(), {});
		expect(params.toString()).toBe("language=any&graded=any");
		expect(listingFiltersFromParams(params)).toEqual({});
	});

	test("an unset filter leaves no param, and other params are kept", () => {
		const params = withListingFilters(
			new URLSearchParams("listing=abc&view=sold&new=1&sort=price"),
			{ type: "auction", language: "english", graded: false },
		);
		expect(params.toString()).toBe("listing=abc&sort=price&type=auction");
	});

	test("old links: type=sold opens Sold, ending=1 opens Available, graded=no and language=english still work", () => {
		expect(listingFiltersFromParams(new URLSearchParams("type=sold"))).toEqual({
			view: "sold",
			language: "english",
			graded: false,
		});
		expect(
			listingFiltersFromParams(new URLSearchParams("ending=1&new=1")),
		).toEqual({ new: true, language: "english", graded: false });
		expect(
			listingFiltersFromParams(
				new URLSearchParams("language=english&graded=no"),
			),
		).toEqual({ language: "english", graded: false });
		expect(listingFiltersFromParams(new URLSearchParams("graded=yes"))).toEqual(
			{ language: "english", graded: true },
		);
		const rewritten = withListingFilters(
			new URLSearchParams("type=sold&ending=1"),
			{ view: "sold", language: "english", graded: false },
		);
		expect(rewritten.toString()).toBe("view=sold");
	});

	test("unknown values are ignored: the defaults hold and nothing else is set", () => {
		const params = new URLSearchParams(
			"type=preorder&language=klingon&graded=maybe&new=yes&location=%20&view=all",
		);
		expect(listingFiltersFromParams(params)).toEqual({
			language: "english",
			graded: false,
		});
	});
});

describe("the default filters", () => {
	test("are English and not graded, keeping the view and New", () => {
		expect(
			defaultListingFilters({
				view: "sold",
				new: true,
				language: "korean",
				graded: true,
				card: "x",
			}),
		).toEqual({ view: "sold", new: true, language: "english", graded: false });
	});

	test("are recognised whatever the view and New", () => {
		expect(
			isDefaultListingFilters({
				view: "sold",
				new: true,
				language: "english",
				graded: false,
			}),
		).toBe(true);
		expect(isDefaultListingFilters({ language: "english" })).toBe(false);
		expect(
			isDefaultListingFilters({
				language: "english",
				graded: false,
				card: "x",
			}),
		).toBe(false);
	});
});

describe("the Filters button", () => {
	test("counts what the view and New toggle don't show", () => {
		expect(activeFilterCount({})).toBe(0);
		expect(activeFilterCount({ new: true })).toBe(0);
		expect(activeFilterCount({ view: "sold" })).toBe(0);
		expect(activeFilterCount({ view: "sold", new: true, card: "x" })).toBe(1);
		expect(activeFilterCount({ type: "auction", graded: false })).toBe(2);
		expect(extraFilters({ view: "sold", graded: false, card: "x" })).toEqual([
			"graded",
			"card",
		]);
	});
});

import { describe, expect, test } from "vitest";
import {
	type FilterableListing,
	LANGUAGE_GROUPS,
	type ListingFilters,
	activeFilterCount,
	applyListingFilters,
	defaultListingFilters,
	extraFilters,
	isDefaultListingFilters,
	languageGroupOf,
	listingFiltersFromParams,
	withCardHidden,
	withCardShown,
	withListingFilters,
} from "./listing-filters";
import { LANGUAGES } from "./title-reading";

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
	neededPrintings: new Set(["p1", "p2"]),
	cardPriorities: new Map([["card1", "medium" as const]]),
	cardSections: new Map([["card1", "main" as const]]),
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
			listing({ id: "a" }),
			listing({ id: "b", sold: true }),
			listing({ id: "c", titleRead: { ...read, graded: true } }),
		];
		expect(ids(all, {})).toEqual(["a", "c"]);
	});

	test("only Listings matched to a Printing the Deck still needs show", () => {
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
			}),
			// A done Card's Printing, or one a Card didn't choose.
			listing({ id: "done", matchedPrintingId: "p3" }),
		];
		expect(ids(all, {})).toEqual(["match", "mine"]);
	});

	test("Rejected Listings are hidden, and only they show when asked for", () => {
		const all = [
			listing({ id: "fine" }),
			listing({ id: "wrong", rejection: { reason: "wrongCard", at: NOW } }),
			listing({ id: "unmarked", rejection: null }),
		];
		expect(ids(all, {})).toEqual(["fine", "unmarked"]);
		expect(ids(all, { rejected: true })).toEqual(["wrong"]);
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

	test("language: English, European or Asian, from the title read, else the set code's region", () => {
		const all = [
			listing({ id: "en", titleRead: read }),
			listing({ id: "kr-read", titleRead: { ...read, language: "korean" } }),
			listing({ id: "kr-code", title: "Ash Blossom RA01-KR008" }),
			listing({ id: "jp-read", titleRead: { ...read, language: "japanese" } }),
			listing({ id: "de-read", titleRead: { ...read, language: "german" } }),
			listing({ id: "fr-code", title: "Ash Blossom RA01-FR008" }),
		];
		expect(ids(all, { language: "asian" })).toEqual([
			"kr-read",
			"kr-code",
			"jp-read",
		]);
		expect(ids(all, { language: "european" })).toEqual(["de-read", "fr-code"]);
		expect(ids(all, { language: "english" })).toEqual(["en"]);
	});

	test("every language is in one language group", () => {
		for (const language of LANGUAGES) {
			expect(LANGUAGE_GROUPS).toContain(languageGroupOf(language));
		}
		expect(languageGroupOf("portuguese")).toBe("european");
		expect(languageGroupOf("chinese")).toBe("asian");
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

	test("condition: one I set wins over the read", () => {
		const all = [
			listing({
				id: "set-lp",
				titleRead: read,
				conditionOverride: "lightlyPlayed",
			}),
			listing({
				id: "set-unsaid",
				titleRead: read,
				conditionOverride: "notStated",
			}),
			listing({ id: "nm", titleRead: read }),
		];
		expect(ids(all, { condition: "lightlyPlayed" })).toEqual(["set-lp"]);
		expect(ids(all, { condition: "unknown" })).toEqual(["set-unsaid"]);
		expect(ids(all, { condition: "nearMint" })).toEqual(["nm"]);
	});

	test("graded or raw", () => {
		const all = [
			listing({ id: "raw", titleRead: read }),
			listing({ id: "psa", titleRead: { ...read, graded: true } }),
		];
		expect(ids(all, { graded: true })).toEqual(["psa"]);
		expect(ids(all, { graded: false })).toEqual(["raw"]);
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

	test("printing: Listings matched to that Printing", () => {
		const all = [
			listing({ id: "a" }),
			listing({ id: "b", matchedPrintingId: "p2" }),
			listing({ id: "c" }),
		];
		expect(ids(all, { printing: "p1" })).toEqual(["a", "c"]);
		expect(ids(all, { printing: "p2" })).toEqual(["b"]);
		expect(ids(all, { printing: "gone" })).toEqual([]);
	});

	test("hidden Cards: their Listings leave, whatever else is set", () => {
		const all = [
			listing({ id: "p1" }),
			listing({ id: "p2", matchedPrintingId: "p2" }),
		];
		const twoCards = {
			...context,
			cardPrintings: new Map([
				["card1", new Set(["p1"])],
				["card2", new Set(["p2"])],
			]),
		};
		function hidden(excludeCards: string[]): string[] {
			return applyListingFilters(all, { excludeCards }, twoCards).map(
				(l) => l.id,
			);
		}
		expect(hidden(["card1"])).toEqual(["p2"]);
		expect(hidden(["card1", "card2"])).toEqual([]);
		expect(hidden([])).toEqual(["p1", "p2"]);
		// A Card no longer in the Deck hides nothing.
		expect(hidden(["gone"])).toEqual(["p1", "p2"]);
	});

	test("priority: Listings for Cards of the chosen priorities", () => {
		const all = [
			listing({ id: "ash" }),
			listing({ id: "nibiru", matchedPrintingId: "p2" }),
			listing({ id: "droll", matchedPrintingId: "p3" }),
		];
		const threeCards = {
			...context,
			neededPrintings: new Set(["p1", "p2", "p3"]),
			cardPrintings: new Map([
				["ash", new Set(["p1"])],
				["nibiru", new Set(["p2"])],
				["droll", new Set(["p3"])],
			]),
			cardPriorities: new Map([
				["ash", "high" as const],
				["nibiru", "low" as const],
				["droll", "medium" as const],
			]),
		};
		function withPriority(priority: ListingFilters["priority"]): string[] {
			return applyListingFilters(all, { priority }, threeCards).map(
				(l) => l.id,
			);
		}
		expect(withPriority(["high"])).toEqual(["ash"]);
		expect(withPriority(["high", "low"])).toEqual(["ash", "nibiru"]);
		expect(withPriority(["medium"])).toEqual(["droll"]);
		expect(withPriority([])).toEqual(["ash", "nibiru", "droll"]);
	});

	test("section: Listings for Cards in the chosen Sections", () => {
		const all = [
			listing({ id: "ash" }),
			listing({ id: "baronne", matchedPrintingId: "p2" }),
			listing({ id: "nibiru", matchedPrintingId: "p3" }),
		];
		const threeCards = {
			...context,
			neededPrintings: new Set(["p1", "p2", "p3"]),
			cardPrintings: new Map([
				["ash", new Set(["p1"])],
				["baronne", new Set(["p2"])],
				["nibiru", new Set(["p3"])],
			]),
			cardSections: new Map([
				["ash", "main" as const],
				["baronne", "extra" as const],
				["nibiru", "side" as const],
			]),
		};
		function inSections(section: ListingFilters["section"]): string[] {
			return applyListingFilters(all, { section }, threeCards).map((l) => l.id);
		}
		expect(inSections(["main"])).toEqual(["ash"]);
		expect(inSections(["extra", "side"])).toEqual(["baronne", "nibiru"]);
		expect(inSections([])).toEqual(["ash", "baronne", "nibiru"]);
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
			language: "asian",
			condition: "unknown",
			graded: false,
			rejected: true,
			location: "United Kingdom",
			card: "k57abc",
			printing: "k97xyz",
			excludeCards: ["k57def", "k57ghi"],
			priority: ["high", "low"],
			section: ["main", "side"],
		};
		const params = withListingFilters(new URLSearchParams(), filters);
		expect(listingFiltersFromParams(params)).toEqual(filters);
	});

	test("priority is one comma-separated param, unknown values dropped", () => {
		const params = withListingFilters(new URLSearchParams(), {
			language: "english",
			graded: false,
			priority: ["high", "medium"],
		});
		expect(params.toString()).toBe("priority=high%2Cmedium");
		expect(
			listingFiltersFromParams(new URLSearchParams("priority=low,urgent,low")),
		).toEqual({ language: "english", graded: false, priority: ["low"] });
		expect(
			listingFiltersFromParams(new URLSearchParams("priority=urgent")),
		).toEqual({ language: "english", graded: false });
	});

	test("section is one comma-separated param in Deck order, unknown values dropped", () => {
		const params = withListingFilters(new URLSearchParams(), {
			language: "english",
			graded: false,
			section: ["main", "extra"],
		});
		expect(params.toString()).toBe("section=main%2Cextra");
		expect(
			listingFiltersFromParams(new URLSearchParams("section=side,deck,main")),
		).toEqual({
			language: "english",
			graded: false,
			section: ["main", "side"],
		});
		expect(
			listingFiltersFromParams(new URLSearchParams("section=deck")),
		).toEqual({ language: "english", graded: false });
	});

	test("hidden Cards are one comma-separated hide param", () => {
		const params = withListingFilters(new URLSearchParams(), {
			language: "english",
			graded: false,
			excludeCards: ["a1", "b2"],
		});
		expect(params.get("hide")).toBe("a1,b2");
		expect(
			withListingFilters(new URLSearchParams("hide=a1"), {
				language: "english",
				graded: false,
				excludeCards: [],
			}).toString(),
		).toBe("");
		expect(
			listingFiltersFromParams(new URLSearchParams("hide=a1,,a1, b2,")),
		).toEqual({
			language: "english",
			graded: false,
			excludeCards: ["a1", "b2"],
		});
		expect(listingFiltersFromParams(new URLSearchParams("hide=,"))).toEqual({
			language: "english",
			graded: false,
		});
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

	test("old links with one language open its group", () => {
		expect(
			listingFiltersFromParams(new URLSearchParams("language=korean")).language,
		).toBe("asian");
		expect(
			listingFiltersFromParams(new URLSearchParams("language=italian"))
				.language,
		).toBe("european");
		expect(
			listingFiltersFromParams(new URLSearchParams("language=european"))
				.language,
		).toBe("european");
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
				language: "asian",
				graded: true,
				card: "x",
				excludeCards: ["y"],
				priority: ["high"],
				section: ["extra"],
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
		expect(
			isDefaultListingFilters({
				language: "english",
				graded: false,
				excludeCards: ["x"],
			}),
		).toBe(false);
	});
});

describe("hiding a Card", () => {
	test("adds it once, keeping the other filters", () => {
		const once = withCardHidden({ view: "sold", graded: false }, "a");
		expect(once).toEqual({ view: "sold", graded: false, excludeCards: ["a"] });
		expect(withCardHidden(once, "a")).toEqual(once);
		expect(withCardHidden(once, "b").excludeCards).toEqual(["a", "b"]);
	});

	test("showing it again drops it, and the filter with the last one", () => {
		expect(withCardShown({ excludeCards: ["a", "b"] }, "a")).toEqual({
			excludeCards: ["b"],
		});
		expect(withCardShown({ new: true, excludeCards: ["a"] }, "a")).toEqual({
			new: true,
		});
	});
});

describe("the Filters button", () => {
	test("counts what the view and New toggle don't show", () => {
		expect(activeFilterCount({})).toBe(0);
		expect(activeFilterCount({ new: true })).toBe(0);
		expect(activeFilterCount({ view: "sold" })).toBe(0);
		expect(activeFilterCount({ rejected: true })).toBe(0);
		expect(activeFilterCount({ view: "sold", new: true, card: "x" })).toBe(1);
		expect(activeFilterCount({ type: "auction", graded: false })).toBe(2);
		expect(extraFilters({ view: "sold", graded: false, card: "x" })).toEqual([
			"graded",
			"card",
		]);
	});

	test("counts priority once, however many are picked", () => {
		expect(activeFilterCount({ priority: ["high", "low"] })).toBe(1);
		expect(activeFilterCount({ priority: [] })).toBe(0);
		expect(extraFilters({ priority: ["high"], card: "x" })).toEqual([
			"card",
			"priority",
		]);
		expect(extraFilters({ printing: "p", card: "x" })).toEqual([
			"card",
			"printing",
		]);
	});

	test("counts section once, however many are picked", () => {
		expect(activeFilterCount({ section: ["main", "side"] })).toBe(1);
		expect(activeFilterCount({ section: [] })).toBe(0);
		expect(extraFilters({ section: ["main"], priority: ["high"] })).toEqual([
			"priority",
			"section",
		]);
	});

	test("counts each hidden Card", () => {
		expect(activeFilterCount({ excludeCards: ["a", "b"], card: "x" })).toBe(3);
		expect(activeFilterCount({ excludeCards: [] })).toBe(0);
		expect(extraFilters({ excludeCards: [] })).toEqual([]);
		expect(extraFilters({ excludeCards: ["a"], graded: true })).toEqual([
			"graded",
			"excludeCards",
		]);
	});
});

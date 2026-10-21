// @vitest-environment node
// Seam 2: the extension's eBay page reader against saved search-results pages.
// Fixtures are real pages trimmed to a few cards (see each file's comment),
// except ebay-sold.html, which is reconstructed (eBay hides sold searches
// from signed-out fetches).

import { readFileSync } from "node:fs";
import { validate } from "convex-helpers/validators";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import { yugiohCapturedEbayListingValidator } from "../../../convex/model/yugioh/validators";
import "../ebay-reader.js";

type Listing = {
	itemId: string;
	url: string;
	title: string;
	imageUrl: string | null;
	price: number | null;
	currency: string | null;
	shipping: number | null;
	listingType: "buyItNow" | "bestOffer" | "auction";
	bids: number | null;
	endsAt: number | null;
	listedAt: number | null;
	sellerLocation: string | null;
	sold: boolean;
	soldDate: string | null;
};

type Reader = (
	doc: Document,
	options: { now: number; url: string },
) => { listings: Listing[] };

const readEbayResults = (globalThis as unknown as { readEbayResults: Reader })
	.readEbayResults;

// The fixtures were saved at about this moment.
const SAVED_AT = new Date(2026, 9, 20, 12, 0).getTime();
const MINUTE = 60_000;
const NEWLY_LISTED_URL =
	"https://www.ebay.com/sch/i.html?_nkw=%28RA01-EN008%2CMP23-EN001%29+-super&_sop=10";

function read(fixture: string, url = NEWLY_LISTED_URL): Listing[] {
	const html = readFileSync(
		new URL(`./fixtures/${fixture}`, import.meta.url),
		"utf8",
	);
	const { document } = parseHTML(html);
	return readEbayResults(document as unknown as Document, {
		now: SAVED_AT,
		url,
	}).listings;
}

function byId(listings: Listing[], itemId: string): Listing {
	const listing = listings.find((l) => l.itemId === itemId);
	if (!listing) throw new Error(`No Listing ${itemId}`);
	return listing;
}

describe("newly listed, list view", () => {
	const listings = read("ebay-newly-listed.html");

	test("reads every result, skipping eBay's placeholder cards", () => {
		expect(listings.map((l) => l.itemId)).toEqual([
			"307240029466",
			"336849379410",
			"137849721063",
			"237126961743",
			"366709038024",
			"840031109641",
			"206598379759",
		]);
	});

	test("a best-offer Listing", () => {
		expect(byId(listings, "307240029466")).toEqual({
			itemId: "307240029466",
			url: "https://www.ebay.com/itm/307240029466",
			title:
				"Libromancer Geek Boy MP23-EN001 25th Anniversary Yu-Gi-Oh 1st Edition NM/M",
			imageUrl: expect.stringMatching(/^https:\/\/i\.ebayimg\.com\/.+s-l500/),
			price: 1.89,
			currency: "USD",
			shipping: 0,
			listingType: "bestOffer",
			bids: null,
			endsAt: null,
			listedAt: new Date(2026, 9, 19, 19, 50).getTime(),
			sellerLocation: "United States",
			sold: false,
			soldDate: null,
		});
	});
});

describe("newly listed details", () => {
	const listings = read("ebay-newly-listed.html");

	test("an auction whose card shows no time left has no end time", () => {
		expect(byId(listings, "137849721063")).toMatchObject({
			price: 10.5,
			shipping: 5.56,
			listingType: "auction",
			bids: 3,
			endsAt: null,
		});
	});

	test("an auction with Buy It Now reads the current bid as its price", () => {
		expect(byId(listings, "840031109641")).toMatchObject({
			price: 1.5,
			currency: "USD",
			shipping: 5.7,
			listingType: "auction",
			bids: 0,
		});
	});

	test("foreign sellers: location, delivery and shipping estimates", () => {
		expect(byId(listings, "237126961743")).toMatchObject({
			price: 7.8,
			shipping: 2.83,
			listingType: "buyItNow",
			sellerLocation: "Canada",
		});
		expect(byId(listings, "366709038024")).toMatchObject({
			price: 9.77,
			shipping: 25.88,
			sellerLocation: "United Kingdom",
			listedAt: new Date(2026, 9, 3, 14, 9).getTime(),
		});
	});

	test("nothing is sold on an active page", () => {
		expect(listings.every((l) => !l.sold && l.soldDate === null)).toBe(true);
	});
});

describe("newly listed, grid view", () => {
	const listings = read("ebay-newly-listed-grid.html");

	test("reads the same fields as list view", () => {
		expect(listings.map((l) => l.itemId)).toEqual([
			"287658056971",
			"128129332452",
			"257788212847",
			"377538225392",
			"900018651245",
		]);
		expect(byId(listings, "287658056971")).toMatchObject({
			title:
				"Ash Blossom & Joyous Spring | FADED! | RA01-EN008 | Super Rare | NM | YuGiOh!",
			price: 19.99,
			shipping: 0,
			listingType: "buyItNow",
			sellerLocation: "United States",
			listedAt: new Date(2026, 9, 19, 2, 24).getTime(),
		});
		expect(byId(listings, "257788212847").sellerLocation).toBe("Guam");
	});

	test("a lazy-loaded image uses its full-size URL", () => {
		for (const listing of listings) {
			expect(listing.imageUrl).toMatch(/s-l500\.\w+$/);
		}
	});
});

describe("ending soonest", () => {
	const listings = read(
		"ebay-ending-soon.html",
		"https://www.ebay.com/sch/i.html?_nkw=quarter+century+secret+rare&_sop=1",
	);

	test("auctions end at now plus the time left", () => {
		expect(byId(listings, "940016620219")).toMatchObject({
			price: 299,
			listingType: "auction",
			bids: 0,
			endsAt: SAVED_AT + 4 * MINUTE,
			listedAt: null,
		});
		expect(byId(listings, "860046919283")).toMatchObject({
			bids: 2,
			endsAt: SAVED_AT + 10 * MINUTE,
		});
		expect(byId(listings, "198714029825").endsAt).toBe(
			SAVED_AT + (60 + 56) * MINUTE,
		);
		expect(byId(listings, "800794295581")).toMatchObject({
			endsAt: SAVED_AT + (10 * 60 + 38) * MINUTE,
			shipping: 23.78,
			sellerLocation: "United Kingdom",
		});
	});

	test("an auction with Buy It Now keeps the bid price", () => {
		expect(byId(listings, "900016623055")).toMatchObject({
			price: 10,
			listingType: "auction",
			endsAt: SAVED_AT + (3 * 60 + 13) * MINUTE,
		});
	});

	test("local pickup only leaves shipping unknown", () => {
		expect(byId(listings, "820239509115")).toMatchObject({
			shipping: null,
			sellerLocation: "Greece",
		});
	});
});

describe("time left on any card layout (reconstructed fixture)", () => {
	// SAVED_AT is Tuesday 2026-10-20, noon, in the viewer's local time.
	const listings = read("ebay-time-left-layouts.html");
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	function endsAt(itemId: string): number | null {
		return byId(listings, itemId).endsAt;
	}

	test("the time-left element, even outside the bids row", () => {
		expect(endsAt("100000000001")).toBe(SAVED_AT + 4 * DAY + 12 * HOUR);
	});

	test('"4d 12h left" after the bids', () => {
		expect(endsAt("100000000002")).toBe(SAVED_AT + 4 * DAY + 12 * HOUR);
	});

	test('"12h 30m left" on its own row', () => {
		expect(endsAt("100000000003")).toBe(SAVED_AT + 12 * HOUR + 30 * MINUTE);
	});

	test('"Ends in 3h"', () => {
		expect(endsAt("100000000004")).toBe(SAVED_AT + 3 * HOUR);
	});

	test('"45m left"', () => {
		expect(endsAt("100000000005")).toBe(SAVED_AT + 45 * MINUTE);
	});

	test('"Ending today 5:12 PM" is today at that clock time', () => {
		expect(endsAt("100000000006")).toBe(
			new Date(2026, 9, 20, 17, 12).getTime(),
		);
	});

	test('"Time left" then the duration, with no time-left class', () => {
		expect(endsAt("100000000007")).toBe(SAVED_AT + DAY + 2 * HOUR);
	});

	test('"Ending tomorrow 9:05 AM"', () => {
		expect(endsAt("100000000008")).toBe(new Date(2026, 9, 21, 9, 5).getTime());
	});

	test('"Ends Sat, 5:12 PM" is the coming Saturday', () => {
		expect(endsAt("100000000009")).toBe(
			new Date(2026, 9, 24, 17, 12).getTime(),
		);
	});

	test("time left in the secondary rows, beside the listing date", () => {
		expect(endsAt("100000000010")).toBe(SAVED_AT + 6 * DAY + 23 * HOUR);
	});

	test("delivery estimates and other rows aren't read as an end time", () => {
		expect(byId(listings, "100000000011")).toMatchObject({
			listingType: "buyItNow",
			endsAt: null,
		});
		expect(endsAt("100000000012")).toBeNull();
	});

	test("the listing date still reads beside a time left", () => {
		expect(byId(listings, "100000000010").listedAt).toBe(
			new Date(2026, 9, 19, 2, 24).getTime(),
		);
	});
});

describe("results matching fewer words", () => {
	const listings = read("ebay-fewer-words.html");

	test("stops at eBay's 'Results matching fewer words'", () => {
		expect(listings.map((l) => l.itemId)).toEqual([
			"178482819166",
			"397485066069",
			"405785133216",
			"326353939269",
			"405008327892",
		]);
	});

	test("a price range reads its low end", () => {
		expect(byId(listings, "178482819166").price).toBe(0.99);
		expect(byId(listings, "405785133216").price).toBe(1.89);
	});

	test("year-less listing dates step back a year as the list goes back in time", () => {
		expect(listings.map((l) => l.listedAt)).toEqual([
			new Date(2026, 8, 9, 11, 9).getTime(),
			new Date(2026, 0, 11, 8, 5).getTime(),
			new Date(2025, 3, 18, 23, 40).getTime(),
			new Date(2024, 10, 27, 14, 38).getTime(),
			new Date(2024, 4, 30, 23, 0).getTime(),
		]);
	});
});

describe("sold (reconstructed fixture)", () => {
	const listings = read(
		"ebay-sold.html",
		"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_Sold=1&LH_Complete=1&_sop=13",
	);

	test("every result is sold, with its sold date and sold price", () => {
		expect(
			listings.map((l) => [l.itemId, l.sold, l.soldDate, l.price]),
		).toEqual([
			["287658056971", true, "2026-10-18", 18.5],
			["900018651245", true, "2026-10-17", 4.5],
			["128129332452", true, "2026-10-15", 2.75],
			["257788212847", true, "2026-09-30", 55],
		]);
	});

	test("sold auctions and accepted offers keep their type", () => {
		expect(byId(listings, "900018651245")).toMatchObject({
			listingType: "auction",
			bids: 5,
			shipping: 1.36,
		});
		expect(byId(listings, "128129332452").listingType).toBe("bestOffer");
		expect(byId(listings, "257788212847").listingType).toBe("bestOffer");
	});

	test("the sold date marks a result sold even without the sold URL", () => {
		const fromCaption = read("ebay-sold.html");
		expect(fromCaption.every((l) => l.sold)).toBe(true);
	});
});

describe("the payload the app accepts", () => {
	test("every fixture's Listings pass the capture validator", () => {
		const fixtures = [
			"ebay-newly-listed.html",
			"ebay-newly-listed-grid.html",
			"ebay-ending-soon.html",
			"ebay-fewer-words.html",
			"ebay-sold.html",
		];
		for (const fixture of fixtures) {
			for (const listing of read(fixture)) {
				expect(
					validate(yugiohCapturedEbayListingValidator, listing, {
						allowUnknownFields: false,
					}),
					`${fixture} ${listing.itemId}`,
				).toBe(true);
			}
		}
	});
});

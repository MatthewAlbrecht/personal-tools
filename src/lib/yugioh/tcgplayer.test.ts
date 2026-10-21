import { describe, expect, test } from "vitest";
import {
	checkTcgplayerProductUrl,
	parseTcgplayerSearchResponse,
	rarityNamesAgree,
	tcgplayerImageUrl,
	tcgplayerProductUrl,
	tcgplayerSearchUrl,
} from "./tcgplayer";

// Real products, from docs/yugioh/references/tcgplayer-product-lookup.md.
const ashQcsrUrl =
	"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare";
const ashSuperUrl =
	"https://www.tcgplayer.com/product/524809/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring";
const calledUltraUrl =
	"https://www.tcgplayer.com/product/524804/yugioh-25th-anniversary-rarity-collection-called-by-the-grave-ur";

const ashQcsr = {
	cardName: "Ash Blossom & Joyous Spring",
	rarity: "Quarter Century Secret Rare",
};

describe("product URL pattern check", () => {
	test("accepts a product page whose slug names the Card and its rarity", () => {
		expect(checkTcgplayerProductUrl(ashQcsrUrl, ashQcsr)).toEqual({
			productId: 524817,
			productUrl: ashQcsrUrl,
		});
	});

	test("accepts a bare product name, which TCGplayer gives one rarity per set code", () => {
		expect(
			checkTcgplayerProductUrl(ashSuperUrl, {
				cardName: "Ash Blossom & Joyous Spring",
				rarity: "Super Rare",
			}),
		).toEqual({ productId: 524809, productUrl: ashSuperUrl });
	});

	test("accepts TCGplayer's rarity abbreviations in the slug", () => {
		expect(
			checkTcgplayerProductUrl(calledUltraUrl, {
				cardName: "Called by the Grave",
				rarity: "Ultra Rare",
			})?.productId,
		).toBe(524804);
	});

	test("rejects a slug naming a different rarity", () => {
		expect(
			checkTcgplayerProductUrl(ashQcsrUrl, {
				cardName: "Ash Blossom & Joyous Spring",
				rarity: "Secret Rare",
			}),
		).toBeNull();
		expect(
			checkTcgplayerProductUrl(calledUltraUrl, {
				cardName: "Called by the Grave",
				rarity: "Ultimate Rare",
			}),
		).toBeNull();
	});

	test("rejects a slug for a different Card", () => {
		expect(
			checkTcgplayerProductUrl(calledUltraUrl, {
				cardName: "Ash Blossom & Joyous Spring",
				rarity: "Ultra Rare",
			}),
		).toBeNull();
	});

	test("rejects a slug for a different set when the set is known", () => {
		expect(
			checkTcgplayerProductUrl(ashQcsrUrl, {
				...ashQcsr,
				setName: "Quarter Century Bonanza",
			}),
		).toBeNull();
		expect(
			checkTcgplayerProductUrl(ashQcsrUrl, {
				...ashQcsr,
				setName: "25th Anniversary Rarity Collection",
			})?.productId,
		).toBe(524817);
	});

	test("rejects URLs that aren't TCGplayer product pages", () => {
		for (const url of [
			"",
			"not a url",
			"https://www.ebay.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
			"https://www.tcgplayer.com/search/yugioh/product?q=RA01-EN008",
			"https://www.tcgplayer.com/product/abc/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring",
			"https://www.tcgplayer.com/product/524817",
			"https://www.tcgplayer.com/product/524817/magic-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
			// The Card name with no set before it.
			"https://www.tcgplayer.com/product/524817/yugioh-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
			"https://www.tcgplayer.com.evil.example/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
		]) {
			expect(checkTcgplayerProductUrl(url, ashQcsr), url).toBeNull();
		}
	});

	test("strips the query string and trailing slash, and tolerates no www", () => {
		expect(
			checkTcgplayerProductUrl(
				"  tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare/?Language=English&Condition=Near+Mint  ",
				ashQcsr,
			),
		).toEqual({ productId: 524817, productUrl: ashQcsrUrl });
	});

	test("matches names with punctuation the way TCGplayer slugs them", () => {
		expect(
			checkTcgplayerProductUrl(
				"https://www.tcgplayer.com/product/22959/yugioh-stairway-to-the-destined-duel-harpies-feather-duster",
				{ cardName: "Harpie's Feather Duster", rarity: "Common" },
			)?.productId,
		).toBe(22959);
		expect(
			checkTcgplayerProductUrl(
				"https://www.tcgplayer.com/product/256350/yugioh-brothers-of-legend-number-39-utopia",
				{ cardName: "Number 39: Utopia", rarity: "Ultra Rare" },
			)?.productId,
		).toBe(256350);
		expect(
			checkTcgplayerProductUrl(
				"https://www.tcgplayer.com/product/39269/yugioh-storm-of-ragnarok-maxx-c",
				{ cardName: 'Maxx "C"', rarity: "Super Rare" },
			)?.productId,
		).toBe(39269);
	});
});

describe("rarity names", () => {
	test("agree across sources, including TCGplayer's Prismatic names", () => {
		expect(rarityNamesAgree("Ultra Rare", "ultra rare")).toBe(true);
		expect(
			rarityNamesAgree("Prismatic Collector's Rare", "Collector's Rare"),
		).toBe(true);
		expect(rarityNamesAgree("Prismatic Ultimate Rare", "Ultimate Rare")).toBe(
			true,
		);
		expect(rarityNamesAgree("Secret Rare", "Rare")).toBe(false);
		expect(rarityNamesAgree("Quarter Century Secret Rare", "Secret Rare")).toBe(
			false,
		);
	});
});

describe("links", () => {
	test("builds the product URL the way TCGplayer does", () => {
		expect(
			tcgplayerProductUrl({
				productId: 524817,
				setUrlName: "25th Anniversary Rarity Collection",
				productUrlName:
					"Ash Blossom and Joyous Spring Quarter Century Secret Rare",
			}),
		).toBe(ashQcsrUrl);
	});

	test("derives the image from the product id", () => {
		expect(tcgplayerImageUrl(524817)).toBe(
			"https://tcgplayer-cdn.tcgplayer.com/product/524817_in_400x400.jpg",
		);
	});

	test("falls back to a TCGplayer search for the set code", () => {
		expect(tcgplayerSearchUrl("RA01-EN008")).toBe(
			"https://www.tcgplayer.com/search/yugioh/product?q=RA01-EN008&productLineName=yugioh",
		);
	});
});

describe("search response", () => {
	test("reads products and skips malformed results", () => {
		const response = {
			errors: [],
			results: [
				{
					totalResults: 3,
					results: [
						{
							productId: 524817.0,
							productName:
								"Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
							productUrlName:
								"Ash Blossom and Joyous Spring Quarter Century Secret Rare",
							setName: "25th Anniversary Rarity Collection",
							setUrlName: "25th Anniversary Rarity Collection",
							rarityName: "Quarter Century Secret Rare",
							customAttributes: { number: "RA01-EN008" },
							listings: [],
						},
						{ productId: "nope" },
						{
							productId: 524809,
							productName: "Ash Blossom & Joyous Spring",
							productUrlName: "Ash Blossom and Joyous Spring",
							setName: "25th Anniversary Rarity Collection",
							setUrlName: "25th Anniversary Rarity Collection",
							rarityName: "Super Rare",
							customAttributes: { number: "ra01-en008" },
						},
					],
				},
			],
		};

		expect(parseTcgplayerSearchResponse(response)).toEqual([
			{
				productId: 524817,
				productName:
					"Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
				setName: "25th Anniversary Rarity Collection",
				rarityName: "Quarter Century Secret Rare",
				setCode: "RA01-EN008",
				productUrl: ashQcsrUrl,
			},
			{
				productId: 524809,
				productName: "Ash Blossom & Joyous Spring",
				setName: "25th Anniversary Rarity Collection",
				rarityName: "Super Rare",
				setCode: "RA01-EN008",
				productUrl: ashSuperUrl,
			},
		]);
		expect(parseTcgplayerSearchResponse({ nope: true })).toEqual([]);
		expect(parseTcgplayerSearchResponse(null)).toEqual([]);
	});
});

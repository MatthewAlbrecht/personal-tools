import { describe, expect, test } from "vitest";
import {
	checkTcgplayerProductUrl,
	parseTcgplayerSearchResponse,
	rarityNamesAgree,
	readTcgplayerCondition,
	tcgplayerImageUrl,
	tcgplayerProductUrl,
	tcgplayerSearchUrl,
} from "./tcgplayer";

// Real products, from docs/yugioh/references/tcgplayer-product-lookup.md.
const ashQcsrUrl =
	"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare";
const ashSuperUrl =
	"https://www.tcgplayer.com/product/524809/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring";

describe("product URL check", () => {
	test("accepts a product page for that product id, whatever its slug says", () => {
		expect(checkTcgplayerProductUrl(ashQcsrUrl, 524817)).toEqual({
			productId: 524817,
			productUrl: ashQcsrUrl,
		});
		// TCGplayer's server ignores the slug; its details say what the product is.
		expect(
			checkTcgplayerProductUrl(
				"https://www.tcgplayer.com/product/524817/garbage-slug",
				524817,
			)?.productId,
		).toBe(524817);
	});

	test("rejects a product page for another product id", () => {
		expect(checkTcgplayerProductUrl(ashQcsrUrl, 524809)).toBeNull();
	});

	test("rejects URLs that aren't TCGplayer product pages", () => {
		for (const url of [
			"",
			"not a url",
			"https://www.ebay.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
			"https://www.tcgplayer.com/search/yugioh/product?q=RA01-EN008",
			"https://www.tcgplayer.com/product/abc/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring",
			"https://www.tcgplayer.com/product/524817",
			"https://www.tcgplayer.com.evil.example/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
			`https://www.tcgplayer.com/product/524817/${"a".repeat(2000)}`,
		]) {
			expect(checkTcgplayerProductUrl(url), url).toBeNull();
		}
	});

	test("strips the query string and trailing slash, and tolerates no www", () => {
		expect(
			checkTcgplayerProductUrl(
				"  tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare/?Language=English&Condition=Near+Mint  ",
			),
		).toEqual({ productId: 524817, productUrl: ashQcsrUrl });
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

describe("TCGplayer condition", () => {
	test.each([
		["Near Mint 1st Edition", "nearMint"],
		["Near Mint Unlimited", "nearMint"],
		["Lightly Played Limited", "lightlyPlayed"],
		["Moderately Played 1st Edition", "moderatelyPlayed"],
		["Heavily Played", "heavilyPlayed"],
		["Damaged Unlimited", "damaged"],
	] as const)("%s reads as %s, in English", (text, condition) => {
		expect(readTcgplayerCondition(text)).toEqual({
			condition,
			language: "english",
		});
	});

	test.each([
		["NM 1st Edition", "nearMint"],
		["LP", "lightlyPlayed"],
		["MP Unlimited", "moderatelyPlayed"],
		["HP", "heavilyPlayed"],
		["DMG 1st Edition", "damaged"],
	] as const)(
		"the latest sales' short form %s reads as %s",
		(text, condition) => {
			expect(readTcgplayerCondition(text).condition).toBe(condition);
		},
	);

	test("a language TCGplayer names is kept", () => {
		expect(readTcgplayerCondition("Near Mint 1st Edition - Japanese")).toEqual({
			condition: "nearMint",
			language: "japanese",
		});
	});

	test("text that names no condition reads as unknown", () => {
		expect(readTcgplayerCondition("1st Edition")).toEqual({
			condition: null,
			language: "english",
		});
	});
});

describe("card names with punctuation TCGplayer's URL drops", () => {
	// D.D. Crow STON-EN024 Ultimate Rare: the slug's "dd-crow" isn't the app's
	// "D.D. Crow" hyphenated, and the URL is still accepted for its product.
	test("accepts D.D. Crow's URL, where the dots are dropped, not hyphenated", () => {
		expect(
			checkTcgplayerProductUrl(
				"https://www.tcgplayer.com/product/58555/yugioh-strike-of-neos-dd-crow-utr?page=1&Language=English",
				58555,
			),
		).toEqual({
			productId: 58555,
			productUrl:
				"https://www.tcgplayer.com/product/58555/yugioh-strike-of-neos-dd-crow-utr",
		});
	});
});

// @vitest-environment node
// Seam 2: the extension's TCGplayer page reader against saved product pages.
// Fixtures are real pages rendered on 2026-10-20 and trimmed (see each file's
// comment). Page shape: docs/yugioh/references/tcgplayer-product-page.md.

import { readFileSync } from "node:fs";
import { validate } from "convex-helpers/validators";
import { parseHTML } from "linkedom";
import { describe, expect, test } from "vitest";
import { yugiohCapturedTcgplayerProductValidator } from "../../../convex/model/yugioh/validators";
import "../tcgplayer-reader.js";

type Product = {
	productId: number;
	url: string;
	listingsFromCheapest: boolean;
	listings: Array<{
		listingId: string;
		seller: string | null;
		condition: string;
		price: number;
		shipping: number | null;
		quantity: number | null;
		customTitle: string | null;
	}>;
	sales: Array<{
		soldDate: string;
		condition: string;
		quantity: number;
		price: number;
		shipping: number | null;
		customTitle: string | null;
	}>;
	details?: { productName: string; setCode: string; rarity: string } | null;
};

type Reader = (doc: Document, options: { url: string }) => Product | null;

const readTcgplayerProduct = (
	globalThis as unknown as { readTcgplayerProduct: Reader }
).readTcgplayerProduct;

const ASH_URL =
	"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare?Language=English";
const FISH_URL =
	"https://www.tcgplayer.com/product/80526/yugioh-duelist-league-promo-fish-depth-charge-blue?Language=all";

function documentOf(fixture: string): Document {
	const html = readFileSync(
		new URL(`./fixtures/${fixture}`, import.meta.url),
		"utf8",
	);
	return parseHTML(html).document as unknown as Document;
}

function read(fixture: string, url = ASH_URL): Product {
	const product = readTcgplayerProduct(documentOf(fixture), { url });
	if (!product) throw new Error("Not read as a product page");
	return product;
}

describe("a product page as loaded", () => {
	test("reads every current Listing on the page, not the buy box again", () => {
		const product = read("tcgplayer-product.html");
		expect(product.productId).toBe(524817);
		expect(product.url).toBe(ASH_URL);
		expect(product.listings).toHaveLength(10);
		expect(product.listings[0]).toEqual({
			listingId: "7512666-3477adeb",
			seller: "Solo Gaming",
			condition: "Lightly Played 1st Edition",
			price: 40.98,
			shipping: 0,
			quantity: 1,
			customTitle: null,
		});
	});

	test("reads shipping charged on top, and how many Copies a seller has", () => {
		const { listings } = read("tcgplayer-product.html");
		expect(listings.find((l) => l.seller === "PandapalCards")).toMatchObject({
			price: 40,
			shipping: 0.99,
		});
		expect(listings.find((l) => l.seller === "MJG Lite")).toMatchObject({
			condition: "Near Mint 1st Edition",
			quantity: 3,
		});
	});

	test("page 1 with only the default language filter starts from the cheapest", () => {
		expect(read("tcgplayer-product.html").listingsFromCheapest).toBe(true);
	});

	test("the latest sales aren't on the page until they're opened", () => {
		expect(read("tcgplayer-product.html").sales).toEqual([]);
	});
});

describe("latest sales", () => {
	test("reads each sale's date, full condition, quantity and price", () => {
		const { sales } = read("tcgplayer-latest-sales.html");
		expect(sales).toHaveLength(5);
		expect(sales[0]).toEqual({
			soldDate: "2026-10-20",
			condition: "Near Mint 1st Edition",
			quantity: 3,
			price: 43.42,
			shipping: null,
			customTitle: null,
		});
		expect(sales.map((sale) => sale.condition)).toEqual([
			"Near Mint 1st Edition",
			"Near Mint 1st Edition",
			"Moderately Played 1st Edition",
			"Near Mint 1st Edition",
			"Lightly Played 1st Edition",
		]);
	});

	test("unpadded dates read in full", () => {
		const product = read("tcgplayer-no-listings.html", FISH_URL);
		expect(product.sales.map((sale) => [sale.soldDate, sale.price])).toEqual([
			["2026-08-11", 5.67],
			["2026-08-11", 5.97],
			["2026-08-11", 5.96],
		]);
	});
});

describe("other pages", () => {
	test("a Listing with photos carries the seller's own title and id", () => {
		const url = `${ASH_URL}&page=3`;
		const product = read("tcgplayer-page-3.html", url);
		expect(product.listings.find((l) => l.customTitle !== null)).toMatchObject({
			listingId: "7512665-796b3365-2630183",
			seller: "Top Cards NYC",
			price: 45,
			shipping: 1,
			customTitle: "Korean Ash Blossom Alt Art Quarter Century Rare",
		});
		expect(product.listings.filter((l) => l.customTitle !== null)).toHaveLength(
			1,
		);
	});

	test("a later page, or one filtered by condition or another language, doesn't start from the cheapest", () => {
		expect(
			read("tcgplayer-page-3.html", `${ASH_URL}&page=3`).listingsFromCheapest,
		).toBe(false);
		expect(
			read("tcgplayer-product.html", `${ASH_URL}&Condition=Near+Mint`)
				.listingsFromCheapest,
		).toBe(false);
		expect(
			read("tcgplayer-product.html", `${ASH_URL}&page=1`).listingsFromCheapest,
		).toBe(true);
		const ashIn = (language: string) =>
			ASH_URL.replace("Language=English", `Language=${language}`);
		expect(
			read("tcgplayer-product.html", ashIn("Japanese")).listingsFromCheapest,
		).toBe(false);
		expect(
			read("tcgplayer-product.html", ashIn("all")).listingsFromCheapest,
		).toBe(true);
	});

	test("a product with no Listings reads as none", () => {
		const product = read("tcgplayer-no-listings.html", FISH_URL);
		expect(product.productId).toBe(80526);
		expect(product.listings).toEqual([]);
		expect(product.listingsFromCheapest).toBe(true);
	});

	test("reads what the product is: its name, set code and rarity", () => {
		expect(read("tcgplayer-product.html").details).toEqual({
			productName: "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
		});
		expect(read("tcgplayer-no-listings.html", FISH_URL).details).toEqual({
			productName: "Fish Depth Charge (Blue)",
			setCode: "DL14-EN018",
			rarity: "Rare",
		});
	});

	test("a page whose details haven't loaded reads them as unknown", () => {
		const { document } = parseHTML(
			readFileSync(
				new URL("./fixtures/tcgplayer-page-3.html", import.meta.url),
				"utf8",
			),
		);
		const product = readTcgplayerProduct(document as unknown as Document, {
			url: ASH_URL,
		});
		expect(product?.details).toBeNull();
	});

	test("a page that isn't a product page reads as nothing", () => {
		expect(
			readTcgplayerProduct(documentOf("tcgplayer-product.html"), {
				url: "https://www.tcgplayer.com/search/yugioh/product?q=RA01-EN008",
			}),
		).toBeNull();
	});
});

test("every fixture reads into what the ingest accepts", () => {
	const pages: Array<[string, string]> = [
		["tcgplayer-product.html", ASH_URL],
		["tcgplayer-latest-sales.html", ASH_URL],
		["tcgplayer-page-3.html", `${ASH_URL}&page=3`],
		["tcgplayer-no-listings.html", FISH_URL],
	];
	for (const [fixture, url] of pages) {
		expect(
			validate(yugiohCapturedTcgplayerProductValidator, read(fixture, url)),
			fixture,
		).toBe(true);
	}
});

describe("check pages", () => {
	const isTcgplayerCheckPage = (
		globalThis as unknown as {
			isTcgplayerCheckPage: (doc: Document) => boolean;
		}
	).isTcgplayerCheckPage;

	test("a Cloudflare challenge and a CloudFront block are check pages", () => {
		expect(
			isTcgplayerCheckPage(documentOf("tcgplayer-check-cloudflare.html")),
		).toBe(true);
		expect(
			isTcgplayerCheckPage(documentOf("tcgplayer-check-blocked.html")),
		).toBe(true);
	});

	test("product pages aren't", () => {
		for (const fixture of [
			"tcgplayer-product.html",
			"tcgplayer-no-listings.html",
			"tcgplayer-latest-sales.html",
			"tcgplayer-page-3.html",
		]) {
			expect(isTcgplayerCheckPage(documentOf(fixture))).toBe(false);
		}
	});
});

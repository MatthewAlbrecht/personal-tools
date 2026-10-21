// TCGplayer product links, images and the product URL pattern check. Pure
// logic shared by Convex (relative imports only) and the /yugioh UI.
// Formats: docs/yugioh/references/tcgplayer-product-lookup.md.

import { RARITIES } from "./deck";
import { LANGUAGES, type Language, type ReadCondition } from "./title-reading";

const PRODUCT_HOSTS = new Set(["www.tcgplayer.com", "tcgplayer.com"]);

/**
 * One part of a TCGplayer slug, made the way TCGplayer's own front end makes
 * it: `&` → and, `+` → plus, `%` → pct, other punctuation dropped, words
 * joined by hyphens. "Harpie's Feather Duster" → "harpies-feather-duster".
 */
export function tcgplayerSlugPart(text: string): string {
	return text
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/\+/g, " plus ")
		.replace(/%/g, " pct ")
		.replace(/['"‘’“”`]/g, "")
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}

export function tcgplayerProductUrl(product: {
	productId: number;
	setUrlName: string;
	productUrlName: string;
}): string {
	const slug = [
		"yugioh",
		tcgplayerSlugPart(product.setUrlName),
		tcgplayerSlugPart(product.productUrlName),
	].join("-");
	return `https://www.tcgplayer.com/product/${product.productId}/${slug}`;
}

/** The product image on TCGplayer's CDN. 400x400 fits a card at 273×400. */
export function tcgplayerImageUrl(productId: number): string {
	return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_400x400.jpg`;
}

/** The fallback link when a Printing has no product page yet. */
export function tcgplayerSearchUrl(setCode: string): string {
	const params = new URLSearchParams({ q: setCode, productLineName: "yugioh" });
	return `https://www.tcgplayer.com/search/yugioh/product?${params.toString()}`;
}

// TCGplayer's rarity names that differ from the rest of the hobby's, as
// rarity keys (from its search API's rarityName aggregation; see
// docs/yugioh/references/tcgplayer-product-lookup.md).
const RARITY_ALIASES: Record<string, string> = {
	"prismatic-collectors-rare": "collectors-rare",
	"prismatic-ultimate-rare": "ultimate-rare",
	// "Ultra Pharaoh’s Rare" is the hobby's "Ultra Rare (Pharaoh's Rare)".
	"ultra-pharaohs-rare": "ultra-rare-pharaohs-rare",
	"secret-pharaohs-rare": "secret-rare-pharaohs-rare",
	// TCGplayer files Short Prints with Commons: "Common / Short Print".
	"common-short-print": "common",
	"short-print": "common",
};

function rarityKey(rarity: string): string {
	const slug = tcgplayerSlugPart(rarity);
	return RARITY_ALIASES[slug] ?? slug;
}

/** "Prismatic Collector's Rare" (TCGplayer) agrees with "Collector's Rare". */
export function rarityNamesAgree(a: string, b: string): boolean {
	return rarityKey(a) === rarityKey(b);
}

// Rarity abbreviations TCGplayer puts in product names, e.g. "(UR)", plus the
// app's own. Values are rarity keys.
const SUFFIX_ABBREVIATIONS: Record<string, string> = {
	...Object.fromEntries(
		RARITIES.map((rarity) => [
			rarity.abbreviation.toLowerCase(),
			rarityKey(rarity.name),
		]),
	),
	pur: "ultimate-rare",
	pcr: "collectors-rare",
	pscr: "prismatic-secret-rare",
	upr: "ultra-rare-pharaohs-rare",
	spr: "secret-rare-pharaohs-rare",
	eur: "emblazoned-ultra-rare",
	esr: "emblazoned-secret-rare",
	gmr: "grand-master-rare",
};

/** Whether a product-name suffix (after the Card name) names this rarity. */
function suffixAgrees(suffix: string, rarity: string): boolean {
	const key = rarityKey(rarity);
	return (
		RARITY_ALIASES[suffix] === key ||
		suffix === key ||
		SUFFIX_ABBREVIATIONS[suffix] === key
	);
}

/**
 * The Card's name in a TCGplayer product name: without the rarity TCGplayer
 * adds when a set code has more than one product.
 * "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)" → "Ash Blossom & Joyous Spring".
 */
export function tcgplayerCardName(productName: string, rarity: string): string {
	const match = /^(.*\S)\s*\(([^()]+)\)$/.exec(productName.trim());
	if (!match?.[1] || !match[2]) return productName.trim();
	const suffix = tcgplayerSlugPart(match[2]);
	return rarityNamesAgree(match[2], rarity) || suffixAgrees(suffix, rarity)
		? match[1]
		: productName.trim();
}

export type TcgplayerProductLink = { productId: number; productUrl: string };

/** Shown when a pasted URL fails the check, on the client and the server. */
export const REJECTED_PRODUCT_URL =
	"That isn't a TCGplayer product page for this Printing.";

/** Longer pasted URLs are rejected without parsing. */
export const MAX_PRODUCT_URL_LENGTH = 2000;

/**
 * A TCGplayer product URL, `tcgplayer.com/product/<id>/<slug>`, with the id
 * given when known. The slug isn't checked: TCGplayer's server ignores it, and
 * TCGplayer's own details (set code and rarity), not its spelling of the name,
 * say which Printing a product is. Returns the URL without its query string,
 * or null.
 */
export function checkTcgplayerProductUrl(
	url: string,
	productId?: number,
): TcgplayerProductLink | null {
	if (url.length > MAX_PRODUCT_URL_LENGTH) return null;
	const parsed = parseProductUrl(url);
	if (!parsed) return null;
	if (productId !== undefined && parsed.productId !== productId) return null;
	return {
		productId: parsed.productId,
		productUrl: `https://www.tcgplayer.com/product/${parsed.productId}/${parsed.slug}`,
	};
}

/** The product id in a TCGplayer product URL, or null if it isn't one. */
export function tcgplayerProductIdOf(url: string): number | null {
	return parseProductUrl(url)?.productId ?? null;
}

function parseProductUrl(
	input: string,
): { productId: number; slug: string } | null {
	const trimmed = input.trim();
	if (trimmed === "") return null;
	let url: URL;
	try {
		url = new URL(
			/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
		);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (!PRODUCT_HOSTS.has(url.hostname.toLowerCase())) return null;
	const segments = url.pathname.split("/").filter((segment) => segment !== "");
	if (segments.length !== 3 || segments[0] !== "product") return null;
	const [, id, slug] = segments;
	if (!id || !/^\d+$/.test(id) || !slug) return null;
	const lower = slug.toLowerCase();
	if (!/^[a-z0-9-]+$/.test(lower)) return null;
	return { productId: Number(id), slug: lower };
}

/** One TCGplayer product, as read from its search API. */
export type TcgplayerProduct = {
	productId: number;
	productName: string;
	setName: string;
	rarityName: string;
	/** The full set code, e.g. "RA01-EN008". */
	setCode: string;
	productUrl: string;
};

/**
 * Reads products out of a `mp-search-api.tcgplayer.com/v1/search/request`
 * response. Anything malformed is skipped rather than trusted.
 */
export function parseTcgplayerSearchResponse(
	response: unknown,
): TcgplayerProduct[] {
	const groups = field(response, "results");
	if (!Array.isArray(groups)) return [];
	const products: TcgplayerProduct[] = [];
	for (const group of groups) {
		const results = field(group, "results");
		if (!Array.isArray(results)) continue;
		for (const result of results) {
			const product = parseTcgplayerProduct(result);
			if (product) products.push(product);
		}
	}
	return products;
}

/**
 * Reads one product: a search hit, or the body of
 * `mp-search-api.tcgplayer.com/v1/product/<id>/details`. Null if malformed.
 */
export function parseTcgplayerProduct(
	result: unknown,
): TcgplayerProduct | null {
	const productId = field(result, "productId");
	const productName = field(result, "productName");
	const productUrlName = field(result, "productUrlName");
	const setName = field(result, "setName");
	const setUrlName = field(result, "setUrlName");
	const rarityName = field(result, "rarityName");
	const number = field(field(result, "customAttributes"), "number");
	if (
		typeof productId !== "number" ||
		!Number.isFinite(productId) ||
		productId <= 0 ||
		typeof productName !== "string" ||
		typeof productUrlName !== "string" ||
		typeof setName !== "string" ||
		typeof setUrlName !== "string" ||
		typeof rarityName !== "string" ||
		typeof number !== "string"
	) {
		return null;
	}
	const id = Math.round(productId);
	return {
		productId: id,
		productName,
		setName,
		rarityName,
		setCode: number.trim().toUpperCase(),
		productUrl: tcgplayerProductUrl({
			productId: id,
			setUrlName,
			productUrlName,
		}),
	};
}

function field(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null) return undefined;
	return (value as Record<string, unknown>)[key];
}

// TCGplayer's condition names, and the short forms its latest sales use.
const TCGPLAYER_CONDITIONS: ReadonlyArray<[RegExp, ReadCondition]> = [
	[/\bnear mint\b|\bnm\b/, "nearMint"],
	[/\blightly played\b|\blp\b/, "lightlyPlayed"],
	[/\bmoderately played\b|\bmp\b/, "moderatelyPlayed"],
	[/\bheavily played\b|\bhp\b/, "heavilyPlayed"],
	[/\bdamaged\b|\bdmg\b/, "damaged"],
];

/**
 * What a TCGplayer condition says: "Near Mint 1st Edition" (or the latest
 * sales' "NM 1st Edition") is Near Mint, in English. TCGplayer names a
 * language only when it isn't English ("… - Japanese"). A text without a
 * condition reads as unknown (null).
 */
export function readTcgplayerCondition(text: string): {
	condition: ReadCondition | null;
	language: Language;
} {
	const lower = text.toLowerCase();
	const condition =
		TCGPLAYER_CONDITIONS.find(([pattern]) => pattern.test(lower))?.[1] ?? null;
	const language =
		LANGUAGES.find(
			(name) => name !== "english" && new RegExp(`\\b${name}\\b`).test(lower),
		) ?? "english";
	return { condition, language };
}

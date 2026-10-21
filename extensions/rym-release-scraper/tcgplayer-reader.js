// Reads a TCGplayer product page into what the Yu-Gi-Oh tracker stores: its
// current Listings and, once the sales window is open, its latest sales.
// Pure DOM in, plain objects out: the content script passes the live
// `document`; the tests pass saved pages (tests/fixtures). No chrome APIs.
// Page shape: docs/yugioh/references/tcgplayer-product-page.md.
//
// The result matches `yugiohCapturedTcgplayerProductValidator` in
// convex/model/yugioh/validators.ts.

// URL filters that narrow the Listings beyond the default language.
const TCGPLAYER_NARROWING_PARAMS = ["Condition", "Printing", "direct"];

// Language filters that still show every English Listing.
const TCGPLAYER_ENGLISH_LANGUAGES = ["english", "all"];

// The latest sales' short conditions, for a row without its full-text tooltip.
const TCGPLAYER_CONDITION_NAMES = {
	NM: "Near Mint",
	LP: "Lightly Played",
	MP: "Moderately Played",
	HP: "Heavily Played",
	DMG: "Damaged",
};

function tcgplayerText(el) {
	return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

/** "$1,040.98" → 1040.98; null when there's no dollar amount. */
function tcgplayerMoney(text) {
	const match = /\$\s*([\d,]+(?:\.\d+)?)/.exec(text);
	return match ? Number(match[1].replace(/,/g, "")) : null;
}

/** The product id in a product page URL, or null on any other page. */
function tcgplayerProductId(url) {
	const match = /^\/product\/(\d+)(?:\/|$)/.exec(url.pathname);
	return match ? Number(match[1]) : null;
}

/**
 * The Listings shown start from the cheapest when they're page 1 with no
 * condition, printing or Direct filter, and every English Listing in view
 * (TCGplayer sorts by price + shipping).
 */
function tcgplayerListingsFromCheapest(url) {
	const page = url.searchParams.get("page");
	if (page !== null && page !== "1") return false;
	const language = url.searchParams.get("Language");
	if (
		language !== null &&
		!TCGPLAYER_ENGLISH_LANGUAGES.includes(language.toLowerCase())
	) {
		return false;
	}
	return TCGPLAYER_NARROWING_PARAMS.every(
		(param) => !url.searchParams.has(param),
	);
}

/** The page's own Listings (the buy box repeats the cheapest outside them). */
function tcgplayerListingItems(doc) {
	return [
		...doc.querySelectorAll(
			".product-details__listings-results > section.listing-item",
		),
	];
}

/** How many Listings the page shows so far (the content script waits on it). */
function countTcgplayerListings(doc) {
	return tcgplayerListingItems(doc).length;
}

/** Whether the page says it has no Listings at all. */
function tcgplayerHasNoListings(doc) {
	return /No Listings Available/i.test(
		tcgplayerText(doc.querySelector(".product-details__listings")),
	);
}

/** "Shipping: Included" or "Free Shipping" → 0; "+ $0.99 Shipping" → 0.99. */
function tcgplayerShipping(text) {
	const charged = /\+\s*\$\s*([\d,]+(?:\.\d+)?)\s*Shipping/i.exec(text);
	if (charged) return Number(charged[1].replace(/,/g, ""));
	if (/Included|Free Shipping/i.test(text)) return 0;
	return null;
}

/** The seller's own title on a Listing with photos: its first text, without "View Details". */
function tcgplayerCustomTitle(item) {
	const title = item.querySelector(
		".listing-item__listing-data__listo__title > div",
	);
	if (!title) return null;
	let text = "";
	for (const node of title.childNodes) {
		if (node.nodeType === 3) text += node.textContent;
	}
	text = text.replace(/\s+/g, " ").trim();
	return text === "" ? null : text;
}

function readTcgplayerListing(item) {
	const testId =
		item.querySelector("section.add-to-cart")?.getAttribute("data-testid") ??
		"";
	const listingId = testId.replace(/^AddToCart_/, "");
	const price = tcgplayerMoney(
		tcgplayerText(
			item.querySelector(".listing-item__listing-data__info__price"),
		),
	);
	const condition = tcgplayerText(
		item.querySelector("h3.listing-item__condition"),
	);
	if (listingId === "" || price === null || condition === "") return null;
	const quantity = /of\s+(\d+)/.exec(
		tcgplayerText(item.querySelector("[data-testid=availableTotalQuantity]")),
	);
	return {
		listingId,
		seller: tcgplayerText(item.querySelector("a.seller-info__name")) || null,
		condition,
		price,
		shipping: tcgplayerShipping(
			tcgplayerText(
				item.querySelector(
					".listing-item__listing-data__info__shipping-message",
				),
			),
		),
		quantity: quantity ? Number(quantity[1]) : null,
		customTitle: tcgplayerCustomTitle(item),
	};
}

/** "10/20/26" (month/day/two-digit year, unpadded) → "2026-10-20". */
function tcgplayerSaleDate(text) {
	const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
	if (!match) return null;
	const year = match[3].length === 2 ? `20${match[3]}` : match[3];
	return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

/** The full condition from the tooltip ("Near Mint 1st Edition"), else the short one spelled out. */
function tcgplayerSaleCondition(cell) {
	const full = tcgplayerText(cell?.querySelector(".tcg-tooltip__content"));
	if (full !== "") return full;
	const toggle = cell?.querySelector(".tcg-tooltip__toggle") ?? cell;
	let short = "";
	for (const node of toggle?.childNodes ?? []) {
		if (node.nodeType === 3) short += node.textContent;
	}
	short = short.replace(/\s+/g, " ").trim() || tcgplayerText(cell);
	return short.replace(
		/^(NM|LP|MP|HP|DMG)\b/,
		(abbreviation) => TCGPLAYER_CONDITION_NAMES[abbreviation],
	);
}

function readTcgplayerSale(row) {
	const soldDate = tcgplayerSaleDate(
		tcgplayerText(row.querySelector(".latest-sales-table__tbody__date")),
	);
	const conditionCell = row.querySelector(
		".latest-sales-table__tbody__condition",
	);
	const condition = tcgplayerSaleCondition(conditionCell);
	const quantity = Number(
		tcgplayerText(row.querySelector(".latest-sales-table__tbody_quantity")),
	);
	const price = tcgplayerMoney(
		tcgplayerText(row.querySelector(".latest-sales-table__tbody__price")),
	);
	if (soldDate === null || condition === "" || price === null) return null;
	const custom = conditionCell?.querySelector(
		".latest-sales-table__tbody__condition__custom-listing",
	);
	return {
		soldDate,
		condition,
		quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
		price,
		// The page doesn't show what a sale's shipping was.
		shipping: null,
		customTitle: custom ? tcgplayerText(custom) || null : null,
	};
}

/** The latest sales rows the page shows (only once the sales window is open). */
function tcgplayerSaleRows(doc) {
	return [...doc.querySelectorAll("tbody.latest-sales-table__tbody > tr")];
}

/** "View More Data": opens the window with the latest sales. */
function tcgplayerLatestSalesOpener(doc) {
	return doc.querySelector(".price-guide__latest-sales .modal__activator");
}

/** "Load More Sales" (signed in only; signed out it asks to sign in). */
function tcgplayerLoadMoreSales(doc) {
	const button = doc.querySelector(
		"button.sales-history-snapshot__load-more__button",
	);
	return button && /Load More Sales/i.test(tcgplayerText(button))
		? button
		: null;
}

/**
 * The product page's current Listings and the latest sales shown, or null
 * when `url` isn't a product page.
 */
function readTcgplayerProduct(doc, { url }) {
	const parsed = new URL(url);
	const productId = tcgplayerProductId(parsed);
	if (productId === null) return null;
	return {
		productId,
		url,
		listingsFromCheapest: tcgplayerListingsFromCheapest(parsed),
		listings: tcgplayerListingItems(doc)
			.map(readTcgplayerListing)
			.filter((listing) => listing !== null),
		sales: tcgplayerSaleRows(doc)
			.map(readTcgplayerSale)
			.filter((sale) => sale !== null),
	};
}

globalThis.readTcgplayerProduct = readTcgplayerProduct;
globalThis.countTcgplayerListings = countTcgplayerListings;
globalThis.tcgplayerHasNoListings = tcgplayerHasNoListings;
globalThis.tcgplayerSaleRows = tcgplayerSaleRows;
globalThis.tcgplayerLatestSalesOpener = tcgplayerLatestSalesOpener;
globalThis.tcgplayerLoadMoreSales = tcgplayerLoadMoreSales;

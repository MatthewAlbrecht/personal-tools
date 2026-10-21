// Reads an eBay search-results page into the Listings the Yu-Gi-Oh tracker
// stores. Pure DOM in, plain objects out: the content script passes the live
// `document`; the tests pass saved pages (tests/fixtures). No chrome APIs here.
// Page shape: docs/yugioh/references/ebay-search-results.md.
//
// Each Listing matches `yugiohCapturedEbayListingValidator` in
// convex/model/yugioh/validators.ts.

// eBay renders two hidden "Shop on eBay" cards with this fake id.
const EBAY_PLACEHOLDER_ITEM_ID = "2500219655424533";

const EBAY_MONTHS = {
	jan: 0,
	feb: 1,
	mar: 2,
	apr: 3,
	may: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	sep: 8,
	oct: 9,
	nov: 10,
	dec: 11,
};

// Longest prefixes first, so "AU $" wins over "$".
const EBAY_CURRENCY_PREFIXES = [
	["AU $", "AUD"],
	["C $", "CAD"],
	["US $", "USD"],
	["GBP", "GBP"],
	["EUR", "EUR"],
	["JPY", "JPY"],
	["£", "GBP"],
	["€", "EUR"],
	["¥", "JPY"],
	["$", "USD"],
];

function ebayText(el) {
	return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

/** The result cards of the search, up to eBay's "Results matching fewer words". */
function ebayResultCards(doc) {
	const cards = [];
	for (const li of doc.querySelectorAll("ul.srp-results > li")) {
		if (li.classList.contains("srp-river-answer--REWRITE_START")) break;
		if (!li.classList.contains("s-card")) continue;
		const itemId = li.getAttribute("data-listingid");
		if (!itemId || itemId === EBAY_PLACEHOLDER_ITEM_ID) continue;
		cards.push(li);
	}
	return cards;
}

/** How many results the page shows so far (the content script waits on it). */
function countEbayResults(doc) {
	return ebayResultCards(doc).length;
}

/** "$1,234.50" → { amount: 1234.5, currency: "USD" }; a range gives its low end. */
function parseEbayMoney(text) {
	const value = text.trim();
	for (const [prefix, currency] of EBAY_CURRENCY_PREFIXES) {
		if (!value.startsWith(prefix)) continue;
		const match = value.slice(prefix.length).match(/^\s*([\d,]+(?:\.\d+)?)/);
		if (!match) return null;
		return { amount: Number(match[1].replace(/,/g, "")), currency };
	}
	return null;
}

/** "1d 2h", "1h 56m", "4m" → milliseconds. */
function parseEbayDuration(text) {
	const units = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };
	let total = 0;
	let found = false;
	for (const match of text.matchAll(/(\d+)\s*([dhms])\b/g)) {
		total += Number(match[1]) * units[match[2]];
		found = true;
	}
	return found ? total : null;
}

/** "Sold  Oct 18, 2026" → "2026-10-18". */
function parseEbaySoldDate(text) {
	const match = text.match(
		/^Sold\s+([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4})/,
	);
	if (!match) return null;
	const month = EBAY_MONTHS[match[1].toLowerCase()];
	if (month === undefined) return null;
	const mm = String(month + 1).padStart(2, "0");
	const dd = match[2].padStart(2, "0");
	return `${match[3]}-${mm}-${dd}`;
}

/** "Oct-19 02:24" → { month, day, hour, minute }; eBay shows no year. */
function parseEbayListedDate(text) {
	const match = text.match(/^([A-Za-z]{3})-(\d{1,2}) (\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const month = EBAY_MONTHS[match[1].toLowerCase()];
	if (month === undefined) return null;
	return {
		month,
		day: Number(match[2]),
		hour: Number(match[3]),
		minute: Number(match[4]),
	};
}

function readEbayCard(li, now, soldPage) {
	const itemId = li.getAttribute("data-listingid");
	const title = ebayText(li.querySelector(".s-card__title span.primary"));
	const image = li.querySelector("img.s-card__image");
	const imageUrl =
		(image &&
			(image.getAttribute("data-defer-load") || image.getAttribute("src"))) ||
		null;

	const priceEl = li.querySelector(".s-card__price");
	const money = priceEl ? parseEbayMoney(ebayText(priceEl)) : null;

	let shipping = null;
	let bids = null;
	let bestOffer = false;
	let sellerLocation = null;
	for (const row of li.querySelectorAll(
		".su-card-container__attributes__primary > .s-card__attribute-row",
	)) {
		const text = ebayText(row);
		const bidMatch = text.match(/^(\d+) bids?\b/);
		if (bidMatch) {
			bids = Number(bidMatch[1]);
		} else if (/^or Best Offer$|^Best Offer accepted$/i.test(text)) {
			bestOffer = true;
		} else if (text.startsWith("Located in ")) {
			sellerLocation = text.slice("Located in ".length).trim() || null;
		} else if (/^Free (delivery|shipping)/i.test(text)) {
			shipping = 0;
		} else if (/^\+.+\b(delivery|shipping)/i.test(text)) {
			const cost = parseEbayMoney(text.slice(1));
			if (cost) shipping = cost.amount;
		}
	}

	const timeLeftMs = parseEbayDuration(
		ebayText(li.querySelector(".s-card__time-left")),
	);

	const caption = ebayText(li.querySelector(".s-card__caption"));
	const soldDate = parseEbaySoldDate(caption);

	const listedRow = li.querySelector(
		".su-card-container__attributes__secondary > .s-card__attribute-row",
	);

	return {
		listing: {
			itemId,
			url: `https://www.ebay.com/itm/${itemId}`,
			title,
			imageUrl,
			price: money ? money.amount : null,
			currency: money ? money.currency : null,
			shipping,
			listingType:
				bids !== null ? "auction" : bestOffer ? "bestOffer" : "buyItNow",
			bids,
			endsAt: timeLeftMs === null ? null : now + timeLeftMs,
			listedAt: null,
			sellerLocation,
			sold: soldPage || soldDate !== null,
			soldDate,
		},
		listedDate: parseEbayListedDate(ebayText(listedRow)),
	};
}

/**
 * Turns the year-less listing dates into Unix ms (viewer's local time). The
 * newly-listed sort runs newest first, so the year steps back whenever a date
 * comes out later than the one above it. A date after `now` is last year's.
 */
function ebayListedTimes(listedDates, now) {
	let year = new Date(now).getFullYear();
	let previous = now;
	return listedDates.map((date) => {
		if (!date) return null;
		let time = new Date(
			year,
			date.month,
			date.day,
			date.hour,
			date.minute,
		).getTime();
		while (time > previous) {
			year -= 1;
			time = new Date(
				year,
				date.month,
				date.day,
				date.hour,
				date.minute,
			).getTime();
		}
		previous = time;
		return time;
	});
}

/**
 * Reads every result on an eBay search-results page.
 * `now` (Unix ms) turns "time left" and year-less dates into timestamps.
 * `url` is the page URL; on a sold search (`LH_Sold=1`) every result is sold.
 */
function readEbayResults(doc, { now, url }) {
	const soldPage = new URL(url).searchParams.get("LH_Sold") === "1";
	const read = ebayResultCards(doc).map((li) =>
		readEbayCard(li, now, soldPage),
	);
	const listedTimes = ebayListedTimes(
		read.map((card) => card.listedDate),
		now,
	);
	return {
		listings: read.map((card, index) => ({
			...card.listing,
			listedAt: listedTimes[index],
		})),
	};
}

globalThis.readEbayResults = readEbayResults;
globalThis.countEbayResults = countEbayResults;

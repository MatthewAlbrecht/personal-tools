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

// One unit of eBay's time left: "4d", "12h", "30m" (not "4 days").
const EBAY_TIME_UNIT = String.raw`\d+\s*[dhm](?![a-z])`;
const EBAY_DURATION = `${EBAY_TIME_UNIT}(?:\\s*${EBAY_TIME_UNIT}){0,2}`;
// "Time left 1d 2h", "Ends in 3h", "Ending in 45m".
const EBAY_TIME_LEFT_AFTER_LABEL = new RegExp(
	String.raw`\b(?:time left|ends in|ending in):?\s*(${EBAY_DURATION})`,
	"i",
);
// "4d 12h left", "45m left".
const EBAY_TIME_LEFT_BEFORE_LEFT = new RegExp(
	String.raw`(?:^|[^\w])(${EBAY_DURATION})\s+left\b`,
	"i",
);
// "Ending today 5:12 PM", "Ends tomorrow 9:05 AM", "Ends Sat, 5:12 PM".
const EBAY_END_CLOCK =
	/\b(?:ending|ends)\s+(today|tomorrow|sun|mon|tue|wed|thu|fri|sat)[a-z]*,?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i;
const EBAY_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * The card's own text, each text node apart, leaving out the title (a title
 * could say anything) and eBay's hidden decoys.
 */
function ebayCardText(li) {
	const parts = [];
	(function walk(node) {
		for (const child of node.childNodes) {
			if (child.nodeType === 3) {
				const text = child.textContent.replace(/\s+/g, " ").trim();
				if (text) parts.push(text);
			} else if (
				child.nodeType === 1 &&
				!child.classList.contains("s-card__title") &&
				child.getAttribute("aria-hidden") !== "true"
			) {
				walk(child);
			}
		}
	})(li);
	return parts.join(" ");
}

/**
 * When an auction ends (Unix ms), from whatever time-left text its card
 * shows, or null when it shows none. `.s-card__time-left` wins; otherwise any
 * of eBay's formats: "4d 12h left", "Ends in 3h", "Time left 1d 2h",
 * "Ending today 5:12 PM", "Ends Sat, 5:12 PM". Clock times are the viewer's.
 */
function ebayEndsAt(li, now) {
	const marked = parseEbayDuration(
		ebayText(li.querySelector(".s-card__time-left")),
	);
	if (marked !== null) return now + marked;

	const text = ebayCardText(li);
	const duration =
		text.match(EBAY_TIME_LEFT_AFTER_LABEL) ??
		text.match(EBAY_TIME_LEFT_BEFORE_LEFT);
	if (duration) {
		const ms = parseEbayDuration(duration[1]);
		if (ms !== null) return now + ms;
	}

	const clock = text.match(EBAY_END_CLOCK);
	if (!clock) return null;
	const day = clock[1].toLowerCase();
	let hour = Number(clock[2]);
	const minute = Number(clock[3]);
	const meridiem = clock[4]?.toLowerCase();
	if (meridiem === "pm" && hour < 12) hour += 12;
	if (meridiem === "am" && hour === 12) hour = 0;
	const today = new Date(now);
	let daysAhead = 0;
	if (day === "tomorrow") {
		daysAhead = 1;
	} else if (day !== "today") {
		// A weekday is the coming one; today would have said "today".
		const target = EBAY_WEEKDAYS.indexOf(day.slice(0, 3));
		daysAhead = (target - today.getDay() + 7) % 7 || 7;
	}
	return new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate() + daysAhead,
		hour,
		minute,
	).getTime();
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
			endsAt: ebayEndsAt(li, now),
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
 * `now` (Unix ms) turns time left, end clock times and year-less dates into
 * timestamps.
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

// eBay's check pages (docs/yugioh/references/marketplace-check-pages.md):
// its browser check ("Pardon Our Interruption..."), its captcha ("Security
// Measure | eBay") and Akamai's edge block ("Error Page | eBay", "SORRY
// Something went wrong on our end"). The first two live at /splashui/*,
// where this script doesn't run; the service worker spots those by URL.
const EBAY_CHECK_TITLES = [
	/^Pardon Our Interruption/i,
	/^Security Measure \| eBay$/i,
	/^Error Page \| eBay$/i,
];
const EBAY_CHECK_SELECTORS =
	"form#destForm, #_chlghost, form#captcha_form, #captcha_loading, .error-header__headline";
const EBAY_CHECK_TEXT =
	/Checking your browser before you access eBay|Please verify yourself to continue|made us think you were a bot|Something went wrong on our end/i;

/**
 * Whether eBay showed a check page (a captcha, a browser check or a bot
 * block) instead of results. A results page always has its results list,
 * even with no results, so it never counts.
 */
function isEbayCheckPage(doc) {
	if (doc.querySelector("ul.srp-results")) return false;
	const title = ebayText(doc.querySelector("title"));
	return (
		EBAY_CHECK_TITLES.some((pattern) => pattern.test(title)) ||
		doc.querySelector(EBAY_CHECK_SELECTORS) !== null ||
		EBAY_CHECK_TEXT.test(ebayText(doc.body))
	);
}

// The Sold, Ending soon and Newly listed views of a search, with the same
// parameters as `ebaySoldUrl`, `ebayEndingSoonUrl` and `ebayNewlyListedUrl` in
// src/lib/yugioh/searches.ts (the app's builders; tests/dock-links.test.ts
// holds them to each other). The dock's quick links; the runner never uses them.
const EBAY_QUICK_VIEWS = [
	{
		key: "sold",
		label: "Sold",
		params: { LH_Sold: "1", LH_Complete: "1", _sop: "13" },
		isCurrent: (p) => p.get("LH_Sold") === "1",
	},
	{
		key: "ending-soon",
		label: "Ending soon",
		params: { LH_Auction: "1", _sop: "1" },
		isCurrent: (p) =>
			p.get("LH_Sold") !== "1" &&
			p.get("LH_Auction") === "1" &&
			p.get("_sop") === "1",
	},
	{
		key: "newly-listed",
		label: "Newly listed",
		params: { _sop: "10" },
		isCurrent: (p) =>
			p.get("LH_Sold") !== "1" &&
			p.get("LH_Complete") !== "1" &&
			p.get("LH_Auction") !== "1" &&
			p.get("LH_BIN") !== "1" &&
			p.get("_sop") === "10",
	},
];

/**
 * On an eBay search, the same query (and category) as Sold, Ending soon and
 * Newly listed, in that order, each `{ key, label, href, current }`; `current`
 * marks the view the page already is. Null off a search.
 */
function ebayQuickViews(url) {
	let page;
	try {
		page = new URL(url);
	} catch {
		return null;
	}
	const keywords = page.searchParams.get("_nkw");
	if (!keywords || !page.pathname.startsWith("/sch/")) return null;
	const category = page.searchParams.get("_sacat");
	return EBAY_QUICK_VIEWS.map((view) => {
		const params = new URLSearchParams({ _nkw: keywords, ...view.params });
		if (category && category !== "0") params.set("_sacat", category);
		return {
			key: view.key,
			label: view.label,
			href: `${page.origin}${page.pathname}?${params.toString()}`,
			current: view.isCurrent(page.searchParams),
		};
	});
}

globalThis.readEbayResults = readEbayResults;
globalThis.ebayQuickViews = ebayQuickViews;
globalThis.countEbayResults = countEbayResults;
globalThis.isEbayCheckPage = isEbayCheckPage;

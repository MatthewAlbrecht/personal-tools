// The marketplaces an automated Yu-Gi-Oh run visits, in one place: their
// host, the pages a run opens there, and where their check pages live.
// Loaded by the service worker (importScripts) and, before the content
// scripts, on eBay and TCGplayer pages.

const MARKETPLACES = [
	{
		name: "eBay",
		host: "www.ebay.com",
		// A run's pages: Searches.
		pagePath: "/sch/",
		// eBay's browser check and captcha, where no content script runs.
		checkPath: "/splashui/",
	},
	{
		name: "TCGplayer",
		host: "www.tcgplayer.com",
		// A run's pages: products.
		pagePath: "/product/",
		checkPath: null,
	},
];

/** The marketplace `url` is on (by its host), or null. */
function marketplaceAt(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	return (
		MARKETPLACES.find((marketplace) => marketplace.host === parsed.hostname) ??
		null
	);
}

/** Whether `url` is an https page of the kind a run opens on `marketplace`. */
function isRunPageOf(marketplace, url) {
	if (marketplaceAt(url) !== marketplace) return false;
	const parsed = new URL(url);
	return (
		parsed.protocol === "https:" &&
		parsed.pathname.startsWith(marketplace.pagePath)
	);
}

globalThis.MARKETPLACES = MARKETPLACES;
globalThis.marketplaceAt = marketplaceAt;
globalThis.isRunPageOf = isRunPageOf;

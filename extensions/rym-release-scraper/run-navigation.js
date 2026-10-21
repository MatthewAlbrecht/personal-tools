// Opens an automated run's next page from the marketplace page already in
// the run's tab (ticket 20), on eBay and TCGplayer alike: the service worker
// sends `YUGIOH_NAVIGATE {url}` and this page sets its own `location`. The
// request then carries this page as its referrer and `Sec-Fetch-Site:
// same-origin`, like a move inside the site, not a fresh load from the
// extension. Only a page a run opens on this page's own marketplace
// (`isRunPageOf`, marketplaces.js, loaded first).
// docs/yugioh/references/navigation-and-scrolling.md

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!message || message.type !== "YUGIOH_NAVIGATE") return;
	const here = marketplaceAt(location.href);
	if (!here || !isRunPageOf(here, message.url)) {
		sendResponse({ ok: false });
		return;
	}
	sendResponse({ ok: true });
	location.assign(message.url);
});

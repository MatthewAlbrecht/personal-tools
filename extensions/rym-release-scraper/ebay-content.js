// Reads an eBay search-results page (active or sold) with `readEbayResults`
// (ebay-reader.js) and sends every Listing to the Yu-Gi-Oh tracker through
// the service worker. Runs once on load; the dock's button runs it again.
// On an automated run's visit it scrolls through the results first, and it
// opens the run's next Search from this page (ticket 20).

const EBAY_OBSERVE_MS = 8000;

// Pages keep rendering after the first result shows up: give them a moment
// before reading, so late rows, prices and time-left text are there.
const DATA_SETTLE_MS = 2000;

function settleThen(resolve) {
	window.setTimeout(resolve, DATA_SETTLE_MS);
}

function waitForEbayResults(timeoutMs) {
	return new Promise(function resolveResults(resolve) {
		if (countEbayResults(document) > 0) {
			settleThen(resolve);
			return;
		}
		const observer = new MutationObserver(function check() {
			if (countEbayResults(document) > 0) {
				observer.disconnect();
				settleThen(resolve);
			}
		});
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		window.setTimeout(function onTimeout() {
			observer.disconnect();
			resolve();
		}, timeoutMs);
	});
}

function plural(count, one, many) {
	return `${count} ${count === 1 ? one : many}`;
}

function finishEbayCapture(response, count) {
	const backend = response?.backend;
	if (response?.ok && backend?.synced) {
		const created = typeof backend.created === "number" ? backend.created : 0;
		const updated = typeof backend.updated === "number" ? backend.updated : 0;
		applyDockUpdate({
			status: "ok",
			headline: `Captured ${plural(count, "Listing", "Listings")}`,
			detail: `${created} new, ${updated} seen before.`,
			current: count,
			total: count,
		});
		return;
	}
	if (backend?.skipped) {
		applyDockUpdate({
			status: "warn",
			headline: "Not sent",
			detail: "Set the ingest secret in the extension options.",
		});
		return;
	}
	const detail =
		typeof backend?.error === "string" && backend.error.trim()
			? backend.error.trim()
			: typeof backend?.status === "number"
				? `HTTP ${backend.status}`
				: "Network or permission error";
	applyDockUpdate({
		status: "error",
		headline: "Couldn't send the Listings",
		// The service worker's reasons are whole sentences that say what to do.
		detail: /[.!?]$/.test(detail)
			? detail
			: `${detail}. Run again, or check the extension options.`,
	});
}

// An automated run waits for each page's capture: say there's none coming,
// and why when it's a problem. A check page (`challenged`) stops the run.
function tellNothingToSend(error, challenged = false) {
	chrome.runtime.sendMessage(
		{
			type: "YUGIOH_CAPTURE_EMPTY",
			...(error ? { error } : {}),
			...(challenged ? { challenged } : {}),
		},
		function ignoreResponse() {
			void chrome.runtime.lastError;
		},
	);
}

/** On a run's visit, skims down to about the end of the results list. */
async function scrollThroughEbayResults() {
	const results = document.querySelector("ul.srp-results");
	if (!results || !(await isAutomatedVisit())) return;
	await scrollThroughPage({
		endOf: function endOfResults() {
			return scrollEndOf(window, results);
		},
	});
}

/** Whether `url` is an eBay Search a run may open from this page. */
function isEbaySearchUrl(url) {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === "https:" &&
			parsed.hostname === "www.ebay.com" &&
			parsed.pathname.startsWith("/sch/")
		);
	} catch {
		return false;
	}
}

// A run's next Search, opened by this page itself, so the request carries an
// eBay referrer like a click inside the site, not a fresh load from the
// extension. docs/yugioh/references/navigation-and-scrolling.md
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!message || message.type !== "YUGIOH_NAVIGATE") return;
	if (!isEbaySearchUrl(message.url)) {
		sendResponse({ ok: false });
		return;
	}
	sendResponse({ ok: true });
	location.assign(message.url);
});

async function runEbayCapture({ scroll = false } = {}) {
	applyDockUpdate({
		status: "running",
		headline: "Reading results",
		detail: "Waiting for the results list.",
		current: 0,
		total: 0,
		phase: "read",
	});
	await waitForEbayResults(EBAY_OBSERVE_MS);
	if (scroll) await scrollThroughEbayResults();

	const { listings } = readEbayResults(document, {
		now: Date.now(),
		url: location.href,
	});
	if (listings.length === 0 && isEbayCheckPage(document)) {
		tellNothingToSend("eBay showed a check page instead of results.", true);
		applyDockUpdate({
			status: "warn",
			headline: "eBay is checking for bots",
			detail: "Solve the check on this page, then run again.",
		});
		return;
	}
	// A results page has its results list even with no matches; eBay's error
	// pages don't.
	if (listings.length === 0 && !document.querySelector("ul.srp-results")) {
		tellNothingToSend("eBay showed an error or check page instead of results.");
		applyDockUpdate({
			status: "warn",
			headline: "Not a results page",
			detail: "eBay showed an error or check page. Reload it, then run again.",
		});
		return;
	}
	if (listings.length === 0) {
		tellNothingToSend(null);
		applyDockUpdate({
			status: "warn",
			headline: "No Listings on this page",
			detail: "Wait for the results to load, then run again.",
		});
		return;
	}

	applyDockUpdate({
		status: "running",
		headline: "Sending to the tracker",
		detail: `${plural(listings.length, "Listing", "Listings")} on this page.`,
		current: 0,
		total: listings.length,
		phase: "save",
	});
	chrome.runtime.sendMessage(
		{ type: "YUGIOH_EBAY_CAPTURE", listings },
		function handleResponse(response) {
			void chrome.runtime.lastError;
			finishEbayCapture(response, listings.length);
		},
	);
}

mountScrapeDock({
	pageKind: "ebay",
	onRescrape: function onRescrape() {
		void runEbayCapture();
	},
});

void runEbayCapture({ scroll: true });

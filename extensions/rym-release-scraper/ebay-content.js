// Reads an eBay search-results page (active or sold) with `readEbayResults`
// (ebay-reader.js) and sends every Listing to the Yu-Gi-Oh tracker through
// the service worker. Runs once on load; the dock's button runs it again.

const EBAY_OBSERVE_MS = 8000;

function waitForEbayResults(timeoutMs) {
	return new Promise(function resolveResults(resolve) {
		if (countEbayResults(document) > 0) {
			resolve();
			return;
		}
		const observer = new MutationObserver(function check() {
			if (countEbayResults(document) > 0) {
				observer.disconnect();
				resolve();
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
		detail: `${detail}. Run again, or check the extension options.`,
	});
}

async function runEbayCapture() {
	applyDockUpdate({
		status: "running",
		headline: "Reading results",
		detail: "Waiting for the results list.",
		current: 0,
		total: 0,
		phase: "read",
	});
	await waitForEbayResults(EBAY_OBSERVE_MS);

	const { listings } = readEbayResults(document, {
		now: Date.now(),
		url: location.href,
	});
	if (listings.length === 0) {
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

void runEbayCapture();

// Reads a TCGplayer product page with `readTcgplayerProduct`
// (tcgplayer-reader.js) and sends its Listings and latest sales to the
// Yu-Gi-Oh tracker through the service worker. It opens the latest sales
// window, and loads more sales (signed in) until they reach back past the
// Reference price's 60 days. Runs once on load; the dock's button runs it
// again, which also reads a product reached by in-page navigation. On an
// automated run's visit it scrolls through the page first (ticket 20).

const TCGPLAYER_LISTINGS_WAIT_MS = 15000;
const TCGPLAYER_SALES_WAIT_MS = 8000;
// "Load More Sales" adds 25 a click: at most about 200 sales a capture.
const TCGPLAYER_MAX_SALES_LOADS = 7;
// Matches REFERENCE_WINDOW_DAYS in src/lib/yugioh/deals.ts.
const TCGPLAYER_SALES_WINDOW_DAYS = 60;

// Pages keep rendering after the first result shows up: give them a moment
// before reading, so late rows, prices and time-left text are there.
const DATA_SETTLE_MS = 2000;

function settleThen(resolve) {
	window.setTimeout(resolve, DATA_SETTLE_MS);
}

function waitForTcgplayer(check, timeoutMs) {
	return new Promise(function resolveWait(resolve) {
		if (check()) {
			settleThen(resolve);
			return;
		}
		const observer = new MutationObserver(function onChange() {
			if (check()) {
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

function tcgplayerPlural(count, one, many) {
	return `${count} ${count === 1 ? one : many}`;
}

/** Whether the oldest sale shown is older than the Reference price looks. */
function salesReachPastWindow() {
	const product = readTcgplayerProduct(document, { url: location.href });
	const oldest = product?.sales.at(-1)?.soldDate;
	if (!oldest) return false;
	const cutoff = new Date(
		Date.now() - TCGPLAYER_SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	)
		.toISOString()
		.slice(0, 10);
	return oldest < cutoff;
}

async function openLatestSales() {
	if (tcgplayerSaleRows(document).length === 0) {
		const opener = tcgplayerLatestSalesOpener(document);
		if (!opener) return;
		opener.click();
		await waitForTcgplayer(function salesShown() {
			return tcgplayerSaleRows(document).length > 0;
		}, TCGPLAYER_SALES_WAIT_MS);
	}
	for (let load = 0; load < TCGPLAYER_MAX_SALES_LOADS; load++) {
		const more = tcgplayerLoadMoreSales(document);
		if (!more || salesReachPastWindow()) return;
		const before = tcgplayerSaleRows(document).length;
		applyDockUpdate({
			status: "running",
			headline: "Reading latest sales",
			detail: `${tcgplayerPlural(before, "sale", "sales")} so far.`,
		});
		more.click();
		await waitForTcgplayer(function moreShown() {
			return tcgplayerSaleRows(document).length > before;
		}, TCGPLAYER_SALES_WAIT_MS);
		if (tcgplayerSaleRows(document).length === before) return;
	}
}

function finishTcgplayerCapture(response, product) {
	const backend = response?.backend;
	if (response?.ok && backend?.synced) {
		const printing = backend.printing;
		if (!printing) {
			// The tracker says why: no Printing in a Deck, or which ones it
			// could be. Older apps don't, so fall back to the plain fact.
			const reason =
				typeof backend.reason === "string" && backend.reason.trim()
					? backend.reason.trim()
					: null;
			applyDockUpdate(
				reason
					? { status: "warn", headline: "Not captured", detail: reason }
					: {
							status: "warn",
							headline: "Not one of your Printings",
							detail: "No Printing in the tracker is linked to this page.",
						},
			);
			return;
		}
		if (typeof backend.listingsUrl === "string") {
			setDockLinks([
				{ label: "Go to Listings", href: backend.listingsUrl, newTab: true },
			]);
		}
		const created = typeof backend.created === "number" ? backend.created : 0;
		const updated = typeof backend.updated === "number" ? backend.updated : 0;
		const total = product.listings.length + product.sales.length;
		applyDockUpdate({
			status: "ok",
			headline: `Captured ${tcgplayerPlural(product.listings.length, "Listing", "Listings")} and ${tcgplayerPlural(product.sales.length, "sale", "sales")}`,
			detail: `${backend.linked ? "Linked this page to " : ""}${printing.cardName} ${printing.setCode} · ${created} new, ${updated} seen before.`,
			current: total,
			total,
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
		headline: "Couldn't send the page",
		// The service worker's reasons are whole sentences that say what to do.
		detail: /[.!?]$/.test(detail)
			? detail
			: `${detail}. Run again, or check the extension options.`,
	});
}

// An automated run waits for each page's capture: say there's none coming,
// and why when it's a problem. A check page (`challenged`) stops the run.
function tellTcgplayerNothingToSend(error, challenged = false) {
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

/** On a run's visit, skims down to about the end of the product page. */
async function scrollThroughProductPage() {
	if (!(await isAutomatedVisit())) return;
	await scrollThroughPage({
		endOf: function endOfPage() {
			return document.documentElement.scrollHeight - window.innerHeight;
		},
	});
}

async function runTcgplayerCapture({ scroll = false } = {}) {
	applyDockUpdate({
		status: "running",
		headline: "Reading Listings",
		detail: "Waiting for the Listings to load.",
		current: 0,
		total: 0,
		phase: "read",
	});
	await waitForTcgplayer(function listingsShown() {
		return (
			countTcgplayerListings(document) > 0 || tcgplayerHasNoListings(document)
		);
	}, TCGPLAYER_LISTINGS_WAIT_MS);
	if (isTcgplayerCheckPage(document)) {
		tellTcgplayerNothingToSend(
			"TCGplayer showed a check page instead of the product.",
			true,
		);
		applyDockUpdate({
			status: "warn",
			headline: "TCGplayer is checking for bots",
			detail: "Solve the check on this page, then run again.",
		});
		return;
	}
	if (scroll) await scrollThroughProductPage();
	await openLatestSales();

	const product = readTcgplayerProduct(document, { url: location.href });
	if (!product) {
		tellTcgplayerNothingToSend("Not a TCGplayer product page.");
		applyDockUpdate({
			status: "warn",
			headline: "Not a product page",
			detail: "Open a Printing's TCGplayer product page, then run again.",
		});
		return;
	}
	if (product.listings.length === 0 && product.sales.length === 0) {
		tellTcgplayerNothingToSend(null);
		applyDockUpdate({
			status: "warn",
			headline: "Nothing to capture yet",
			detail: "Wait for the Listings to load, then run again.",
		});
		return;
	}

	const total = product.listings.length + product.sales.length;
	applyDockUpdate({
		status: "running",
		headline: "Sending to the tracker",
		detail: `${tcgplayerPlural(product.listings.length, "Listing", "Listings")} and ${tcgplayerPlural(product.sales.length, "sale", "sales")} on this page.`,
		current: 0,
		total,
		phase: "save",
	});
	chrome.runtime.sendMessage(
		{ type: "YUGIOH_TCGPLAYER_CAPTURE", product },
		function handleResponse(response) {
			void chrome.runtime.lastError;
			finishTcgplayerCapture(response, product);
		},
	);
}

mountScrapeDock({
	pageKind: "tcgplayer",
	onRescrape: function onRescrape() {
		void runTcgplayerCapture();
	},
});

void runTcgplayerCapture({ scroll: true });

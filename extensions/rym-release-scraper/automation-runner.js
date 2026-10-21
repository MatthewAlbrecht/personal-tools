// Automated browser runs for the Yu-Gi-Oh tracker (docs/yugioh/automation.md).
// The service worker of the automation Chrome profile claims a run the
// script asked for, visits every page in its plan one at a time, reports each
// page, then finishes the run. No chrome APIs here: the service worker passes
// them in, so Vitest can drive a run with fakes.

// Varied pacing (ticket 19): 20–60 s between page loads, and about 1 pause
// in 6 a longer 1½–3 minutes, so a run has no fixed rhythm.
const MIN_PAUSE_MS = 20_000;
const MAX_PAUSE_MS = 60_000;
const LONG_PAUSE_CHANCE = 1 / 6;
const MIN_LONG_PAUSE_MS = 90_000;
const MAX_LONG_PAUSE_MS = 180_000;

/**
 * Runs the oldest run asked for, or returns null when there's none.
 *
 * - `call(body)` posts one step to the app (`/api/yugioh/automation`) and
 *   resolves with its JSON.
 * - `visitPage(visit)` opens the page, waits for its capture and closes it,
 *   resolving with `{ listingsCaptured, newListings, error }` (eBay pages
 *   add `auctionsWithoutEndTime`; a check page adds `challenged: true`).
 * - `pause(ms)` waits; `random()` is Math.random.
 *
 * The plan's Search pages, and its TCGplayer pages, are shuffled
 * (`shuffleVisits`); the pages of auctions about to end stay first. Pauses
 * vary (`pauseLength`).
 *
 * A check page (a captcha or bot challenge) ends the run at once: it's
 * reported, and no further page is visited. The app ends the run on that
 * report; an app from before check pages is told with a finish.
 */
async function runAutomatedRun({ call, visitPage, pause, random }) {
	const { run } = await call({ op: "claim" });
	if (!run) return null;

	let pagesVisited = 0;
	try {
		for (const [index, visit] of shuffleVisits(run.visits, random).entries()) {
			if (index > 0) await pause(pauseLength(random));
			let outcome;
			try {
				outcome = await visitPage(visit);
			} catch (error) {
				outcome = {
					listingsCaptured: 0,
					newListings: 0,
					error: messageOf(error),
				};
			}
			pagesVisited += 1;
			const { running } = await call({
				op: "visit",
				runId: run.runId,
				visit: { ...visit, ...outcome },
			});
			if (outcome.challenged) {
				if (running) {
					await call({
						op: "finish",
						runId: run.runId,
						error: `Stopped on a check page: ${outcome.error}`,
					});
				}
				return { runId: run.runId, pagesVisited, stoppedOnCheckPage: true };
			}
			// The script gave up on the run (it timed out): stop visiting.
			if (!running) return { runId: run.runId, pagesVisited };
		}
	} catch (error) {
		// Try to end the run with the reason; the script's timeout is the backstop.
		await call({
			op: "finish",
			runId: run.runId,
			error: `Stopped after ${pagesVisited} pages: ${messageOf(error)}`,
		}).catch(function ignore() {});
		throw error;
	}

	await call({ op: "finish", runId: run.runId, error: null });
	return { runId: run.runId, pagesVisited };
}

/**
 * The plan in visiting order: the pages of auctions about to end first, as
 * planned (soonest ending first), then the Search pages shuffled, then the
 * TCGplayer pages shuffled.
 */
function shuffleVisits(visits, random) {
	const endingSoon = visits.filter((visit) => visit.kind === "ebayEndingSoon");
	const searches = visits.filter(
		(visit) => visit.kind !== "ebayEndingSoon" && visit.kind !== "tcgplayer",
	);
	const products = visits.filter((visit) => visit.kind === "tcgplayer");
	return [
		...endingSoon,
		...shuffled(searches, random),
		...shuffled(products, random),
	];
}

/** A Fisher–Yates shuffle of a copy of `items`. */
function shuffled(items, random) {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

/**
 * How long to wait before the next page: 20–60 s, or about 1 time in 6 a
 * longer 1½–3 minutes. Two draws: which kind, then how long.
 */
function pauseLength(random) {
	const long = random() < LONG_PAUSE_CHANCE;
	const [min, max] = long
		? [MIN_LONG_PAUSE_MS, MAX_LONG_PAUSE_MS]
		: [MIN_PAUSE_MS, MAX_PAUSE_MS];
	return Math.round(min + random() * (max - min));
}

function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}

/**
 * What one page's capture counts as in a run, from the service worker's
 * reply to the content script (`{ ok, backend }`), or `{ ok, empty: true,
 * error? }` when the page had nothing to send (a Search with no results).
 */
function visitOutcome(response) {
	const nothing = { listingsCaptured: 0, newListings: 0 };
	if (response?.empty) {
		return {
			...nothing,
			error: typeof response.error === "string" ? response.error : null,
			...(response.challenged === true ? { challenged: true } : {}),
		};
	}
	const backend = response?.backend;
	if (!response?.ok || !backend) {
		return { ...nothing, error: "The extension couldn't handle the page." };
	}
	if (backend.skipped) {
		return {
			...nothing,
			error: "Couldn't send the page: the ingest secret isn't set.",
		};
	}
	if (!backend.synced) {
		const reason =
			typeof backend.error === "string" && backend.error.trim()
				? backend.error.trim()
				: typeof backend.status === "number"
					? `HTTP ${backend.status}`
					: "network error";
		const sentence = /[.!?]$/.test(reason) ? reason : `${reason}.`;
		return { ...nothing, error: `Couldn't send the page: ${sentence}` };
	}
	const newListings = typeof backend.created === "number" ? backend.created : 0;
	if ("printing" in backend) {
		if (!backend.printing) {
			const reason =
				typeof backend.reason === "string" && backend.reason.trim()
					? backend.reason.trim()
					: "Not one of your Printings.";
			return { ...nothing, error: reason };
		}
		return {
			listingsCaptured: (backend.listings ?? 0) + (backend.sales ?? 0),
			newListings,
			error: null,
		};
	}
	return {
		listingsCaptured:
			typeof backend.captured === "number" ? backend.captured : 0,
		newListings,
		auctionsWithoutEndTime:
			typeof backend.auctionsWithoutEndTime === "number"
				? backend.auctionsWithoutEndTime
				: 0,
		error: null,
	};
}

/**
 * The marketplace whose check page a tab is on, from its URL alone: eBay
 * sends its browser check and captcha to /splashui/* (where no content
 * script runs), with the page asked for in `ru`. Null for any other page.
 * Hosts and paths are in `MARKETPLACES` (marketplaces.js).
 * docs/yugioh/references/marketplace-check-pages.md
 */
function checkPageAt(url) {
	if (typeof url !== "string") return null;
	const marketplace = marketplaceAt(url);
	if (!marketplace?.checkPath) return null;
	return new URL(url).pathname.startsWith(marketplace.checkPath)
		? marketplace.name
		: null;
}

/**
 * How a run opens its pages (ticket 20): one tab per marketplace, reused for
 * the whole run, and exactly one page load per visit.
 *
 * - A marketplace's first page opens a new tab (`createTab(url)` → tab ID).
 * - Each next page (an eBay Search, a TCGplayer product) is opened from the
 *   marketplace's page already in the tab (`navigateFromPage(tabId, url)`:
 *   the content script sets `location`), so the request carries that
 *   marketplace's referrer, like a move inside the site.
 *   docs/yugioh/references/navigation-and-scrolling.md
 * - When the page can't (no content script answered), the tab loads the URL
 *   directly (`updateTab(tabId, url)`).
 * - Both resolve false when the tab is gone; a new tab is opened instead.
 *
 * `ready(tabId)` is called before the page is asked for in a known tab (and
 * right after a new tab opens), so the caller can wait on that tab first.
 * Resolves with the visit's tab ID.
 */
function makeVisitTabs({ createTab, updateTab, navigateFromPage }) {
	const tabs = new Map();
	return async function openVisit(visit, ready) {
		const site = siteOf(visit.url);
		const known = tabs.get(site);
		if (known !== undefined) {
			ready(known);
			if (await navigateFromPage(known, visit.url)) return known;
			if (await updateTab(known, visit.url)) return known;
		}
		const tabId = await createTab(visit.url);
		tabs.set(site, tabId);
		ready(tabId);
		return tabId;
	};
}

function siteOf(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

globalThis.makeVisitTabs = makeVisitTabs;
globalThis.runAutomatedRun = runAutomatedRun;
globalThis.checkPageAt = checkPageAt;
globalThis.visitOutcome = visitOutcome;

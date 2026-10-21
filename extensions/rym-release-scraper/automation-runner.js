// Automated browser runs for the Yu-Gi-Oh tracker (docs/yugioh/automation.md).
// The service worker of the automation Chrome profile claims a run the
// script asked for, visits every page in its plan one at a time, reports each
// page, then finishes the run. No chrome APIs here: the service worker passes
// them in, so Vitest can drive a run with fakes.

// Modest pacing: a human-like 15–30 s between page loads.
const MIN_PAUSE_MS = 15_000;
const MAX_PAUSE_MS = 30_000;

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
 * A check page (a captcha or bot challenge) ends the run at once: it's
 * reported, and no further page is visited. The app ends the run on that
 * report; an app from before check pages is told with a finish.
 */
async function runAutomatedRun({ call, visitPage, pause, random }) {
	const { run } = await call({ op: "claim" });
	if (!run) return null;

	let pagesVisited = 0;
	try {
		for (const [index, visit] of run.visits.entries()) {
			if (index > 0) {
				await pause(MIN_PAUSE_MS + random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
			}
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
 * docs/yugioh/references/marketplace-check-pages.md
 */
function checkPageAt(url) {
	if (typeof url !== "string") return null;
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (
		parsed.hostname === "www.ebay.com" &&
		parsed.pathname.startsWith("/splashui/")
	) {
		return "eBay";
	}
	return null;
}

globalThis.runAutomatedRun = runAutomatedRun;
globalThis.checkPageAt = checkPageAt;
globalThis.visitOutcome = visitOutcome;
globalThis.MIN_PAUSE_MS = MIN_PAUSE_MS;
globalThis.MAX_PAUSE_MS = MAX_PAUSE_MS;

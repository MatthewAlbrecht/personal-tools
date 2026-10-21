// Scrolls a results page before its content script reads it, during an
// automated run (ticket 20): down in uneven steps with short pauses, to about
// the end of the results, the way a person skims a page. It also gives rows
// and images that load late a chance to show.
//
// Scrolling is the one thing an extension does here that the browser treats
// as real: the page's `scroll` events come from the browser itself. No mouse
// movement is faked. docs/yugioh/references/navigation-and-scrolling.md

const SCROLL_MIN_STEP = 0.45; // of the window's height
const SCROLL_STEP_RANGE = 0.6;
const SCROLL_MIN_PAUSE_MS = 350;
const SCROLL_PAUSE_RANGE_MS = 1150;
// Close enough to the end: less than this share of a screen left.
const SCROLL_NEAR_END = 0.15;
const SCROLL_MAX_STEPS = 30;

/**
 * Scrolls `view` (the window) down until `endOf()` (the scroll position at
 * which the results end; measured again after each step, as late rows grow
 * the page) is about reached. One draw sizes each step (45–105% of a
 * screen), one each pause after it (0.35–1.5 s). Resolves with the number of
 * steps; at most 30. `random` and `wait` default to Math.random and a
 * window timer; tests pass their own.
 */
async function scrollThroughPage({
	view = window,
	endOf,
	random = Math.random,
	wait = waitFor,
}) {
	let steps = 0;
	while (steps < SCROLL_MAX_STEPS) {
		const left = endOf() - view.scrollY;
		if (left <= view.innerHeight * SCROLL_NEAR_END) break;
		const step = Math.round(
			view.innerHeight * (SCROLL_MIN_STEP + random() * SCROLL_STEP_RANGE),
		);
		view.scrollBy({ top: Math.min(step, left), behavior: "smooth" });
		steps += 1;
		await wait(
			Math.round(SCROLL_MIN_PAUSE_MS + random() * SCROLL_PAUSE_RANGE_MS),
		);
	}
	return steps;
}

function waitFor(ms) {
	return new Promise(function later(resolve) {
		window.setTimeout(resolve, ms);
	});
}

/** The scroll position at which `element`'s bottom meets the window's. */
function scrollEndOf(view, element) {
	return (
		element.getBoundingClientRect().bottom + view.scrollY - view.innerHeight
	);
}

/**
 * Asks the service worker whether this tab is on a run's visit; resolves
 * false when nothing answers (no run, or an older service worker).
 */
function isAutomatedVisit() {
	return new Promise(function ask(resolve) {
		chrome.runtime.sendMessage(
			{ type: "YUGIOH_AUTOMATED_VISIT" },
			function answer(response) {
				void chrome.runtime.lastError;
				resolve(response?.automated === true);
			},
		);
	});
}

globalThis.scrollThroughPage = scrollThroughPage;
globalThis.scrollEndOf = scrollEndOf;
globalThis.isAutomatedVisit = isAutomatedVisit;

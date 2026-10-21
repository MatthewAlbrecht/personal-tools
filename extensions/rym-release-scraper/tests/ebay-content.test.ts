// @vitest-environment node
// The content script's wiring: on a saved sold page it reads every result
// and sends them to the service worker, then reports the count in the dock.
// chrome, the dock and the page globals are stubbed; the reader is real.

import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, test, vi } from "vitest";
import "../ebay-reader.js";

type Message = { type: string; listings: Array<{ sold: boolean }> };

test("a sold page is read and sent, and the dock shows the count", async () => {
	const html = readFileSync(
		new URL("./fixtures/ebay-sold.html", import.meta.url),
		"utf8",
	);
	const { document, window } = parseHTML(html);
	const sent: Message[] = [];
	const dock: Array<{ status?: string; headline?: string }> = [];

	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", {
		href: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_Sold=1&LH_Complete=1&_sop=13",
	});
	vi.stubGlobal("mountScrapeDock", () => {});
	vi.stubGlobal("isAutomatedVisit", async () => false);
	vi.stubGlobal("applyDockUpdate", (patch: (typeof dock)[number]) => {
		dock.push(patch);
	});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			onMessage: { addListener() {} },
			sendMessage(message: Message, reply: (response: unknown) => void) {
				sent.push(message);
				reply({
					ok: true,
					backend: { synced: true, created: 3, updated: 1 },
				});
			},
		},
	});

	await import("../ebay-content.js");
	// The content script lets the page settle for 2s before reading.
	await vi.waitFor(() => expect(dock.at(-1)?.status).toBe("ok"), {
		timeout: 5000,
	});

	expect(sent).toHaveLength(1);
	expect(sent[0]?.type).toBe("YUGIOH_EBAY_CAPTURE");
	expect(sent[0]?.listings).toHaveLength(4);
	expect(sent[0]?.listings.every((l) => l.sold)).toBe(true);
	expect(dock.at(-1)?.headline).toBe("Captured 4 Listings");

	vi.unstubAllGlobals();
});

test("a Search with no results tells the service worker there was nothing to send", async () => {
	vi.useFakeTimers();
	const { document, window } = parseHTML(
		"<html><body><ul class='srp-results'></ul></body></html>",
	);
	const sent: Array<{ type: string }> = [];
	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", {
		href: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN999&_sop=10",
	});
	vi.stubGlobal("mountScrapeDock", () => {});
	vi.stubGlobal("isAutomatedVisit", async () => false);
	vi.stubGlobal("applyDockUpdate", () => {});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			onMessage: { addListener() {} },
			sendMessage(message: { type: string }) {
				sent.push(message);
			},
		},
	});

	vi.resetModules();
	await import("../ebay-content.js");
	await vi.advanceTimersByTimeAsync(10_000);

	expect(sent).toEqual([{ type: "YUGIOH_CAPTURE_EMPTY" }]);

	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test("an eBay error page instead of results is reported as an error, not as an empty Search", async () => {
	vi.useFakeTimers();
	const { document, window } = parseHTML(
		"<html><head><title>eBay</title></head><body><p>This page is missing.</p></body></html>",
	);
	const sent: Array<{ type: string; error?: string }> = [];
	const dock: Array<{ status?: string; headline?: string }> = [];
	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", {
		href: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10",
	});
	vi.stubGlobal("mountScrapeDock", () => {});
	vi.stubGlobal("isAutomatedVisit", async () => false);
	vi.stubGlobal("applyDockUpdate", (patch: (typeof dock)[number]) => {
		dock.push(patch);
	});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			onMessage: { addListener() {} },
			sendMessage(message: { type: string; error?: string }) {
				sent.push(message);
			},
		},
	});

	vi.resetModules();
	await import("../ebay-content.js");
	await vi.advanceTimersByTimeAsync(10_000);

	expect(sent).toEqual([
		{
			type: "YUGIOH_CAPTURE_EMPTY",
			error: "eBay showed an error or check page instead of results.",
		},
	]);
	expect(dock.at(-1)).toMatchObject({
		status: "warn",
		headline: "Not a results page",
	});

	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test("a check page instead of results is reported as challenged, so the run stops", async () => {
	vi.useFakeTimers();
	const html = readFileSync(
		new URL("./fixtures/ebay-check-blocked.html", import.meta.url),
		"utf8",
	);
	const { document, window } = parseHTML(html);
	const sent: Array<Record<string, unknown>> = [];
	const dock: Array<{ status?: string; headline?: string }> = [];
	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", {
		href: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10",
	});
	vi.stubGlobal("mountScrapeDock", () => {});
	vi.stubGlobal("isAutomatedVisit", async () => false);
	vi.stubGlobal("applyDockUpdate", (patch: (typeof dock)[number]) => {
		dock.push(patch);
	});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			onMessage: { addListener() {} },
			sendMessage(message: Record<string, unknown>) {
				sent.push(message);
			},
		},
	});

	vi.resetModules();
	await import("../ebay-content.js");
	await vi.advanceTimersByTimeAsync(10_000);

	expect(sent).toEqual([
		{
			type: "YUGIOH_CAPTURE_EMPTY",
			error: "eBay showed a check page instead of results.",
			challenged: true,
		},
	]);
	expect(dock.at(-1)).toMatchObject({
		status: "warn",
		headline: "eBay is checking for bots",
	});

	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/**
 * Loads the content script on the saved sold page, with the real scroll
 * helper. `automated` is the service worker's answer to "is this tab on a
 * run's visit?". Logs scrolls, messages sent and page navigations in order.
 */
async function loadSoldPage({ automated }: { automated: boolean }) {
	vi.useFakeTimers();
	// Every draw 0.5: steps of 750px.
	vi.spyOn(Math, "random").mockReturnValue(0.5);
	const html = readFileSync(
		new URL("./fixtures/ebay-sold.html", import.meta.url),
		"utf8",
	);
	const { document, window } = parseHTML(html);
	const events: string[] = [];
	const listeners: Array<
		(
			message: Record<string, unknown>,
			sender: unknown,
			reply: (response: unknown) => void,
		) => unknown
	> = [];
	const view = Object.assign(window, {
		scrollY: 0,
		innerHeight: 1000,
		scrollBy({ top }: { top: number }) {
			view.scrollY += top;
			events.push(`scroll to ${view.scrollY}`);
		},
	});
	const results = document.querySelector("ul.srp-results");
	if (!results) throw new Error("The fixture has no results list.");
	// The results list ends 2000px down the page.
	results.getBoundingClientRect = () =>
		({ bottom: 3000 - view.scrollY }) as DOMRect;
	vi.stubGlobal("document", document);
	vi.stubGlobal("window", view);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", {
		href: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_Sold=1&LH_Complete=1&_sop=13",
		assign(url: string) {
			events.push(`go to ${url}`);
		},
	});
	vi.stubGlobal("mountScrapeDock", () => {});
	vi.stubGlobal("applyDockUpdate", () => {});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			onMessage: {
				addListener(listener: (typeof listeners)[number]) {
					listeners.push(listener);
				},
			},
			sendMessage(
				message: { type: string },
				reply?: (response: unknown) => void,
			) {
				if (message.type === "YUGIOH_AUTOMATED_VISIT") {
					reply?.({ automated });
					return;
				}
				events.push(`send ${message.type}`);
			},
		},
	});

	vi.resetModules();
	await import("../marketplaces.js");
	await import("../run-navigation.js");
	await import("../page-scroll.js");
	await import("../ebay-content.js");
	await vi.advanceTimersByTimeAsync(60_000);

	/** Sends the content script a message as the service worker would. */
	function message(body: Record<string, unknown>): unknown {
		let answer: unknown;
		for (const listener of listeners) {
			listener(body, {}, (response) => {
				answer = response;
			});
		}
		return answer;
	}
	return { events, message };
}

describe("on a run's visit", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("the results are scrolled through, to about their end, before they're read", async () => {
		const { events } = await loadSoldPage({ automated: true });

		expect(events).toEqual([
			"scroll to 750",
			"scroll to 1500",
			"scroll to 2000",
			"send YUGIOH_EBAY_CAPTURE",
		]);
	});

	test("outside a run the page isn't scrolled", async () => {
		const { events } = await loadSoldPage({ automated: false });

		expect(events).toEqual(["send YUGIOH_EBAY_CAPTURE"]);
	});

	test("the next Search is opened from this page, so eBay sees its own page as the referrer", async () => {
		const { events, message } = await loadSoldPage({ automated: true });
		const next = "https://www.ebay.com/sch/i.html?_nkw=RA01-EN009&_sop=10";

		expect(message({ type: "YUGIOH_NAVIGATE", url: next })).toEqual({
			ok: true,
		});
		expect(events.at(-1)).toBe(`go to ${next}`);
	});

	test("the page only opens eBay Searches", async () => {
		const { events, message } = await loadSoldPage({ automated: true });

		for (const url of [
			"https://www.tcgplayer.com/product/524817/x",
			"https://www.ebay.com/itm/123",
			"not a url",
		]) {
			expect(message({ type: "YUGIOH_NAVIGATE", url })).toEqual({
				ok: false,
			});
		}
		expect(events.filter((e) => e.startsWith("go to"))).toEqual([]);
	});
});

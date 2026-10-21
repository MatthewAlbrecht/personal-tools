// @vitest-environment node
// The content script's wiring: on a saved sold page it reads every result
// and sends them to the service worker, then reports the count in the dock.
// chrome, the dock and the page globals are stubbed; the reader is real.

import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { expect, test, vi } from "vitest";
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
	vi.stubGlobal("applyDockUpdate", (patch: (typeof dock)[number]) => {
		dock.push(patch);
	});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
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
	await vi.waitFor(() => expect(dock.at(-1)?.status).toBe("ok"));

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
	vi.stubGlobal("applyDockUpdate", () => {});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
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
		"<html><head><title>Error Page | eBay</title></head><body><h1>SORRY</h1><p>Something went wrong on our end</p></body></html>",
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
	vi.stubGlobal("applyDockUpdate", (patch: (typeof dock)[number]) => {
		dock.push(patch);
	});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
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

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

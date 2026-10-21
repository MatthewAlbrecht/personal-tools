// @vitest-environment node
// The TCGplayer content script's wiring: on a saved product page with its
// latest sales open, it reads the page, sends it to the service worker, and
// reports what the tracker did with it in the dock. chrome, the dock and the
// page globals are stubbed; the reader is real.

import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import "../tcgplayer-reader.js";

type Message = {
	type: string;
	product: { productId: number; listings: unknown[]; sales: unknown[] };
};
type DockUpdate = { status?: string; headline?: string; detail?: string };

const ASH_URL =
	"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare?Language=English";

async function runOnSavedPage(backend: unknown): Promise<{
	sent: Message[];
	dock: DockUpdate[];
}> {
	const html = readFileSync(
		new URL("./fixtures/tcgplayer-latest-sales.html", import.meta.url),
		"utf8",
	);
	const { document, window } = parseHTML(html);
	const sent: Message[] = [];
	const dock: DockUpdate[] = [];

	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", { href: ASH_URL });
	vi.stubGlobal("mountScrapeDock", () => {});
	vi.stubGlobal("applyDockUpdate", (patch: DockUpdate) => {
		dock.push(patch);
	});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			sendMessage(message: Message, reply: (response: unknown) => void) {
				sent.push(message);
				reply({ ok: true, backend });
			},
		},
	});

	vi.resetModules();
	await import("../tcgplayer-content.js");
	// The content script lets the page settle for 2s before reading.
	await vi.waitFor(
		() => expect(["ok", "warn", "error"]).toContain(dock.at(-1)?.status),
		{ timeout: 5000 },
	);
	return { sent, dock };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

test("a product page is read and sent, and the dock says what the tracker kept", async () => {
	const { sent, dock } = await runOnSavedPage({
		synced: true,
		printing: {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
		},
		listings: 10,
		sales: 5,
		created: 12,
		updated: 3,
	});

	expect(sent).toHaveLength(1);
	expect(sent[0]?.type).toBe("YUGIOH_TCGPLAYER_CAPTURE");
	expect(sent[0]?.product.productId).toBe(524817);
	expect(sent[0]?.product.listings).toHaveLength(10);
	expect(sent[0]?.product.sales).toHaveLength(5);
	expect(dock.at(-1)).toMatchObject({
		status: "ok",
		headline: "Captured 10 Listings and 5 sales",
		detail: "Ash Blossom & Joyous Spring RA01-EN008 · 12 new, 3 seen before.",
	});
});

test("a product that isn't one of my Printings says so", async () => {
	const { dock } = await runOnSavedPage({
		synced: true,
		printing: null,
		listings: 10,
		sales: 5,
		created: 0,
		updated: 0,
	});

	expect(dock.at(-1)).toMatchObject({
		status: "warn",
		headline: "Not one of your Printings",
	});
});

test("a product the tracker couldn't place shows its reason, naming the card", async () => {
	const reason =
		"Ash Blossom & Joyous Spring RA01-EN008 Quarter Century Secret Rare isn't in a Deck yet. Add it in the tracker first.";
	const { sent, dock } = await runOnSavedPage({
		synced: true,
		printing: null,
		linked: false,
		reason,
		listings: 10,
		sales: 5,
		created: 0,
		updated: 0,
	});

	expect(sent[0]?.product).toMatchObject({
		details: {
			productName: "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
		},
	});
	expect(dock.at(-1)).toEqual({
		status: "warn",
		headline: "Not captured",
		detail: reason,
	});
});

test("a page the tracker linked to its Printing says so", async () => {
	const { dock } = await runOnSavedPage({
		synced: true,
		printing: {
			cardName: "Ash Blossom & Joyous Spring",
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
		},
		linked: true,
		reason: null,
		listings: 10,
		sales: 5,
		created: 15,
		updated: 0,
	});

	expect(dock.at(-1)).toMatchObject({
		status: "ok",
		headline: "Captured 10 Listings and 5 sales",
		detail:
			"Linked this page to Ash Blossom & Joyous Spring RA01-EN008 · 15 new, 0 seen before.",
	});
});

test("a product page with nothing on it tells the service worker there was nothing to send", async () => {
	vi.useFakeTimers();
	const { document, window } = parseHTML("<html><body></body></html>");
	const sent: Array<{ type: string }> = [];
	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", { href: ASH_URL });
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
	await import("../tcgplayer-content.js");
	await vi.advanceTimersByTimeAsync(30_000);

	expect(sent).toHaveLength(1);
	expect(sent[0]?.type).toBe("YUGIOH_CAPTURE_EMPTY");

	vi.useRealTimers();
});

test("a capture the app refused shows the service worker's short reason as it is", async () => {
	const reason =
		"The app at www.moooose.dev doesn't have this capture yet (404). Deploy it, or point the extension at http://localhost:1333 in its options.";
	const { dock } = await runOnSavedPage({
		synced: false,
		skipped: false,
		status: 404,
		error: reason,
	});

	expect(dock.at(-1)).toMatchObject({
		status: "error",
		headline: "Couldn't send the page",
		detail: reason,
	});
});

test("a check page instead of the product is reported as challenged, so the run stops", async () => {
	vi.useFakeTimers();
	const html = readFileSync(
		new URL("./fixtures/tcgplayer-check-cloudflare.html", import.meta.url),
		"utf8",
	);
	const { document, window } = parseHTML(html);
	const sent: Array<Record<string, unknown>> = [];
	const dock: DockUpdate[] = [];
	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", { href: ASH_URL });
	vi.stubGlobal("mountScrapeDock", () => {});
	vi.stubGlobal("applyDockUpdate", (patch: DockUpdate) => {
		dock.push(patch);
	});
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			sendMessage(message: Record<string, unknown>) {
				sent.push(message);
			},
		},
	});

	vi.resetModules();
	await import("../tcgplayer-content.js");
	await vi.advanceTimersByTimeAsync(30_000);

	expect(sent).toEqual([
		{
			type: "YUGIOH_CAPTURE_EMPTY",
			error: "TCGplayer showed a check page instead of the product.",
			challenged: true,
		},
	]);
	expect(dock.at(-1)).toMatchObject({
		status: "warn",
		headline: "TCGplayer is checking for bots",
	});

	vi.useRealTimers();
});

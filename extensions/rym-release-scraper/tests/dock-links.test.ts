// @vitest-environment node
// The dock's links: "Go to Listings" opens the tracker's Listings for what the
// page fed (in a new tab), once a capture says which Deck; on an eBay Search
// that's a Sold or Newly Listed page, a link switches to the other one in
// place. The dock, readers, content scripts and service worker are real;
// chrome, fetch and the page are stubbed.

import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	ebayEndingSoonUrl,
	ebayNewlyListedUrl,
	ebaySoldUrl,
} from "../../../src/lib/yugioh/searches";
import "../ebay-reader.js";

declare function otherEbayView(
	url: string,
): { href: string; label: string } | null;

const KEYWORDS = "(RA01-EN008,RA01-EN024) -super -ultra";

describe("the other view of an eBay Search", () => {
	test("a Sold page switches to the same Search, newly listed", () => {
		expect(otherEbayView(ebaySoldUrl(KEYWORDS))).toEqual({
			href: ebayNewlyListedUrl(KEYWORDS),
			label: "Go to newly listed",
		});
	});

	test("a Newly Listed page switches to the same Search, sold", () => {
		expect(otherEbayView(ebayNewlyListedUrl(KEYWORDS))).toEqual({
			href: ebaySoldUrl(KEYWORDS),
			label: "Go to sold listings",
		});
	});

	test("a later page of results switches to the first page of the other view", () => {
		expect(otherEbayView(`${ebaySoldUrl(KEYWORDS)}&_pgn=2`)?.href).toBe(
			ebayNewlyListedUrl(KEYWORDS),
		);
	});

	test("other eBay pages have no switch", () => {
		for (const url of [
			ebayEndingSoonUrl(KEYWORDS),
			"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008",
			"https://www.ebay.com/sch/i.html?_sop=10",
			"not a url",
		]) {
			expect(otherEbayView(url)).toBeNull();
		}
	});
});

type Link = { text: string; href: string | null; target: string | null };

/** The dock's links, as shown. */
function dockLinks(document: Document): Link[] {
	const host = document.getElementById("rym-scrape-dock");
	return [...(host?.shadowRoot?.querySelectorAll("a") ?? [])].map((a) => ({
		text: a.textContent?.trim() ?? "",
		href: a.getAttribute("href"),
		target: a.getAttribute("target"),
	}));
}

/**
 * Loads the real dock and a content script on a saved page at `url`; the
 * service worker answers its capture with `backend`.
 */
async function loadPage({
	fixture,
	url,
	scripts,
	backend,
}: {
	fixture: string;
	url: string;
	scripts: "ebay" | "tcgplayer";
	backend: Record<string, unknown>;
}): Promise<{ document: Document; sent: Array<Record<string, unknown>> }> {
	vi.useFakeTimers();
	const html = readFileSync(
		new URL(`./fixtures/${fixture}`, import.meta.url),
		"utf8",
	);
	const { document, window } = parseHTML(html);
	const sent: Array<Record<string, unknown>> = [];
	vi.stubGlobal("document", document);
	vi.stubGlobal("window", window);
	vi.stubGlobal("MutationObserver", window.MutationObserver);
	vi.stubGlobal("location", { href: url });
	vi.stubGlobal("isAutomatedVisit", async () => false);
	vi.stubGlobal("chrome", {
		runtime: {
			lastError: undefined,
			onMessage: { addListener() {} },
			sendMessage(
				message: Record<string, unknown>,
				reply?: (response: unknown) => void,
			) {
				sent.push(message);
				reply?.({ ok: true, backend: { synced: true, ...backend } });
			},
		},
		storage: {
			local: {
				get(_key: string, got: (res: Record<string, unknown>) => void) {
					got({});
				},
				set() {},
			},
		},
	});

	vi.resetModules();
	await import("../scrape-dock.js");
	if (scripts === "ebay") {
		await import("../ebay-reader.js");
		await import("../ebay-content.js");
	} else {
		await import("../tcgplayer-reader.js");
		await import("../tcgplayer-content.js");
	}
	await vi.advanceTimersByTimeAsync(60_000);
	return { document: document as unknown as Document, sent };
}

const LISTINGS_URL =
	"http://localhost:1333/yugioh/decks/d1/listings?marketplace=ebay&card=c1";

describe("the dock on an eBay Search", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	test("a Sold page links to the Deck's Listings in a new tab, and to newly listed in place", async () => {
		const { document, sent } = await loadPage({
			fixture: "ebay-sold.html",
			url: ebaySoldUrl("RA01-EN008"),
			scripts: "ebay",
			backend: { created: 1, updated: 0, listingsUrl: LISTINGS_URL },
		});

		expect(sent[0]).toMatchObject({
			type: "YUGIOH_EBAY_CAPTURE",
			searchUrl: ebaySoldUrl("RA01-EN008"),
		});
		expect(dockLinks(document)).toEqual([
			{ text: "Go to Listings", href: LISTINGS_URL, target: "_blank" },
			{
				text: "Go to newly listed",
				href: ebayNewlyListedUrl("RA01-EN008"),
				target: null,
			},
		]);
	});

	test("a Newly Listed page no Deck has links only to sold listings", async () => {
		const { document } = await loadPage({
			fixture: "ebay-newly-listed.html",
			url: ebayNewlyListedUrl("RA01-EN008"),
			scripts: "ebay",
			backend: { created: 1, updated: 0 },
		});

		expect(dockLinks(document)).toEqual([
			{
				text: "Go to sold listings",
				href: ebaySoldUrl("RA01-EN008"),
				target: null,
			},
		]);
	});

	test("an Ending soon page has no switch", async () => {
		const { document } = await loadPage({
			fixture: "ebay-ending-soon.html",
			url: ebayEndingSoonUrl("RA01-EN008"),
			scripts: "ebay",
			backend: { created: 1, updated: 0 },
		});

		expect(dockLinks(document)).toEqual([]);
	});
});

describe("the dock on a TCGplayer product", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const ASH_URL =
		"https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare?Language=English";
	const printing = {
		cardName: "Ash Blossom & Joyous Spring",
		setCode: "RA01-EN008",
		rarity: "Quarter Century Secret Rare",
	};

	test("a captured product links to its Card's Listings in a new tab", async () => {
		const url =
			"http://localhost:1333/yugioh/decks/d1/listings?marketplace=tcgplayer&card=c1";
		const { document } = await loadPage({
			fixture: "tcgplayer-latest-sales.html",
			url: ASH_URL,
			scripts: "tcgplayer",
			backend: { printing, created: 1, updated: 0, listingsUrl: url },
		});

		expect(dockLinks(document)).toEqual([
			{ text: "Go to Listings", href: url, target: "_blank" },
		]);
	});

	test("a product no Deck has has no link", async () => {
		const { document } = await loadPage({
			fixture: "tcgplayer-latest-sales.html",
			url: ASH_URL,
			scripts: "tcgplayer",
			backend: { printing: null, reason: "Not in a Deck." },
		});

		expect(dockLinks(document)).toEqual([]);
	});
});

describe("the service worker", () => {
	type Listener = (
		message: unknown,
		sender: { tab?: { id: number } },
		reply: (response: unknown) => void,
	) => unknown;

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	/** Sends `message` to the real service worker; the app answers `reply`. */
	async function capture(
		message: Record<string, unknown>,
		reply: Record<string, unknown>,
	): Promise<{
		backend: Record<string, unknown>;
		posted: Record<string, unknown>;
	}> {
		const listeners: Listener[] = [];
		const event = () => ({ addListener: () => {} });
		vi.stubGlobal("importScripts", () => {});
		vi.stubGlobal("chrome", {
			runtime: {
				onMessage: { addListener: (l: Listener) => listeners.push(l) },
				onStartup: event(),
				onInstalled: event(),
				sendMessage: () => {},
			},
			alarms: { onAlarm: event() },
			storage: {
				onChanged: event(),
				sync: {
					get: async () => ({
						rymBackendOrigin: "http://localhost:1333/",
						rymBackendSecret: "secret",
					}),
				},
				local: { get: async () => ({}) },
			},
			permissions: { contains: async () => true },
			tabs: { sendMessage: () => {} },
		});
		const fetch = vi.fn(
			async (_url: string, _init: { body: string }) =>
				new Response(JSON.stringify(reply), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		);
		vi.stubGlobal("fetch", fetch);
		vi.resetModules();
		await import("../automation-runner.js");
		await import("../ingest-errors.js");
		await import("../service-worker.js");

		const response = (await new Promise((resolve) => {
			for (const listener of listeners) {
				listener(message, { tab: { id: 7 } }, resolve);
			}
		})) as { backend: Record<string, unknown> };
		const init = fetch.mock.calls[0]?.[1];
		return {
			backend: response.backend,
			posted: init ? JSON.parse(init.body) : {},
		};
	}

	test("an eBay capture sends its Search's URL, and links to the Deck's eBay Listings for the Card", async () => {
		const searchUrl = ebaySoldUrl("RA01-EN008");
		const { backend, posted } = await capture(
			{ type: "YUGIOH_EBAY_CAPTURE", listings: [], searchUrl },
			{ captured: 0, listingsPage: { deckId: "d1", cardId: "c1" } },
		);

		expect(posted).toEqual({ listings: [], searchUrl });
		expect(backend.listingsUrl).toBe(
			"http://localhost:1333/yugioh/decks/d1/listings?marketplace=ebay&card=c1",
		);
	});

	test("a TCGplayer capture links to the Deck's TCGplayer Listings, without a Card when there's none", async () => {
		const { backend } = await capture(
			{ type: "YUGIOH_TCGPLAYER_CAPTURE", product: { productId: 1 } },
			{ listingsPage: { deckId: "d1", cardId: null } },
		);

		expect(backend.listingsUrl).toBe(
			"http://localhost:1333/yugioh/decks/d1/listings?marketplace=tcgplayer",
		);
	});

	test("a capture no Deck has, or from an older app, has no link", async () => {
		for (const reply of [{ listingsPage: null }, {}]) {
			const { backend } = await capture(
				{ type: "YUGIOH_TCGPLAYER_CAPTURE", product: { productId: 1 } },
				reply,
			);
			expect(backend.listingsUrl).toBeUndefined();
		}
	});
});

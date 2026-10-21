// @vitest-environment node
// The dock's links: "Go to Listings" opens the tracker's Listings for what the
// page fed (in a new tab), once a capture says which Deck; on any eBay search,
// quick links go to the same query's Sold, Ending soon and Newly listed views
// in place. The dock, readers, content scripts and service worker are real;
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

type QuickView = {
	key: "sold" | "ending-soon" | "newly-listed";
	label: string;
	href: string;
	current: boolean;
};
declare function ebayQuickViews(url: string): QuickView[] | null;

const KEYWORDS = "(RA01-EN008,RA01-EN024) -super -ultra";

/** The three views' links, keyed, for `url`. */
function hrefs(url: string): Record<string, string> | null {
	const views = ebayQuickViews(url);
	return views && Object.fromEntries(views.map((v) => [v.key, v.href]));
}

/** Which view `url` is, if any. */
function current(url: string): string | null {
	return ebayQuickViews(url)?.find((v) => v.current)?.key ?? null;
}

describe("the quick views of an eBay search", () => {
	test("match the app's Sold, Ending soon and Newly listed URLs for the same query", () => {
		expect(hrefs(ebaySoldUrl(KEYWORDS))).toEqual({
			sold: ebaySoldUrl(KEYWORDS),
			"ending-soon": ebayEndingSoonUrl(KEYWORDS),
			"newly-listed": ebayNewlyListedUrl(KEYWORDS),
		});
	});

	test("are, in order, Sold, Ending soon, Newly listed", () => {
		expect(ebayQuickViews(ebaySoldUrl(KEYWORDS))?.map((v) => v.label)).toEqual([
			"Sold",
			"Ending soon",
			"Newly listed",
		]);
	});

	test("Sold is completed and sold; Ending soon is auctions only, ending first; Newly listed is every format, newest first", () => {
		const views = hrefs("https://www.ebay.com/sch/i.html?_nkw=ash+blossom");
		const params = (key: string) =>
			Object.fromEntries(new URL(views?.[key] ?? "").searchParams);
		expect(params("sold")).toEqual({
			_nkw: "ash blossom",
			LH_Sold: "1",
			LH_Complete: "1",
			_sop: "13",
		});
		expect(params("ending-soon")).toEqual({
			_nkw: "ash blossom",
			LH_Auction: "1",
			_sop: "1",
		});
		expect(params("newly-listed")).toEqual({ _nkw: "ash blossom", _sop: "10" });
	});

	test("drop other sorts, filters and the page, from any search", () => {
		const url =
			"https://www.ebay.com/sch/i.html?_from=R40&_nkw=ash+blossom+ra01&_sacat=0&LH_BIN=1&_sop=15&rt=nc&LH_ItemCondition=3000&_pgn=3";
		expect(hrefs(url)).toEqual({
			sold: ebaySoldUrl("ash blossom ra01"),
			"ending-soon": ebayEndingSoonUrl("ash blossom ra01"),
			"newly-listed": ebayNewlyListedUrl("ash blossom ra01"),
		});
	});

	test("keep the search's category", () => {
		const views = hrefs(
			"https://www.ebay.com/sch/i.html?_nkw=ash+blossom&_sacat=183454&LH_Auction=1&_sop=1",
		);
		for (const href of Object.values(views ?? {})) {
			expect(new URL(href).searchParams.get("_sacat")).toBe("183454");
		}
		expect(views?.sold).toBe(`${ebaySoldUrl("ash blossom")}&_sacat=183454`);
	});

	test("keep a category in the path", () => {
		const views = hrefs(
			"https://www.ebay.com/sch/183454/i.html?_nkw=ash+blossom&_sop=12",
		);
		expect(views?.["newly-listed"]).toBe(
			"https://www.ebay.com/sch/183454/i.html?_nkw=ash+blossom&_sop=10",
		);
	});

	test("mark the view the page is on", () => {
		expect(current(ebaySoldUrl(KEYWORDS))).toBe("sold");
		expect(current(`${ebaySoldUrl(KEYWORDS)}&_pgn=2`)).toBe("sold");
		expect(current(ebayEndingSoonUrl(KEYWORDS))).toBe("ending-soon");
		expect(current(ebayNewlyListedUrl(KEYWORDS))).toBe("newly-listed");
	});

	test("mark none on a search that's none of the three", () => {
		for (const url of [
			"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008",
			"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10&LH_BIN=1",
			"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=10&LH_Auction=1",
			"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&_sop=1",
			"https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_Complete=1",
		]) {
			expect(current(url)).toBeNull();
		}
	});

	test("aren't offered off a search", () => {
		for (const url of [
			"https://www.ebay.com/sch/i.html?_sop=10",
			"https://www.ebay.com/itm/1234567890",
			"not a url",
		]) {
			expect(ebayQuickViews(url)).toBeNull();
		}
	});
});

type Link = {
	text: string;
	href: string | null;
	target: string | null;
	current?: string | null;
};

/** The dock's links, as shown. */
function dockLinks(document: Document): Link[] {
	const host = document.getElementById("rym-scrape-dock");
	return [...(host?.shadowRoot?.querySelectorAll("a") ?? [])].map((a) => ({
		text: a.textContent?.trim() ?? "",
		href: a.getAttribute("href"),
		target: a.getAttribute("target"),
		...(a.closest("[data-views]")
			? { current: a.getAttribute("aria-current") }
			: {}),
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

	/** The quick views, with `current` the one shown as the page's own. */
	function views(keywords: string, current: string): Link[] {
		return [
			["Sold", ebaySoldUrl(keywords)],
			["Ending soon", ebayEndingSoonUrl(keywords)],
			["Newly listed", ebayNewlyListedUrl(keywords)],
		].map(([text, href]) =>
			text === current
				? { text, href: null, target: null, current: "page" }
				: { text, href, target: null, current: null },
		);
	}

	test("a Sold page links to the Deck's Listings in a new tab, and to the query's other views in place", async () => {
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
			...views("RA01-EN008", "Sold"),
			{
				text: "Go to Listings",
				href: LISTINGS_URL,
				target: "_blank",
			},
		]);
	});

	test("a Newly listed page no Deck has links only to the query's other views", async () => {
		const { document } = await loadPage({
			fixture: "ebay-newly-listed.html",
			url: ebayNewlyListedUrl("RA01-EN008"),
			scripts: "ebay",
			backend: { created: 1, updated: 0 },
		});

		expect(dockLinks(document)).toEqual(views("RA01-EN008", "Newly listed"));
	});

	test("an Ending soon page shows it as the current view", async () => {
		const { document } = await loadPage({
			fixture: "ebay-ending-soon.html",
			url: ebayEndingSoonUrl("RA01-EN008"),
			scripts: "ebay",
			backend: { created: 1, updated: 0 },
		});

		expect(dockLinks(document)).toEqual(views("RA01-EN008", "Ending soon"));
	});

	test("any other search gets all three, none current", async () => {
		const { document } = await loadPage({
			fixture: "ebay-ending-soon.html",
			url: "https://www.ebay.com/sch/i.html?_nkw=RA01-EN008&LH_BIN=1&_sop=15",
			scripts: "ebay",
			backend: { created: 1, updated: 0 },
		});

		expect(dockLinks(document)).toEqual(views("RA01-EN008", ""));
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

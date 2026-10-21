// @vitest-environment node
// Lays the Listings table out in a real browser (Chromium, with the app's
// Tailwind classes compiled) to catch what only shows on screen: text that
// spills out of its column, or a Card name squeezed to nothing.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { type Browser, chromium } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { ListingView } from "../_utils/types";
import { ListingsTable } from "./listings-page";

const require = createRequire(import.meta.url);
const NOW = Date.UTC(2026, 9, 21, 12, 0);

/** A TCGplayer sale of Brionac, as on the Chaos Lightsworn Deck in prod. */
function brionacSale(overrides: Partial<ListingView> = {}): ListingView {
	return {
		_id: "listing1" as ListingView["_id"],
		_creationTime: NOW,
		marketplace: "tcgplayer",
		itemId: "sale-1",
		url: "https://www.tcgplayer.com/product/1",
		title: "Heavily Played Unlimited · Brionac, Dragon of the Ice Barrier",
		imageUrl: null,
		price: 200,
		currency: "USD",
		shipping: 0,
		listingType: "buyItNow",
		bids: null,
		endsAt: null,
		listedAt: null,
		sellerLocation: null,
		sold: true,
		soldDate: "2026-06-23",
		firstSeenAt: NOW - 41_000,
		lastSeenAt: NOW,
		perCopyPrice: {
			perCopy: 200,
			copies: 1,
			landed: 200,
		} as unknown as ListingView["perCopyPrice"],
		deal: {
			qualifying: true,
			belowCondition: false,
			reference: { price: 357, sales: 9 },
			grade: "great",
			percentOfReference: 56,
		},
		isNew: false,
		tcgplayer: { seller: null, condition: "Heavily Played", quantity: 1 },
		rejection: null,
		conditionOverride: null,
		copiesOverride: null,
		rarityChoices: [
			{
				rarity: "Duel Terminal Ultra Parallel Rare",
				printingId: "printing1" as never,
				needed: true,
			},
		],
		titleRead: null,
		match: {
			status: "match",
			printing: {
				_id: "printing1" as never,
				cardName: "Brionac",
				setCode: "DT01-EN031",
				rarity: "Duel Terminal Ultra Parallel Rare",
				imageUrl: null,
			},
			overridden: false,
		},
		...overrides,
	};
}

let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch();
});
afterAll(async () => {
	await browser?.close();
});

async function stylesFor(html: string): Promise<string> {
	const compiler = await compile('@import "tailwindcss";', {
		async loadStylesheet(id, base) {
			const path = require.resolve(
				id === "tailwindcss" ? "tailwindcss/index.css" : id,
				{ paths: [base] },
			);
			return {
				path,
				base: dirname(path),
				content: await readFile(path, "utf8"),
			};
		},
	});
	const candidates = [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
		(match[1] ?? "").split(/\s+/),
	);
	return compiler.build(candidates);
}

/** A busy eBay Listing: long name, a lot of graded Korean copies, an auction. */
function busyListing(): ListingView {
	return brionacSale({
		_id: "listing2" as ListingView["_id"],
		marketplace: "ebay",
		sold: false,
		soldDate: null,
		listingType: "auction",
		bids: 12,
		endsAt: NOW + 3_600_000,
		sellerLocation: "United Kingdom of Great Britain and Northern Ireland",
		isNew: true,
		tcgplayer: null,
		titleRead: {
			setCode: "DT01-EN031",
			rarity: "Duel Terminal Ultra Parallel Rare",
			condition: "lightlyPlayed",
			copies: 3,
			language: "korean",
			graded: true,
			gradingCompany: "PSA",
			grade: "10",
		},
		deal: {
			qualifying: false,
			belowCondition: true,
			reference: { price: 357, sales: 9 },
			grade: "poor",
			percentOfReference: 131,
		},
		match: {
			status: "match",
			printing: {
				_id: "printing1" as never,
				cardName: "Brionac, Dragon of the Ice Barrier",
				setCode: "DT01-EN031",
				rarity: "Duel Terminal Ultra Parallel Rare",
				imageUrl: null,
			},
			overridden: false,
		},
	});
}

/**
 * The table at a desktop width, measured: for every cell, how far its text
 * reaches past the cell's right edge (text cut short with an ellipsis ends
 * where its clipping box does), and each row's height.
 */
async function measureTable(listings: ListingView[], width: number) {
	const html = renderToStaticMarkup(
		<div style={{ width }}>
			<ListingsTable
				listings={listings}
				now={NOW}
				view="available"
				sort={{ key: "date", direction: "desc" }}
				onSort={() => {}}
			/>
		</div>,
	);
	const page = await browser.newPage({
		viewport: { width: 1600, height: 800 },
	});
	await page.setContent(
		`<style>${await stylesFor(html)}</style><body>${html}</body>`,
	);
	const result = await page.evaluate(() => {
		const cells = [...document.querySelectorAll("tbody td")] as HTMLElement[];
		const overflows = cells.map((cell) => {
			const cellRight = cell.getBoundingClientRect().right;
			const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
			let textRight = 0;
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const range = document.createRange();
				range.selectNodeContents(node);
				let right = range.getBoundingClientRect().right;
				for (
					let el = node.parentElement;
					el && el !== cell;
					el = el.parentElement
				) {
					if (getComputedStyle(el).overflowX !== "visible") {
						right = Math.min(right, el.getBoundingClientRect().right);
					}
				}
				textRight = Math.max(textRight, right);
			}
			return textRight - cellRight;
		});
		const name = [
			...document.querySelectorAll("tbody td span:not(.sr-only)"),
		].find((el) => el.textContent?.startsWith("Brionac")) as
			| HTMLElement
			| undefined;
		const rows = [...document.querySelectorAll("tbody tr")].map(
			(row) => row.getBoundingClientRect().height,
		);
		const table = document.querySelector("table") as HTMLElement;
		return {
			overflows,
			rows,
			nameWidth: name?.getBoundingClientRect().width ?? 0,
			tableWidth: table.getBoundingClientRect().width,
		};
	});
	await page.close();
	return result;
}

describe("the Listings table's layout", () => {
	// The Deck page's content box at lg (1024 wide), and at 1280 and 1440
	// wide (max-w-5xl).
	test.each([976, 1024])(
		"at %ipx, no cell's text spills into the next",
		async (width) => {
			const { overflows, tableWidth } = await measureTable(
				[brionacSale(), busyListing()],
				width,
			);
			expect(tableWidth).toBeLessThanOrEqual(width + 0.5);
			for (const overflow of overflows)
				expect(overflow).toBeLessThanOrEqual(0.5);
		},
	);

	test("shows the Card name beside its art, however long the rarity", async () => {
		const { nameWidth } = await measureTable([brionacSale()], 976);
		expect(nameWidth).toBeGreaterThan(40);
	});

	test("the Card column gets the room the Actions column had", async () => {
		const html = tableHtml([brionacSale()]);
		expect(html).not.toContain("Actions");
		expect(html.match(/<col[ />]/g)).toHaveLength(7);
	});

	test("every row is the same height, flags or not", async () => {
		const { rows } = await measureTable([brionacSale(), busyListing()], 1024);
		expect(rows[0]).toBeCloseTo(rows[1] ?? 0, 0);
	});
});

/** The table's server markup, with editing on as on the Listings page. */
function tableHtml(listings: ListingView[]): string {
	return renderToStaticMarkup(
		<ListingsTable
			listings={listings}
			now={NOW}
			view="available"
			sort={{ key: "date", direction: "desc" }}
			onSort={() => {}}
			onSetCondition={() => {}}
			onSetRarity={() => {}}
			onDetails={() => {}}
			onHideCard={() => {}}
		/>,
	);
}

describe("a Listings table row", () => {
	test("a click opens the Listing on its marketplace, in a new tab, through one real link", () => {
		const html = tableHtml([brionacSale(), busyListing()]);
		const body = html.slice(html.indexOf("<tbody"));
		const links = body.match(/<a [^>]*data-row-link[^>]*>.*?<\/a>/g) ?? [];
		expect(links).toHaveLength(2);
		expect(links[0]).toContain('href="https://www.tcgplayer.com/product/1"');
		for (const link of links) {
			expect(link).toContain('target="_blank"');
			expect(link).toContain('rel="noopener noreferrer"');
		}
		// The link says what a click does, and that a right-click has more.
		expect(links[0]).toContain(
			"Brionac, TCGplayer. Open on TCGplayer in a new tab. Right-click or Shift+F10 for more",
		);
		expect(links[0]).toContain(
			'title="Open on TCGplayer · Right-click for more"',
		);
	});

	test("the link is the row's one tab stop; the row holds the menu", () => {
		const html = tableHtml([brionacSale(), busyListing()]);
		const rows = html.match(/<tr [^>]*aria-haspopup="menu"[^>]*>/g) ?? [];
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row).not.toContain("tabindex");
			expect(row).toContain('aria-expanded="false"');
		}
	});

	test("carries no action buttons of its own, and keeps its inline pickers", () => {
		const html = tableHtml([brionacSale()]);
		const body = html.slice(html.indexOf("<tbody"));
		expect(body).not.toContain("Mark as wrong");
		expect(body).toContain("Condition:");
		expect(body).toContain("Rarity:");
	});

	test("a lot shows the Copies I set, with a pencil", () => {
		const listing = busyListing();
		const set = tableHtml([{ ...listing, copiesOverride: 2 }]);
		expect(set).toContain("×2 copies");
		expect(set).not.toContain("×3 copies");
		expect(set).toContain('title="Copies set by you"');
		expect(tableHtml([listing])).toContain("×3 copies");
		expect(tableHtml([{ ...listing, copiesOverride: 1 }])).not.toContain(
			"copies",
		);
	});
});

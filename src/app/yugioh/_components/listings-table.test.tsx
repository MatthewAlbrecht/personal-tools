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
		titleRead: null,
		match: {
			status: "match",
			printing: {
				_id: "printing1" as never,
				cardName: "Brionac",
				setCode: "DT01-EN031",
				rarity: "Duel Terminal Ultra Parallel Rare",
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

/** The table at a desktop width, measured: the Card / Printing cell and its text. */
async function measureCardCell(listing: ListingView, width: number) {
	const html = renderToStaticMarkup(
		<div style={{ width }}>
			<ListingsTable
				listings={[listing]}
				href={() => "#"}
				now={NOW}
				view="sold"
				sort={{ key: "date", direction: "desc" }}
				onSort={() => {}}
			/>
		</div>,
	);
	const page = await browser.newPage({
		viewport: { width: 1400, height: 800 },
	});
	await page.setContent(
		`<style>${await stylesFor(html)}</style><body>${html}</body>`,
	);
	const result = await page.evaluate(() => {
		const cell = document.querySelectorAll("tbody td")[2] as HTMLElement;
		const cellBox = cell.getBoundingClientRect();
		const name = [...cell.querySelectorAll("span, p, div")].find(
			(el) => el.textContent === "Brionac",
		) as HTMLElement | undefined;
		const nameBox = name?.getBoundingClientRect();
		// Where each piece of text ends on screen; text cut short with an
		// ellipsis ends where its clipping box does.
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
		return {
			cellRight: cellBox.right,
			textRight,
			nameWidth: nameBox?.width ?? 0,
		};
	});
	await page.close();
	return result;
}

describe("the Listings table's Card / Printing column", () => {
	test("shows the Card name beside a long rarity", async () => {
		const { nameWidth } = await measureCardCell(brionacSale(), 1000);
		expect(nameWidth).toBeGreaterThan(20);
	});

	test("keeps a long Printing inside its column, not over the next one", async () => {
		const { cellRight, textRight } = await measureCardCell(brionacSale(), 1000);
		expect(textRight).toBeLessThanOrEqual(cellRight + 0.5);
	});
});

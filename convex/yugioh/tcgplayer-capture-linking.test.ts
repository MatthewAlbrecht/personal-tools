/// <reference types="vite/client" />
// @vitest-environment edge-runtime

// Seam 1: a captured TCGplayer product page that no Printing is linked to.
// The page's own details (set code, rarity) say which Printing it is: none
// (say so), exactly one without a link (link it, then capture), or more than
// one possibility (name them, and ask for a paste).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// TCGplayer's product lookup finds nothing, so new Printings ask for a paste.
vi.mock("../model/yugioh/tcgplayerSearch", () => ({
	searchTcgplayerProducts: async () => [],
	fetchTcgplayerProduct: async () => null,
}));

const modules = import.meta.glob("/convex/**/*.ts");

const SECRET = "test-server-secret-0123456789";

const BRIONAC = {
	cardName: "Brionac, Dragon of the Ice Barrier",
	setCode: "DT01-EN014",
	rarity: "Duel Terminal Ultra Parallel Rare",
	productId: 80926,
	url: "https://www.tcgplayer.com/product/80926/yugioh-duel-terminal-1-brionac-dragon-of-the-ice-barrier?page=1&Language=English",
	productUrl:
		"https://www.tcgplayer.com/product/80926/yugioh-duel-terminal-1-brionac-dragon-of-the-ice-barrier",
	details: {
		productName: "Brionac, Dragon of the Ice Barrier",
		setCode: "DT01-EN014",
		rarity: "Duel Terminal Ultra Parallel Rare",
	},
};

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

beforeEach(() => {
	vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
	vi.useFakeTimers();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

/** A Deck with one Card, its one Candidate the given Printing. */
async function deckWith(
	t: T,
	printing: { cardName: string; setCode: string; rarity: string },
): Promise<{
	deckId: Id<"yugiohDecks">;
	printingId: Id<"yugiohPrintings">;
}> {
	const deckId = await t.mutation(api.yugioh.decks.createDeck, {
		name: "Ice Barrier",
	});
	await t.mutation(api.yugioh.decks.addCard, {
		deckId,
		cardName: printing.cardName,
		section: "extra",
		copiesNeeded: 1,
		setCode: printing.setCode,
		rarity: printing.rarity,
		overloadedRarities: [],
	});
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const printingId = deck?.sections
		.flatMap((section) => section.cards)
		.find((card) => card.cardName === printing.cardName)
		?.candidates[0]?.printingId;
	if (!printingId) throw new Error("missing Printing");
	return { deckId, printingId };
}

/** Sends Brionac's product page as the extension reads it. */
async function captureBrionac(
	t: T,
	overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const res = await t.fetch("/server/yugioh/tcgplayer-product", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${SECRET}`,
		},
		body: JSON.stringify({
			product: {
				productId: BRIONAC.productId,
				url: BRIONAC.url,
				listingsFromCheapest: true,
				listings: [
					{
						listingId: "123-abc",
						seller: "Ice Cards",
						condition: "Near Mint Unlimited",
						price: 12.5,
						shipping: 0,
						quantity: 1,
						customTitle: null,
					},
				],
				sales: [],
				details: BRIONAC.details,
				...overrides,
			},
		}),
	});
	expect(res.status).toBe(200);
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	return await res.json();
}

async function tcgplayerRows(t: T): Promise<number> {
	return await t.run(
		async (ctx) =>
			(
				await ctx.db
					.query("yugiohListings")
					.withIndex("by_marketplace_and_itemId", (q) =>
						q.eq("marketplace", "tcgplayer"),
					)
					.take(100)
			).length,
	);
}

test("a page for a Printing no Deck has says so, naming the card, and stores nothing", async () => {
	const t = setup();
	await deckWith(t, {
		cardName: "Trishula, Dragon of the Ice Barrier",
		setCode: "HA04-EN060",
		rarity: "Secret Rare",
	});

	const report = await captureBrionac(t);

	expect(report).toMatchObject({
		printing: null,
		linked: false,
		created: 0,
		reason:
			"Brionac, Dragon of the Ice Barrier DT01-EN014 Duel Terminal Ultra Parallel Rare isn't in a Deck yet. Add it in the tracker first.",
	});
	expect(await tcgplayerRows(t)).toBe(0);
});

test("the card is named without the rarity TCGplayer puts in the product name", async () => {
	const t = setup();
	const report = await captureBrionac(t, {
		productId: 524817,
		url: "https://www.tcgplayer.com/product/524817/yugioh-25th-anniversary-rarity-collection-ash-blossom-and-joyous-spring-quarter-century-secret-rare",
		details: {
			productName: "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)",
			setCode: "RA01-EN008",
			rarity: "Quarter Century Secret Rare",
		},
	});

	expect(report.reason).toBe(
		"Ash Blossom & Joyous Spring RA01-EN008 Quarter Century Secret Rare isn't in a Deck yet. Add it in the tracker first.",
	);
});

test("the one matching Printing without a link is linked to the page, then the page is captured", async () => {
	const t = setup();
	const { deckId } = await deckWith(t, BRIONAC);

	const report = await captureBrionac(t);

	expect(report).toMatchObject({
		printing: {
			cardName: BRIONAC.cardName,
			setCode: BRIONAC.setCode,
			rarity: BRIONAC.rarity,
		},
		linked: true,
		reason: null,
		created: 1,
	});
	expect(await tcgplayerRows(t)).toBe(1);
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const card = deck?.sections.flatMap((section) => section.cards)[0];
	expect(card?.candidates[0]?.tcgplayer).toMatchObject({
		status: "found",
		productUrl: BRIONAC.productUrl,
	});

	// The next capture finds it by product id, with nothing left to link.
	expect(await captureBrionac(t)).toMatchObject({
		linked: false,
		created: 0,
		updated: 1,
	});
});

test("a Printing whose set code and rarity match but whose name the URL doesn't is left alone", async () => {
	const t = setup();
	const { printingId } = await deckWith(t, {
		...BRIONAC,
		cardName: "Gungnir, Dragon of the Ice Barrier",
	});

	const report = await captureBrionac(t);

	expect(report).toMatchObject({
		printing: null,
		linked: false,
		reason:
			"This page is DT01-EN014 Duel Terminal Ultra Parallel Rare, but its URL doesn't match Gungnir, Dragon of the Ice Barrier, so it wasn't linked.",
	});
	expect(await tcgplayerRows(t)).toBe(0);
	const printing = await t.run((ctx) =>
		ctx.db.get("yugiohPrintings", printingId),
	);
	expect(printing?.tcgplayerProductId ?? null).toBeNull();
});

test("a Printing with the Card's short name is linked to its page", async () => {
	const t = setup();
	const { deckId } = await deckWith(t, { ...BRIONAC, cardName: "Brionac" });

	const report = await captureBrionac(t);

	expect(report).toMatchObject({ linked: true, reason: null, created: 1 });
	const deck = await t.query(api.yugioh.decks.getDeck, { deckId });
	const card = deck?.sections.flatMap((section) => section.cards)[0];
	expect(card?.candidates[0]?.tcgplayer).toMatchObject({
		status: "found",
		productUrl: BRIONAC.productUrl,
	});
});

test("a matching Printing already linked to another product is named, with the paste instruction", async () => {
	const t = setup();
	const { printingId } = await deckWith(t, BRIONAC);
	await t.run(async (ctx) => {
		await ctx.db.patch("yugiohPrintings", printingId, {
			tcgplayerStatus: "found",
			tcgplayerProductId: 11111,
			tcgplayerProductUrl:
				"https://www.tcgplayer.com/product/11111/yugioh-duel-terminal-1-brionac-dragon-of-the-ice-barrier",
		});
	});

	const report = await captureBrionac(t);

	expect(report).toMatchObject({
		printing: null,
		linked: false,
		reason:
			"This page could be Brionac, Dragon of the Ice Barrier DT01-EN014 Duel Terminal Ultra Parallel Rare (already linked to another TCGplayer page). Paste this page's URL on the right Printing in the tracker, then run again.",
	});
	expect(await tcgplayerRows(t)).toBe(0);
	const printing = await t.run((ctx) =>
		ctx.db.get("yugiohPrintings", printingId),
	);
	expect(printing?.tcgplayerProductId).toBe(11111);
});

test("several matching Printings are all named, and none is linked", async () => {
	const t = setup();
	await deckWith(t, {
		cardName: "Brionac, Dragon of the Ice Barrier",
		setCode: "DT01-EN014",
		rarity: "Collector's Rare",
	});
	await deckWith(t, {
		cardName: "Brionac, Dragon of the Ice Barrier",
		setCode: "DT01-EN014",
		rarity: "Prismatic Collector's Rare",
	});

	const report = await captureBrionac(t, {
		details: { ...BRIONAC.details, rarity: "Prismatic Collector's Rare" },
	});

	expect(report).toMatchObject({ printing: null, linked: false });
	expect(report.reason).toBe(
		"This page could be Brionac, Dragon of the Ice Barrier DT01-EN014 Collector's Rare or Brionac, Dragon of the Ice Barrier DT01-EN014 Prismatic Collector's Rare. Paste this page's URL on the right Printing in the tracker, then run again.",
	);
	expect(await tcgplayerRows(t)).toBe(0);
});

test("a page whose details didn't load asks for another run", async () => {
	const t = setup();
	await deckWith(t, BRIONAC);

	const report = await captureBrionac(t, { details: null });

	expect(report).toMatchObject({
		printing: null,
		linked: false,
		reason:
			"This page's set code and rarity hadn't loaded, so it can't be matched to a Printing. Run again once the page has loaded.",
	});
	expect(await tcgplayerRows(t)).toBe(0);
});

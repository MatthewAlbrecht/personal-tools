// eBay Reference prices and Deal grades, judged in one Deck: Qualifying
// depends on the Lowest acceptable condition of the Deck's Card.
import {
	type DealGrade,
	REFERENCE_WINDOW_MS,
	type Reference,
	dealGrade,
	getsDealGrade,
	isBelowCondition,
	isQualifying,
	isRunningAuction,
	isSale,
	mostLenientCondition,
	percentOfReference,
	referencePrice,
} from "../../../src/lib/yugioh/deals";
import type { Condition } from "../../../src/lib/yugioh/deck";
import {
	type PerCopyPrice,
	type Pricing,
	perCopyPrice,
} from "../../../src/lib/yugioh/pricing";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { MAX_CANDIDATES_PER_DECK, MAX_CARDS_PER_DECK } from "./decks";
import { loadPricing } from "./pricing";

/** Most sales one Reference price reads: the newest, within the window. */
export const MAX_REFERENCE_SALES = 200;

/** How a Listing compares with its Printing's eBay Reference price. */
export type DealView = {
	/** Counts toward prices, deals and cost to finish in this Deck. */
	qualifying: boolean;
	/** Its condition is below the Card's Lowest acceptable condition. */
	belowCondition: boolean;
	/** Its Printing's eBay Reference price; null when it isn't matched to a Printing this Deck wants. */
	reference: Reference | null;
	/** Null for a running auction, a Listing that isn't gradable, or no Reference price. */
	grade: DealGrade | null;
	percentOfReference: number | null;
};

/** Prices and grades Listings for one Deck, at one moment. */
export type DealContext = {
	/** The Listing's Per-copy price; a sale keeps the exchange rate of when it sold. */
	perCopyPrice: (listing: Doc<"yugiohListings">) => PerCopyPrice | null;
	deal: (
		listing: Doc<"yugiohListings">,
		perCopy: PerCopyPrice | null,
	) => Promise<DealView>;
};

/**
 * What's needed to price and grade Listings in a Deck at `now` (passed in,
 * since a query can't read the clock): the exchange rates and import fees,
 * and which Printings the Deck wants at what condition. Reference prices are
 * read once per Printing and condition.
 */
export async function loadDealContext(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
	now: number,
): Promise<DealContext> {
	const pricing = await loadPricing(ctx);
	const wanted = await wantedConditions(ctx, deckId);
	const references = referenceReader(ctx, pricing, now);

	return {
		perCopyPrice: (listing) => listingPerCopyPrice(listing, pricing, now),
		async deal(listing, perCopy) {
			const printingId = matchedPrintingId(listing);
			const condition =
				printingId === null ? undefined : wanted.get(printingId);
			if (printingId === null || condition === undefined) {
				return {
					qualifying: false,
					belowCondition: false,
					reference: null,
					grade: null,
					percentOfReference: null,
				};
			}
			const reference = await references(printingId, condition);
			const percent =
				reference.price === null ||
				perCopy === null ||
				!getsDealGrade(listing, condition) ||
				isRunningAuction(listing, now)
					? null
					: percentOfReference(perCopy.perCopy, reference.price);
			return {
				qualifying: isQualifying(listing, condition),
				belowCondition: isBelowCondition(listing, condition),
				reference,
				grade: percent === null ? null : dealGrade(percent),
				percentOfReference: percent,
			};
		},
	};
}

/** One Candidate Printing's eBay Reference price for a Card in a Deck. */
export type CardReferencePrice = {
	deckCardId: Id<"yugiohDeckCards">;
	printingId: Id<"yugiohPrintings">;
	ebay: Reference;
};

/**
 * The eBay Reference price of every Card's Candidate Printings in a Deck, at
 * each Card's own Lowest acceptable condition.
 */
export async function readReferencePrices(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
	now: number,
): Promise<CardReferencePrice[]> {
	const references = referenceReader(ctx, await loadPricing(ctx), now);
	const prices: CardReferencePrice[] = [];
	for (const want of await deckWants(ctx, deckId)) {
		prices.push({
			deckCardId: want.deckCardId,
			printingId: want.printingId,
			ebay: await references(want.printingId, want.condition),
		});
	}
	return prices;
}

/**
 * A Listing's Per-copy price. A sale (sold, or an auction that has ended)
 * uses the exchange rate stored when it was last captured before it sold, so
 * its price doesn't drift with today's rate. Without one, today's rate.
 */
function listingPerCopyPrice(
	listing: Doc<"yugiohListings">,
	pricing: Pricing,
	now: number,
): PerCopyPrice | null {
	const saleRate = listing.capturedUsdPerUnit ?? null;
	const salePricing: Pricing =
		saleRate !== null && isSale(listing, now)
			? { ...pricing, usdPerUnit: () => saleRate }
			: pricing;
	return perCopyPrice(listing, listing.titleRead?.copies ?? 1, salePricing);
}

/**
 * Reads Reference prices, each Printing and condition once: the median
 * Per-copy price of its Qualifying sales in the window before `now`.
 */
function referenceReader(
	ctx: QueryCtx,
	pricing: Pricing,
	now: number,
): (
	printingId: Id<"yugiohPrintings">,
	condition: Condition,
) => Promise<Reference> {
	const cache = new Map<string, Promise<Reference>>();
	async function read(
		printingId: Id<"yugiohPrintings">,
		condition: Condition,
	): Promise<Reference> {
		const sales = await ctx.db
			.query("yugiohListings")
			.withIndex("by_matchedPrintingId_and_saleAt", (q) =>
				q
					.eq("matchedPrintingId", printingId)
					.gte("saleAt", now - REFERENCE_WINDOW_MS)
					.lte("saleAt", now),
			)
			.order("desc")
			.take(MAX_REFERENCE_SALES);
		const perCopyPrices: number[] = [];
		for (const listing of sales) {
			if (matchedPrintingId(listing) !== printingId) continue;
			if (!isSale(listing, now) || !isQualifying(listing, condition)) continue;
			const price = listingPerCopyPrice(listing, pricing, now);
			if (price !== null) perCopyPrices.push(price.perCopy);
		}
		return referencePrice(perCopyPrices);
	}
	return (printingId, condition) => {
		const key = `${printingId}:${condition}`;
		let reference = cache.get(key);
		if (reference === undefined) {
			reference = read(printingId, condition);
			cache.set(key, reference);
		}
		return reference;
	};
}

/**
 * The Printing a Listing is matched to, or null: unsure, not a match, or
 * being re-read (an override still counts while a new title is read).
 */
function matchedPrintingId(
	listing: Doc<"yugiohListings">,
): Id<"yugiohPrintings"> | null {
	if (listing.matchStatus !== "match") return null;
	if (!listing.matchOverridden && listing.titleReadStatus === "reading") {
		return null;
	}
	return listing.matchedPrintingId ?? null;
}

/** Each Candidate Printing in a Deck, with its Card's Lowest acceptable condition. */
async function deckWants(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<
	Array<{
		deckCardId: Id<"yugiohDeckCards">;
		printingId: Id<"yugiohPrintings">;
		condition: Condition;
	}>
> {
	const [cards, candidates] = await Promise.all([
		ctx.db
			.query("yugiohDeckCards")
			.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
			.take(MAX_CARDS_PER_DECK),
		ctx.db
			.query("yugiohCandidatePrintings")
			.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
			.take(MAX_CANDIDATES_PER_DECK),
	]);
	const conditions = new Map(
		cards.map((card) => [card._id, card.lowestAcceptableCondition]),
	);
	return candidates.flatMap((candidate) => {
		const condition = conditions.get(candidate.deckCardId);
		return condition === undefined
			? []
			: [
					{
						deckCardId: candidate.deckCardId,
						printingId: candidate.printingId,
						condition,
					},
				];
	});
}

/**
 * Each Printing the Deck wants, at the most lenient Lowest acceptable
 * condition of the Cards that want it.
 */
async function wantedConditions(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<Map<Id<"yugiohPrintings">, Condition>> {
	const byPrinting = new Map<Id<"yugiohPrintings">, Condition[]>();
	for (const want of await deckWants(ctx, deckId)) {
		byPrinting.set(want.printingId, [
			...(byPrinting.get(want.printingId) ?? []),
			want.condition,
		]);
	}
	const wanted = new Map<Id<"yugiohPrintings">, Condition>();
	for (const [printingId, conditions] of byPrinting) {
		const lenient = mostLenientCondition(conditions);
		if (lenient !== null) wanted.set(printingId, lenient);
	}
	return wanted;
}

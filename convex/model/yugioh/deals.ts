// Reference prices, buy-now floors and Deal grades, judged in one Deck:
// Qualifying depends on the Lowest acceptable condition of the Deck's Card.
// Each marketplace (eBay, TCGplayer) has its own, read from its own Listings
// only: the two are never blended.
import { BUY_NOW_FRESH_MS } from "../../../src/lib/yugioh/costs";
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
import { listingCopies } from "../../../src/lib/yugioh/listing-edits";
import type { Marketplace } from "../../../src/lib/yugioh/listing-filters";
import { isRejected } from "../../../src/lib/yugioh/listing-rejection";
import {
	type PerCopyPrice,
	type Pricing,
	perCopyPrice,
} from "../../../src/lib/yugioh/pricing";
import { tcgplayerProductIdOf } from "../../../src/lib/yugioh/tcgplayer";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { MAX_CANDIDATES_PER_DECK, MAX_CARDS_PER_DECK } from "./decks";
import { loadPricing } from "./pricing";

/** Most sales one Reference price reads: the newest, within the window. */
export const MAX_REFERENCE_SALES = 200;

/** Most Listings still for sale one buy-now floor reads: the newest captured. */
export const MAX_BUY_NOW_LISTINGS = 200;

/** How a Listing compares with its Printing's Reference price on its own marketplace. */
export type DealView = {
	/** Counts toward prices, deals and cost to finish in this Deck. */
	qualifying: boolean;
	/** Its condition is below the Card's Lowest acceptable condition. */
	belowCondition: boolean;
	/**
	 * Its Printing's Reference price on the Listing's marketplace; null when it
	 * isn't matched to a Printing this Deck wants.
	 */
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
			const reference = await references(
				listing.marketplace,
				printingId,
				condition,
			);
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

/** How a Listing grades for a Card wanting its Printing at one condition. */
export type CardDeal = {
	qualifying: boolean;
	perCopy: number | null;
	/** The Reference price on the Listing's own marketplace. */
	reference: number | null;
	grade: DealGrade | null;
	percentOfReference: number | null;
};

/**
 * Grades Listings for single Cards at `now`, each at the Card's own Lowest
 * acceptable condition (`loadDealContext` grades for a whole Deck at its most
 * lenient one). Reference prices are read once per Printing and condition.
 */
export async function loadCardDealGrader(
	ctx: QueryCtx,
	now: number,
): Promise<
	(listing: Doc<"yugiohListings">, condition: Condition) => Promise<CardDeal>
> {
	const pricing = await loadPricing(ctx);
	const references = referenceReader(ctx, pricing, now);
	return async (listing, condition) => {
		const printingId = matchedPrintingId(listing);
		const perCopy = listingPerCopyPrice(listing, pricing, now);
		const reference =
			printingId === null
				? null
				: (await references(listing.marketplace, printingId, condition)).price;
		const percent =
			reference === null ||
			perCopy === null ||
			!getsDealGrade(listing, condition) ||
			isRunningAuction(listing, now)
				? null
				: percentOfReference(perCopy.perCopy, reference);
		return {
			qualifying: printingId !== null && isQualifying(listing, condition),
			perCopy: perCopy?.perCopy ?? null,
			reference,
			grade: percent === null ? null : dealGrade(percent),
			percentOfReference: percent,
		};
	};
}

/**
 * One Candidate Printing's prices for a Card in a Deck: its eBay and
 * TCGplayer Reference prices, side by side, and the TCGplayer buy-now floor.
 */
export type CardReferencePrice = {
	deckCardId: Id<"yugiohDeckCards">;
	printingId: Id<"yugiohPrintings">;
	ebay: Reference;
	tcgplayer: Reference;
	/** The cheapest current Qualifying TCGplayer Listing's Per-copy price. */
	tcgplayerBuyNow: number | null;
};

/**
 * The Reference prices of every Card's Candidate Printings in a Deck, at each
 * Card's own Lowest acceptable condition.
 */
export async function readReferencePrices(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
	now: number,
): Promise<CardReferencePrice[]> {
	const prices = await loadPriceReaders(ctx, now);
	const rows: CardReferencePrice[] = [];
	for (const { deckCardId, printingId, condition } of await deckWants(
		ctx,
		deckId,
	)) {
		const [ebay, tcgplayer, tcgplayerBuyNow] = await Promise.all([
			prices.reference("ebay", printingId, condition),
			prices.reference("tcgplayer", printingId, condition),
			prices.buyNow("tcgplayer", printingId, condition),
		]);
		rows.push({ deckCardId, printingId, ebay, tcgplayer, tcgplayerBuyNow });
	}
	return rows;
}

/**
 * Reads a Printing's prices on one marketplace, for a Card wanting it at
 * `condition`, at one moment.
 */
export type PriceReaders = {
	/** The marketplace's Reference price. */
	reference: (
		marketplace: Marketplace,
		printingId: Id<"yugiohPrintings">,
		condition: Condition,
	) => Promise<Reference>;
	/**
	 * The cheapest Per-copy price of a Qualifying buy-it-now Listing still for
	 * sale on the marketplace; null when there's none. eBay Listings must have
	 * been seen in the last `BUY_NOW_FRESH_DAYS`; TCGplayer Listings, in the
	 * latest capture of the product page too.
	 */
	buyNow: (
		marketplace: Marketplace,
		printingId: Id<"yugiohPrintings">,
		condition: Condition,
	) => Promise<number | null>;
};

/** Price readers at `now`, each memoised per Printing and condition. */
export async function loadPriceReaders(
	ctx: QueryCtx,
	now: number,
): Promise<PriceReaders> {
	const pricing = await loadPricing(ctx);
	return {
		reference: referenceReader(ctx, pricing, now),
		buyNow: buyNowReader(ctx, pricing, now),
	};
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
	return perCopyPrice(listing, listingCopies(listing), salePricing);
}

/**
 * Reads Reference prices, each marketplace, Printing and condition once: the
 * median Per-copy price of its Qualifying sales on that marketplace in the
 * window before `now`.
 */
function referenceReader(
	ctx: QueryCtx,
	pricing: Pricing,
	now: number,
): PriceReaders["reference"] {
	return memoised(async (marketplace, printingId, condition) => {
		const sales = await ctx.db
			.query("yugiohListings")
			.withIndex("by_matchedPrintingId_and_marketplace_and_saleAt", (q) =>
				q
					.eq("matchedPrintingId", printingId)
					.eq("marketplace", marketplace)
					.gte("saleAt", now - REFERENCE_WINDOW_MS)
					.lte("saleAt", now),
			)
			.order("desc")
			.take(MAX_REFERENCE_SALES);
		const fromLinkedPage =
			marketplace === "tcgplayer"
				? fromLinkedTcgplayerProduct(
						await ctx.db.get("yugiohPrintings", printingId),
					)
				: () => true;
		const perCopyPrices: number[] = [];
		for (const listing of sales) {
			if (matchedPrintingId(listing) !== printingId) continue;
			if (!fromLinkedPage(listing)) continue;
			if (!isSale(listing, now) || !isQualifying(listing, condition)) continue;
			const price = listingPerCopyPrice(listing, pricing, now);
			if (price !== null) perCopyPrices.push(price.perCopy);
		}
		return referencePrice(perCopyPrices);
	});
}

/**
 * Reads buy-now floors, each marketplace, Printing and condition once.
 * Fixed-price Listings still for sale have no `saleAt`; graded and other
 * non-Qualifying Listings don't count. A TCGplayer Listing the latest capture
 * of its product page didn't see is gone.
 */
function buyNowReader(
	ctx: QueryCtx,
	pricing: Pricing,
	now: number,
): PriceReaders["buyNow"] {
	return memoised(async (marketplace, printingId, condition) => {
		const forSale = await ctx.db
			.query("yugiohListings")
			.withIndex("by_matchedPrintingId_and_marketplace_and_saleAt", (q) =>
				q
					.eq("matchedPrintingId", printingId)
					.eq("marketplace", marketplace)
					.eq("saleAt", null),
			)
			.order("desc")
			.take(MAX_BUY_NOW_LISTINGS);
		const printing =
			marketplace === "tcgplayer"
				? await ctx.db.get("yugiohPrintings", printingId)
				: null;
		const gone =
			marketplace === "tcgplayer"
				? goneFromTcgplayerPage(printing)
				: () => false;
		const fromLinkedPage =
			marketplace === "tcgplayer"
				? fromLinkedTcgplayerProduct(printing)
				: () => true;
		let cheapest: number | null = null;
		for (const listing of forSale) {
			if (matchedPrintingId(listing) !== printingId) continue;
			if (!fromLinkedPage(listing)) continue;
			if (listing.sold || listing.listingType === "auction") continue;
			if (listing.lastSeenAt < now - BUY_NOW_FRESH_MS) continue;
			if (gone(listing)) continue;
			if (!isQualifying(listing, condition)) continue;
			const price = listingPerCopyPrice(listing, pricing, now);
			if (price !== null && (cheapest === null || price.perCopy < cheapest)) {
				cheapest = price.perCopy;
			}
		}
		return cheapest;
	});
}

/**
 * Whether a TCGplayer Listing or sale was captured from the product page the
 * Printing is linked to now. After the link changes, the old page's rows stay
 * matched (and listed) but no longer count toward its prices. A Printing
 * without a stored product id (linked before captures existed) keeps them all.
 */
export function fromLinkedTcgplayerProduct(
	printing: Doc<"yugiohPrintings"> | null,
): (listing: Doc<"yugiohListings">) => boolean {
	const productId = printing?.tcgplayerProductId;
	if (productId == null) return () => true;
	return (listing) => tcgplayerProductIdOf(listing.url) === productId;
}

/**
 * Whether a TCGplayer Listing has left its product page: the latest capture
 * of the page's cheapest Listings didn't show it, though it showed one as
 * pricey or pricier (or showed none at all). TCGplayer sorts by price +
 * shipping, so a pricier unseen Listing may just be on a later page.
 */
export function goneFromTcgplayerPage(
	printing: Doc<"yugiohPrintings"> | null,
): (listing: Doc<"yugiohListings">) => boolean {
	const seenAt = printing?.tcgplayerListingsSeenAt;
	if (seenAt === undefined) return () => false;
	const upTo = printing?.tcgplayerListingsSeenUpTo ?? null;
	return (listing) =>
		listing.lastSeenAt < seenAt &&
		(upTo === null || (listing.price ?? 0) + (listing.shipping ?? 0) <= upTo);
}

type PriceRead<R> = (
	marketplace: Marketplace,
	printingId: Id<"yugiohPrintings">,
	condition: Condition,
) => Promise<R>;

/** Caches a marketplace, Printing and condition read for the life of one query. */
function memoised<R>(read: PriceRead<R>): PriceRead<R> {
	const cache = new Map<string, Promise<R>>();
	return (marketplace, printingId, condition) => {
		const key = `${marketplace}:${printingId}:${condition}`;
		let result = cache.get(key);
		if (result === undefined) {
			result = read(marketplace, printingId, condition);
			cache.set(key, result);
		}
		return result;
	};
}

/**
 * The Printing a Listing counts toward, or null: unsure, not a match, being
 * re-read (an override still counts while a new title is read), or Rejected.
 * Every price, deal, cost and push read goes through this, so a Rejected
 * Listing counts toward nothing.
 */
export function matchedPrintingId(
	listing: Doc<"yugiohListings">,
): Id<"yugiohPrintings"> | null {
	if (isRejected(listing)) return null;
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

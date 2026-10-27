import { ConvexError, type Infer } from "convex/values";
import {
	isRunningAuction,
	isSale,
	saleTime,
} from "../../../src/lib/yugioh/deals";
import {
	type Priority,
	type Section,
	cardPriority,
} from "../../../src/lib/yugioh/deck";
import {
	type ConditionChoice,
	type CopiesChoice,
	type RarityChoice,
	isConditionSetByYou,
	listingCondition,
	rarityChoices,
} from "../../../src/lib/yugioh/listing-edits";
import {
	type ListingFilters,
	type ListingsView,
	applyListingFilters,
	isShownInDeck,
} from "../../../src/lib/yugioh/listing-filters";
import { listingSeller } from "../../../src/lib/yugioh/listing-format";
import type {
	Rejection,
	RejectionReason,
} from "../../../src/lib/yugioh/listing-rejection";
import {
	type ListingSort,
	type SortKey,
	conditionSortValue,
	defaultListingSort,
	sortListings,
} from "../../../src/lib/yugioh/listing-sort";
import {
	type PerCopyPrice,
	cleanCountry,
	countryKey,
} from "../../../src/lib/yugioh/pricing";
import {
	ebaySearchSetCodes,
	neededPrintingIds,
	searchedPrintingsByCard,
} from "../../../src/lib/yugioh/searches";
import { shownMatchStatus } from "../../../src/lib/yugioh/title-reading";
import { isNewListing } from "../../../src/lib/yugioh/whats-new";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
	type ListingsPage,
	listingsPageFor,
	printingIdsWithSetCodes,
} from "./captureListingsPage";
import {
	type DealContext,
	type DealView,
	loadDealContext,
	matchedPrintingId,
} from "./deals";
import { listDeckCandidates, listDeckCards } from "./decks";
import {
	type ListingMatchView,
	listingMatchView,
	printingsForSetCode,
	queueTitleRead,
} from "./matching";
import { currentUsdPerUnit } from "./pricing";
import { queuePushCheck } from "./pushes";
import type { yugiohCapturedEbayListingValidator } from "./validators";
import { readNewSince } from "./whatsNew";

export type CapturedEbayListing = Infer<
	typeof yugiohCapturedEbayListingValidator
>;

export type IngestReport = {
	/** Distinct Listings in the capture. */
	captured: number;
	/** Listings seen for the first time. */
	created: number;
	/** Listings already known, updated in place. */
	updated: number;
	/**
	 * Running auctions matched to a Printing that this page showed no time
	 * left for, so it couldn't set their end time. A new Listing isn't matched
	 * yet (its title is still to be read), so it counts from its next capture.
	 */
	auctionsWithoutEndTime: number;
	/**
	 * Where the Search's Listings show in the tracker, from its page's URL;
	 * null without one, or when no Deck has its set codes.
	 */
	listingsPage: ListingsPage;
};

/** Most Listings one capture may carry (an eBay page shows up to 240). */
export const MAX_LISTINGS_PER_CAPTURE = 250;
export const MAX_LISTINGS_SHOWN = 200;
/**
 * Most Listings a Deck's Listings view reads per needed Printing, newest
 * first. Above `MAX_LISTINGS_SHOWN`, so a sort reaches past the newest 200.
 */
export const MAX_LISTINGS_PER_PRINTING = 400;
export const MAX_OBSERVATIONS_SHOWN = 100;

/**
 * Stores one eBay search-results page. Each result is upserted by item ID;
 * a first sighting and every later change of price, shipping, bids or sold
 * status adds an observation. The same item twice in one capture counts once
 * (the last one wins).
 */
export async function ingestEbayListings(
	ctx: MutationCtx,
	listings: CapturedEbayListing[],
	now: number,
	searchUrl: string | null = null,
): Promise<IngestReport> {
	if (listings.length > MAX_LISTINGS_PER_CAPTURE) {
		throw new Error(
			`A capture can carry at most ${MAX_LISTINGS_PER_CAPTURE} Listings`,
		);
	}
	const byItemId = new Map(listings.map((l) => [l.itemId, l]));
	const report: IngestReport = {
		captured: byItemId.size,
		created: 0,
		updated: 0,
		auctionsWithoutEndTime: 0,
		listingsPage:
			searchUrl === null
				? null
				: await listingsPageFor(
						ctx,
						await printingIdsWithSetCodes(ctx, ebaySearchSetCodes(searchUrl)),
					),
	};

	for (const captured of byItemId.values()) {
		const existing = await ctx.db
			.query("yugiohListings")
			.withIndex("by_marketplace_and_itemId", (q) =>
				q.eq("marketplace", "ebay").eq("itemId", captured.itemId),
			)
			.unique();

		if (!existing) {
			const listingId = await ctx.db.insert("yugiohListings", {
				marketplace: "ebay",
				...captured,
				firstSeenAt: now,
				lastSeenAt: now,
				titleRead: null,
				matchStatus: "unsure",
				matchedPrintingId: null,
				matchOverridden: false,
				saleAt: saleTime(captured, now),
				capturedUsdPerUnit: await currentUsdPerUnit(ctx, captured.currency),
			});
			await observe(ctx, listingId, captured, now);
			await queueTitleRead(ctx, listingId, captured.title);
			report.created++;
			continue;
		}

		if (
			captured.listingType === "auction" &&
			captured.endsAt === null &&
			!captured.sold &&
			!existing.sold &&
			matchedPrintingId(existing) !== null
		) {
			report.auctionsWithoutEndTime++;
		}
		const merged = mergeCapture(existing, captured);
		// A sale keeps the exchange rate of the last capture before it sold.
		const rateFrozen =
			isSale(existing, now) && existing.capturedUsdPerUnit !== undefined;
		await ctx.db.patch("yugiohListings", existing._id, {
			...merged,
			lastSeenAt: now,
			saleAt: saleTime(merged, existing.saleAt ?? now),
			...(rateFrozen
				? {}
				: {
						capturedUsdPerUnit: await currentUsdPerUnit(ctx, merged.currency),
					}),
		});
		if (observationChanged(existing, merged)) {
			await observe(ctx, existing._id, merged, now);
		}
		// Its auction push goes 15 minutes before the end time just read.
		if (
			merged.listingType === "auction" &&
			merged.endsAt !== existing.endsAt &&
			matchedPrintingId(existing) !== null
		) {
			await queuePushCheck(ctx, existing._id);
		}
		// The AI reads a title once, and again only when it changes.
		if (merged.title !== existing.title) {
			await queueTitleRead(ctx, existing._id, merged.title);
		}
		report.updated++;
	}
	return report;
}

/**
 * A later capture overwrites what it saw. Fields a page may leave out (image,
 * date listed, location, end time) keep their earlier value, and a sold
 * Listing stays sold.
 */
function mergeCapture(
	existing: Doc<"yugiohListings">,
	captured: CapturedEbayListing,
): CapturedEbayListing {
	return {
		...captured,
		imageUrl: captured.imageUrl ?? existing.imageUrl,
		listedAt: captured.listedAt ?? existing.listedAt,
		sellerLocation: captured.sellerLocation ?? existing.sellerLocation,
		endsAt: captured.endsAt ?? existing.endsAt,
		sold: existing.sold || captured.sold,
		soldDate: captured.soldDate ?? existing.soldDate,
	};
}

/** Price, shipping, bids or sold status moved: worth a new observation. */
export function observationChanged(
	before: CapturedEbayListing,
	after: CapturedEbayListing,
): boolean {
	return (
		before.price !== after.price ||
		before.currency !== after.currency ||
		before.shipping !== after.shipping ||
		before.bids !== after.bids ||
		before.sold !== after.sold
	);
}

/** Records a Listing's price as seen at `now`. */
export async function observe(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	listing: CapturedEbayListing,
	now: number,
): Promise<void> {
	await ctx.db.insert("yugiohListingObservations", {
		listingId,
		observedAt: now,
		price: listing.price,
		currency: listing.currency,
		shipping: listing.shipping,
		bids: listing.bids,
		sold: listing.sold,
	});
}

/**
 * The Listings matched to `printingIds` (the Deck's needed Printings: only
 * those can show), up to `MAX_LISTINGS_PER_PRINTING` newest per Printing,
 * newest first.
 */
export async function readDeckListings(
	ctx: QueryCtx,
	printingIds: Iterable<Id<"yugiohPrintings">>,
): Promise<Doc<"yugiohListings">[]> {
	const batches = await Promise.all(
		[...printingIds].map((printingId) =>
			ctx.db
				.query("yugiohListings")
				.withIndex("by_matchedPrintingId", (q) =>
					q.eq("matchedPrintingId", printingId),
				)
				.order("desc")
				.take(MAX_LISTINGS_PER_PRINTING),
		),
	);
	return batches.flat().sort((a, b) => b._creationTime - a._creationTime);
}

/** The Listings a Deck's Listings view shows, with what's needed to explain them. */
export type DeckListingsPage = {
	/** Up to `MAX_LISTINGS_SHOWN` of the Listings the filters let through, in sort order. */
	listings: ListingView[];
	/** How many Listings the filters let through, shown or not. */
	matching: number;
	/** How many Listings the filters would let through with New on: the view's new ones. */
	newCount: number;
	/** How many of the view's Listings are Rejected, before other filters. */
	rejectedCount: number;
	/** How many Listings the Deck shows (`isShownInDeck`), Available and Sold, before filters. */
	total: number;
	/** Every seller country among the Deck's shown Listings, A to Z: the location filter's options. */
	locations: string[];
	/** The Deck's Cards and the Printings each searches: which Card a Listing is for. */
	cards: DeckCardPrintings[];
};

/** A Deck Card, and the Printings it searches. */
export type DeckCardPrintings = {
	_id: Id<"yugiohDeckCards">;
	cardName: string;
	printingIds: Id<"yugiohPrintings">[];
};

/**
 * A Deck's Listings in the filters' view, priced and graded at `now`, ordered
 * by `sort` (null: the view's default). Every match is sorted before the first
 * `MAX_LISTINGS_SHOWN` are taken, so the order holds past the cap.
 */
export async function readDeckListingsPage(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
	now: number,
	filters: ListingFilters,
	sort: ListingSort | null = null,
): Promise<DeckListingsPage> {
	const [cards, candidates] = await Promise.all([
		listDeckCards(ctx, deckId),
		listDeckCandidates(ctx, deckId),
	]);
	const neededPrintings = neededPrintingIds(cards, candidates);
	const [all, newSince, deals] = await Promise.all([
		readDeckListings(ctx, neededPrintings),
		readNewSince(ctx, deckId),
		loadDealContext(ctx, deckId, now),
	]);
	const searched = searchedPrintingsByCard(cards, candidates);
	const context = {
		now,
		newSince,
		cardPrintings: cardPrintings(searched),
		neededPrintings: neededPrintings as ReadonlySet<string>,
		cardPriorities: new Map(
			cards.map((card): [string, Priority] => [card._id, cardPriority(card)]),
		),
		cardSections: new Map(
			cards.map((card): [string, Section] => [card._id, card.section]),
		),
	};
	const shown = all.filter((listing) =>
		isShownInDeck(listing, context.neededPrintings),
	);
	const view = filters.view ?? "available";
	const order = sort ?? defaultListingSort(view);
	const matching = applyListingFilters(shown, filters, context);
	const rarities = loadRarityChoices(ctx, context.neededPrintings);
	const values = await sortValues(ctx, matching, order, view, now, deals);
	const ordered = sortListings(
		matching,
		order,
		(listing) => values.get(listing._id) ?? null,
	);
	return {
		listings: await Promise.all(
			ordered
				.slice(0, MAX_LISTINGS_SHOWN)
				.map((listing) => listingView(ctx, listing, deals, newSince, rarities)),
		),
		matching: matching.length,
		newCount: filters.new
			? matching.length
			: applyListingFilters(shown, { ...filters, new: true }, context).length,
		rejectedCount: applyListingFilters(
			shown,
			{ view: filters.view, rejected: true },
			context,
		).length,
		total: shown.length,
		locations: sellerCountries(shown),
		cards: cards.map((card) => ({
			_id: card._id,
			cardName: card.cardName,
			printingIds: searched.get(card._id) ?? [],
		})),
	};
}

/**
 * Each Listing's value in the sort's column, as the table shows it. Only the
 * sorted column is worked out: a grade needs the Reference price, a Card its
 * Printing (read once each).
 */
async function sortValues(
	ctx: QueryCtx,
	listings: Doc<"yugiohListings">[],
	sort: ListingSort,
	view: ListingsView,
	now: number,
	deals: DealContext,
): Promise<Map<Id<"yugiohListings">, number | string | null>> {
	const values = new Map<Id<"yugiohListings">, number | string | null>();
	const printings = new Map<
		Id<"yugiohPrintings">,
		Promise<Doc<"yugiohPrintings"> | null>
	>();
	function printing(
		printingId: Id<"yugiohPrintings">,
	): Promise<Doc<"yugiohPrintings"> | null> {
		let found = printings.get(printingId);
		if (!found) {
			found = ctx.db.get("yugiohPrintings", printingId);
			printings.set(printingId, found);
		}
		return found;
	}
	await Promise.all(
		listings.map(async (listing) => {
			values.set(
				listing._id,
				await sortValue(listing, sort.key, view, now, deals, printing),
			);
		}),
	);
	return values;
}

async function sortValue(
	listing: Doc<"yugiohListings">,
	key: SortKey,
	view: ListingsView,
	now: number,
	deals: DealContext,
	printing: (
		printingId: Id<"yugiohPrintings">,
	) => Promise<Doc<"yugiohPrintings"> | null>,
): Promise<number | string | null> {
	switch (key) {
		case "price":
			return deals.perCopyPrice(listing)?.perCopy ?? null;
		case "grade": {
			const deal = await deals.deal(listing, deals.perCopyPrice(listing));
			return deal.percentOfReference;
		}
		case "card": {
			if (shownMatchStatus(listing) !== "match") return null;
			const printingId = listing.matchedPrintingId ?? null;
			const found = printingId === null ? null : await printing(printingId);
			return found && `${found.cardName} ${found.setCode} ${found.rarity}`;
		}
		case "condition":
			return conditionSortValue(listingCondition(listing));
		case "date":
			// Sold: when it sold. Available: when a running auction ends.
			if (view === "sold") {
				return listing.saleAt ?? saleTime(listing, listing.lastSeenAt);
			}
			return isRunningAuction(listing, now) ? listing.endsAt : null;
		case "seller":
			return listingSeller({
				...listing,
				tcgplayer: listing.tcgplayer ?? null,
			});
		case "seen":
			return listing.listedAt ?? listing.firstSeenAt;
	}
}

function sellerCountries(listings: Doc<"yugiohListings">[]): string[] {
	const byKey = new Map<string, string>();
	for (const { sellerLocation } of listings) {
		if (sellerLocation === null) continue;
		const key = countryKey(sellerLocation);
		if (!byKey.has(key)) byKey.set(key, cleanCountry(sellerLocation));
	}
	return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/** The Printings each of the Deck's Cards searches, by Card ID. */
function cardPrintings(
	searched: ReadonlyMap<string, readonly string[]>,
): Map<string, Set<string>> {
	const byCard = new Map<string, Set<string>>();
	for (const [cardId, printingIds] of searched) {
		byCard.set(cardId, new Set(printingIds));
	}
	return byCard;
}

/** One Listing with its observations, newest first, or null if missing. */
export async function readListing(
	ctx: QueryCtx,
	listingId: Id<"yugiohListings">,
): Promise<
	| (Doc<"yugiohListings"> & {
			observations: Doc<"yugiohListingObservations">[];
	  })
	| null
> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing) return null;
	const observations = await ctx.db
		.query("yugiohListingObservations")
		.withIndex("by_listingId", (q) => q.eq("listingId", listingId))
		.order("desc")
		.take(MAX_OBSERVATIONS_SHOWN);
	return { ...listing, observations };
}

/** A Listing as the Listings views show it: captured fields, read and match. */
export type ListingView = CapturedEbayListing & {
	_id: Id<"yugiohListings">;
	_creationTime: number;
	marketplace: Doc<"yugiohListings">["marketplace"];
	firstSeenAt: number;
	lastSeenAt: number;
	/** Null when there's no price, or no exchange rate for its currency yet. */
	perCopyPrice: PerCopyPrice | null;
	deal: DealView;
	/** First seen since my last visit to the Deck. */
	isNew: boolean;
	/** Seller, condition and quantity, for a TCGplayer Listing or sale. */
	tcgplayer: NonNullable<Doc<"yugiohListings">["tcgplayer"]> | null;
	/** Why and when I marked it wrong; null when I haven't. */
	rejection: Rejection | null;
	/** The condition I set; null when the title's read stands. */
	conditionOverride: ConditionChoice | null;
	/** The Copies I set; null when the title's read stands. */
	copiesOverride: CopiesChoice | null;
	/**
	 * The rarities a matched Listing could be instead (its own included): my
	 * Printings under its set code, then Overloaded rarities I have none of.
	 * Empty when it isn't matched.
	 */
	rarityChoices: RarityChoice<Id<"yugiohPrintings">>[];
} & ListingMatchView;

/**
 * The stored Listing as the Listings views show it, with its read, match,
 * Per-copy price and Deal grade. `deals` comes from `loadDealContext`, once
 * per query. Copies are mine, else the title read's, else 1. `newSince`
 * is where "new" starts in the Deck (`readNewSince`).
 */
export async function listingView(
	ctx: QueryCtx,
	listing: Doc<"yugiohListings">,
	deals: DealContext,
	newSince: number | null,
	rarities: RarityChoicesLoader,
): Promise<ListingView> {
	const perCopyPrice = deals.perCopyPrice(listing);
	return {
		_id: listing._id,
		_creationTime: listing._creationTime,
		marketplace: listing.marketplace,
		itemId: listing.itemId,
		url: listing.url,
		title: listing.title,
		imageUrl: listing.imageUrl,
		price: listing.price,
		currency: listing.currency,
		shipping: listing.shipping,
		listingType: listing.listingType,
		bids: listing.bids,
		endsAt: listing.endsAt,
		listedAt: listing.listedAt,
		sellerLocation: listing.sellerLocation,
		sold: listing.sold,
		soldDate: listing.soldDate,
		firstSeenAt: listing.firstSeenAt,
		lastSeenAt: listing.lastSeenAt,
		perCopyPrice,
		deal: await deals.deal(listing, perCopyPrice),
		isNew: isNewListing(listing, newSince),
		tcgplayer: listing.tcgplayer ?? null,
		rejection: listing.rejection ?? null,
		conditionOverride: listing.conditionOverride ?? null,
		copiesOverride: listing.copiesOverride ?? null,
		rarityChoices: await rarities(listing),
		...(await listingMatchView(ctx, listing)),
	};
}

/** A matched Listing's rarity choices (`rarityChoices`), read once per Printing. */
export type RarityChoicesLoader = (
	listing: Doc<"yugiohListings">,
) => Promise<RarityChoice<Id<"yugiohPrintings">>[]>;

/**
 * Reads rarity choices for one query: each matched Printing's set code once.
 * `needed` is the Printings the Deck still needs (`neededPrintingIds`).
 */
export function loadRarityChoices(
	ctx: QueryCtx,
	needed: ReadonlySet<string>,
): RarityChoicesLoader {
	const byPrinting = new Map<
		Id<"yugiohPrintings">,
		Promise<RarityChoice<Id<"yugiohPrintings">>[]>
	>();
	async function read(
		printingId: Id<"yugiohPrintings">,
	): Promise<RarityChoice<Id<"yugiohPrintings">>[]> {
		const matched = await ctx.db.get("yugiohPrintings", printingId);
		if (!matched) return [];
		const printings = await printingsForSetCode(ctx, matched.setCode);
		return rarityChoices(printings, matched, needed);
	}
	return async (listing) => {
		const printingId = listing.matchedPrintingId ?? null;
		if (printingId === null || shownMatchStatus(listing) !== "match") {
			return [];
		}
		let choices = byPrinting.get(printingId);
		if (!choices) {
			choices = read(printingId);
			byPrinting.set(printingId, choices);
		}
		return await choices;
	};
}

/** The Printings a Deck still needs: those its Listings view shows. */
export async function deckNeededPrintings(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<Set<Id<"yugiohPrintings">>> {
	const [cards, candidates] = await Promise.all([
		listDeckCards(ctx, deckId),
		listDeckCandidates(ctx, deckId),
	]);
	return neededPrintingIds(cards, candidates);
}

/**
 * Sets a Listing's condition myself (a condition, or "not stated"), or
 * (null) goes back to what the title says. It wins over the title's read in
 * prices, grades, filters and pushes, and stays through re-reads and
 * recaptures.
 */
export async function setListingCondition(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	condition: ConditionChoice | null,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing) throw new ConvexError("That Listing doesn't exist.");
	await ctx.db.patch("yugiohListings", listingId, {
		conditionOverride: condition,
	});
	if (shownMatchStatus(listing) === "match") {
		await queuePushCheck(ctx, listingId);
	}
}

/**
 * Sets the Copies in a Listing myself (1 to 3), or (null) goes back to what
 * the title says. They divide its Per-copy price, so Reference prices,
 * grades, cost to finish and pushes follow, and stay through re-reads and
 * recaptures.
 */
export async function setListingCopies(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	copies: CopiesChoice | null,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing) throw new ConvexError("That Listing doesn't exist.");
	await ctx.db.patch("yugiohListings", listingId, { copiesOverride: copies });
	if (shownMatchStatus(listing) === "match") {
		await queuePushCheck(ctx, listingId);
	}
}

/**
 * Marks a Listing wrong with a reason, making it a Rejected Listing, or
 * (reason null) unmarks it. A Rejected Listing counts toward no price, deal,
 * cost or push, and stays rejected through later captures.
 */
export async function setListingRejection(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	reason: RejectionReason | null,
	now: number,
): Promise<void> {
	const listing = await ctx.db.get("yugiohListings", listingId);
	if (!listing) throw new ConvexError("That Listing doesn't exist.");
	await ctx.db.patch("yugiohListings", listingId, {
		rejection: reason === null ? null : { reason, at: now },
	});
}

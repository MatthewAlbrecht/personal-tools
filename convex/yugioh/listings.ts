import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireAuth } from "../auth";
import { yugiohListingsPageValidator } from "../model/yugioh/captureListingsPage";
import { loadDealContext } from "../model/yugioh/deals";
import * as Listings from "../model/yugioh/listings";
import * as Matching from "../model/yugioh/matching";
import * as TcgplayerCapture from "../model/yugioh/tcgplayerCapture";
import {
	yugiohCapturedEbayListingValidator,
	yugiohCapturedTcgplayerProductValidator,
	yugiohDealValidator,
	yugiohListingFiltersValidator,
	yugiohListingSortValidator,
	yugiohMarketplaceValidator,
	yugiohMatchStatusValidator,
	yugiohPerCopyPriceValidator,
	yugiohRejectionReasonValidator,
	yugiohRejectionValidator,
	yugiohTcgplayerDetailsValidator,
	yugiohTitleReadValidator,
} from "../model/yugioh/validators";
import { readNewSince } from "../model/yugioh/whatsNew";

const listingValidator = v.object({
	_id: v.id("yugiohListings"),
	_creationTime: v.number(),
	marketplace: yugiohMarketplaceValidator,
	...yugiohCapturedEbayListingValidator.fields,
	firstSeenAt: v.number(),
	lastSeenAt: v.number(),
	/**
	 * Price plus shipping plus import fees in dollars, divided by the Copies in
	 * the Listing. Null without a price or an exchange rate for its currency.
	 */
	perCopyPrice: v.union(yugiohPerCopyPriceValidator, v.null()),
	/** Qualifying, flags and Deal grade against the eBay Reference price. */
	deal: yugiohDealValidator,
	/** First seen since my last visit to this Deck. */
	isNew: v.boolean(),
	/** Seller, condition and quantity, for a TCGplayer Listing or sale. */
	tcgplayer: v.union(yugiohTcgplayerDetailsValidator, v.null()),
	/** Why and when I marked it wrong; null when I haven't. */
	rejection: v.union(yugiohRejectionValidator, v.null()),
	/** What the AI read from the title; null until read, or when reading failed. */
	titleRead: v.union(yugiohTitleReadValidator, v.null()),
	match: v.object({
		/** "reading" while the AI reads a new or changed title. */
		status: v.union(yugiohMatchStatusValidator, v.literal("reading")),
		printing: v.union(
			v.object({
				_id: v.id("yugiohPrintings"),
				cardName: v.string(),
				setCode: v.string(),
				rarity: v.string(),
				imageUrl: v.union(v.string(), v.null()),
			}),
			v.null(),
		),
		/** True when I set the match myself; it wins over later reads. */
		overridden: v.boolean(),
	}),
});

const observationValidator = v.object({
	_id: v.id("yugiohListingObservations"),
	_creationTime: v.number(),
	listingId: v.id("yugiohListings"),
	observedAt: v.number(),
	price: v.union(v.number(), v.null()),
	currency: v.union(v.string(), v.null()),
	shipping: v.union(v.number(), v.null()),
	bids: v.union(v.number(), v.null()),
	sold: v.boolean(),
});

/**
 * A Deck's Listings in one view (Available unless `filters.view` is "sold")
 * through `filters` (as kept in the URL), ordered by `sort` (else the view's
 * default) and graded at `now` (Unix ms, from the client: a query can't read
 * the clock). The sort runs over every match before the first 200 are taken.
 */
export const listListings = query({
	args: {
		deckId: v.id("yugiohDecks"),
		now: v.number(),
		filters: v.optional(yugiohListingFiltersValidator),
		sort: v.optional(yugiohListingSortValidator),
	},
	returns: v.object({
		listings: v.array(listingValidator),
		/** How many Listings the filters let through; at most 200 are shown. */
		matching: v.number(),
		/** How many Listings the filters would let through with New on. */
		newCount: v.number(),
		/** How many of the view's Listings are Rejected, before other filters. */
		rejectedCount: v.number(),
		/** How many Listings the Deck shows, Available and Sold, before filters. */
		total: v.number(),
		/** Every seller country among the Deck's Listings, A to Z. */
		locations: v.array(v.string()),
	}),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Listings.readDeckListingsPage(
			ctx,
			args.deckId,
			args.now,
			args.filters ?? {},
			args.sort ?? null,
		);
	},
});

/**
 * One Listing with its price observations, newest first, graded in a Deck at
 * `now`.
 */
export const getListing = query({
	args: {
		listingId: v.id("yugiohListings"),
		deckId: v.id("yugiohDecks"),
		now: v.number(),
	},
	returns: v.union(
		listingValidator.extend({ observations: v.array(observationValidator) }),
		v.null(),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const listing = await Listings.readListing(ctx, args.listingId);
		if (!listing) return null;
		const { observations, ...doc } = listing;
		const deals = await loadDealContext(ctx, args.deckId, args.now);
		const newSince = await readNewSince(ctx, args.deckId);
		return {
			...(await Listings.listingView(ctx, doc, deals, newSince)),
			observations,
		};
	},
});

/**
 * Sets a Listing's match myself: one of my Printings, or null for "Not a
 * match". It wins over the AI on every later capture.
 */
export const setListingMatch = mutation({
	args: {
		listingId: v.id("yugiohListings"),
		printingId: v.union(v.id("yugiohPrintings"), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await Matching.setMatchOverride(ctx, args.listingId, args.printingId);
		return null;
	},
});

/**
 * Marks a Listing wrong with a reason, or (reason null) unmarks it. A Rejected
 * Listing counts toward no price, deal, cost or push, and stays rejected
 * through later captures.
 */
export const setListingRejection = mutation({
	args: {
		listingId: v.id("yugiohListings"),
		reason: v.union(yugiohRejectionReasonValidator, v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await Listings.setListingRejection(
			ctx,
			args.listingId,
			args.reason,
			Date.now(),
		);
		return null;
	},
});

/**
 * Stores one captured eBay search-results page. Internal: reached only through
 * the secret-guarded `/server/yugioh/ebay-listings` HTTP action.
 */
export const ingestEbayListings = internalMutation({
	args: {
		listings: v.array(yugiohCapturedEbayListingValidator),
		// The Search page's URL; older extensions don't send it.
		searchUrl: v.optional(v.string()),
	},
	returns: v.object({
		captured: v.number(),
		created: v.number(),
		updated: v.number(),
		auctionsWithoutEndTime: v.number(),
		listingsPage: yugiohListingsPageValidator,
	}),
	handler: async (ctx, args) => {
		return await Listings.ingestEbayListings(
			ctx,
			args.listings,
			Date.now(),
			args.searchUrl ?? null,
		);
	},
});

/**
 * Stores one captured TCGplayer product page: its current Listings and latest
 * sales, under the Printing with that product id. Internal: reached only
 * through the secret-guarded `/server/yugioh/tcgplayer-product` HTTP action.
 */
export const ingestTcgplayerProduct = internalMutation({
	args: { product: yugiohCapturedTcgplayerProductValidator },
	returns: v.object({
		printing: v.union(
			v.object({
				cardName: v.string(),
				setCode: v.string(),
				rarity: v.string(),
			}),
			v.null(),
		),
		productName: v.union(v.string(), v.null()),
		listings: v.number(),
		sales: v.number(),
		created: v.number(),
		updated: v.number(),
		linked: v.boolean(),
		reason: v.union(v.string(), v.null()),
		listingsPage: yugiohListingsPageValidator,
	}),
	handler: async (ctx, args) => {
		return await TcgplayerCapture.ingestTcgplayerProduct(
			ctx,
			args.product,
			Date.now(),
		);
	},
});

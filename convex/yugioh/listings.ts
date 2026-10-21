import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireAuth } from "../auth";
import { loadDealContext } from "../model/yugioh/deals";
import * as Listings from "../model/yugioh/listings";
import * as Matching from "../model/yugioh/matching";
import * as TcgplayerCapture from "../model/yugioh/tcgplayerCapture";
import {
	yugiohCapturedEbayListingValidator,
	yugiohCapturedTcgplayerProductValidator,
	yugiohDealValidator,
	yugiohListingFiltersValidator,
	yugiohMarketplaceValidator,
	yugiohMatchStatusValidator,
	yugiohPerCopyPriceValidator,
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
 * A Deck's Listings through `filters` (as kept in the URL), newest first,
 * graded at `now` (Unix ms, from the client: a query can't read the clock).
 * With no filters, nothing is hidden.
 */
export const listListings = query({
	args: {
		deckId: v.id("yugiohDecks"),
		now: v.number(),
		filters: v.optional(yugiohListingFiltersValidator),
	},
	returns: v.object({
		listings: v.array(listingValidator),
		/** How many Listings the filters let through; at most 200 are shown. */
		matching: v.number(),
		/** How many of the Deck's Listings are new since my last visit. */
		newCount: v.number(),
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
 * Stores one captured eBay search-results page. Internal: reached only through
 * the secret-guarded `/server/yugioh/ebay-listings` HTTP action.
 */
export const ingestEbayListings = internalMutation({
	args: { listings: v.array(yugiohCapturedEbayListingValidator) },
	returns: v.object({
		captured: v.number(),
		created: v.number(),
		updated: v.number(),
	}),
	handler: async (ctx, args) => {
		return await Listings.ingestEbayListings(ctx, args.listings, Date.now());
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
		listings: v.number(),
		sales: v.number(),
		created: v.number(),
		updated: v.number(),
		linked: v.boolean(),
		reason: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		return await TcgplayerCapture.ingestTcgplayerProduct(
			ctx,
			args.product,
			Date.now(),
		);
	},
});

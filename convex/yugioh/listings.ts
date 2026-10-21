import { v } from "convex/values";
import {
	type QueryCtx,
	internalMutation,
	mutation,
	query,
} from "../_generated/server";
import { requireAuth } from "../auth";
import * as Listings from "../model/yugioh/listings";
import * as Matching from "../model/yugioh/matching";
import {
	yugiohCapturedEbayListingValidator,
	yugiohMarketplaceValidator,
	yugiohMatchStatusValidator,
	yugiohTitleReadValidator,
} from "../model/yugioh/validators";

const listingValidator = v.object({
	_id: v.id("yugiohListings"),
	_creationTime: v.number(),
	marketplace: yugiohMarketplaceValidator,
	...yugiohCapturedEbayListingValidator.fields,
	firstSeenAt: v.number(),
	lastSeenAt: v.number(),
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

/** A Deck's Listings, newest first (see `readDeckListings`). */
export const listListings = query({
	args: { deckId: v.id("yugiohDecks") },
	returns: v.array(listingValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const listings = await Listings.readDeckListings(ctx, args.deckId);
		return await Promise.all(
			listings.map((listing) => Listings.listingView(ctx, listing)),
		);
	},
});

/** One Listing with its price observations, newest first. */
export const getListing = query({
	args: { listingId: v.id("yugiohListings") },
	returns: v.union(
		listingValidator.extend({ observations: v.array(observationValidator) }),
		v.null(),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const listing = await Listings.readListing(ctx, args.listingId);
		if (!listing) return null;
		const { observations, ...doc } = listing;
		return { ...(await Listings.listingView(ctx, doc)), observations };
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

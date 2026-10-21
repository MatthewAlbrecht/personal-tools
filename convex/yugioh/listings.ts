import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Listings from "../model/yugioh/listings";
import {
	yugiohCapturedEbayListingValidator,
	yugiohMarketplaceValidator,
} from "../model/yugioh/validators";

const listingValidator = v.object({
	_id: v.id("yugiohListings"),
	_creationTime: v.number(),
	marketplace: yugiohMarketplaceValidator,
	...yugiohCapturedEbayListingValidator.fields,
	firstSeenAt: v.number(),
	lastSeenAt: v.number(),
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

/** Captured Listings, newest first. */
export const listListings = query({
	args: {},
	returns: v.array(listingValidator),
	handler: async (ctx) => {
		requireAuth(ctx);
		return await Listings.readListings(ctx);
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
		return await Listings.readListing(ctx, args.listingId);
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

import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { yugiohCapturedEbayListingValidator } from "./validators";

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
};

/** Most Listings one capture may carry (an eBay page shows up to 240). */
export const MAX_LISTINGS_PER_CAPTURE = 250;
export const MAX_LISTINGS_SHOWN = 200;
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
			});
			await observe(ctx, listingId, captured, now);
			report.created++;
			continue;
		}

		const merged = mergeCapture(existing, captured);
		await ctx.db.patch("yugiohListings", existing._id, {
			...merged,
			lastSeenAt: now,
		});
		if (observationChanged(existing, merged)) {
			await observe(ctx, existing._id, merged, now);
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
function observationChanged(
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

async function observe(
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

/** The newest captured Listings first, from every marketplace and Deck. */
export async function readListings(
	ctx: QueryCtx,
): Promise<Doc<"yugiohListings">[]> {
	return await ctx.db
		.query("yugiohListings")
		.order("desc")
		.take(MAX_LISTINGS_SHOWN);
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

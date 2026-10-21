import type { Infer } from "convex/values";
import { setCodeKey } from "../../../src/lib/yugioh/title-reading";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { MAX_CANDIDATES_PER_DECK } from "./decks";
import {
	type ListingMatchView,
	listingMatchView,
	queueTitleRead,
} from "./matching";
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
/** Most Listings without a single set code shown in a Deck's Listings. */
export const MAX_LISTINGS_WITHOUT_SET_CODE = 50;

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
				titleRead: null,
				matchStatus: "unsure",
				matchedPrintingId: null,
				matchOverridden: false,
			});
			await observe(ctx, listingId, captured, now);
			await queueTitleRead(ctx, listingId, captured.title);
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

/**
 * A Deck's Listings, newest first: those filed under its Printings' set codes
 * (in any language, matched or not), those matched to its Printings by my
 * override, and those with no single set code in the title, which could be
 * for any Deck. Nothing is hidden for being "not a match".
 */
export async function readDeckListings(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<Doc<"yugiohListings">[]> {
	const candidates = await ctx.db
		.query("yugiohCandidatePrintings")
		.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
		.take(MAX_CANDIDATES_PER_DECK);
	const printingIds = [...new Set(candidates.map((c) => c.printingId))];
	const keys = new Set<string>();
	for (const printingId of printingIds) {
		const printing = await ctx.db.get("yugiohPrintings", printingId);
		const key = printing && setCodeKey(printing.setCode);
		if (key) keys.add(key);
	}

	const found = new Map<Id<"yugiohListings">, Doc<"yugiohListings">>();
	function add(listings: Doc<"yugiohListings">[]): void {
		for (const listing of listings) found.set(listing._id, listing);
	}
	for (const key of keys) {
		add(
			await ctx.db
				.query("yugiohListings")
				.withIndex("by_setCodeKey", (q) => q.eq("setCodeKey", key))
				.order("desc")
				.take(MAX_LISTINGS_SHOWN),
		);
	}
	// Listings without a single set code (lots, vague titles, captures from
	// before title reading) could be for any Deck. Fewer of them, so they
	// can't push the Deck's own Listings out of view.
	for (const key of [null, undefined]) {
		add(
			await ctx.db
				.query("yugiohListings")
				.withIndex("by_setCodeKey", (q) => q.eq("setCodeKey", key))
				.order("desc")
				.take(MAX_LISTINGS_WITHOUT_SET_CODE),
		);
	}
	for (const printingId of printingIds) {
		add(
			await ctx.db
				.query("yugiohListings")
				.withIndex("by_matchedPrintingId", (q) =>
					q.eq("matchedPrintingId", printingId),
				)
				.order("desc")
				.take(MAX_LISTINGS_SHOWN),
		);
	}
	return [...found.values()]
		.sort((a, b) => b._creationTime - a._creationTime)
		.slice(0, MAX_LISTINGS_SHOWN);
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
} & ListingMatchView;

/** The stored Listing as the Listings views show it, with its read and match. */
export async function listingView(
	ctx: QueryCtx,
	listing: Doc<"yugiohListings">,
): Promise<ListingView> {
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
		...(await listingMatchView(ctx, listing)),
	};
}

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { saleTime } from "../../src/lib/yugioh/deals";
import { internalMutation, query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Deals from "../model/yugioh/deals";
import { yugiohReferenceValidator } from "../model/yugioh/validators";

/**
 * Each Card's Candidate Printings' eBay and TCGplayer Reference prices in a
 * Deck, kept separate, plus the TCGplayer buy-now floor, at `now` (Unix ms,
 * from the client: a query can't read the clock). A null price means fewer
 * than 3 Qualifying sales in the last 60 days.
 */
export const listReferencePrices = query({
	args: { deckId: v.id("yugiohDecks"), now: v.number() },
	returns: v.array(
		v.object({
			deckCardId: v.id("yugiohDeckCards"),
			printingId: v.id("yugiohPrintings"),
			ebay: yugiohReferenceValidator,
			tcgplayer: yugiohReferenceValidator,
			/** The cheapest current Qualifying TCGplayer Listing's Per-copy price. */
			tcgplayerBuyNow: v.union(v.number(), v.null()),
		}),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Deals.readReferencePrices(ctx, args.deckId, args.now);
	},
});

/**
 * One-off: fills `saleAt` on Listings captured before Reference prices, a page
 * at a time, so their sales count. Run until `isDone`, passing back `cursor`:
 * `npx convex run yugioh/deals:backfillSaleTimes '{"paginationOpts":{"numItems":200,"cursor":null}}'`.
 */
export const backfillSaleTimes = internalMutation({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		updated: v.number(),
		isDone: v.boolean(),
		cursor: v.string(),
	}),
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("yugiohListings")
			.paginate(args.paginationOpts);
		let updated = 0;
		for (const listing of page.page) {
			if (listing.saleAt !== undefined) continue;
			await ctx.db.patch("yugiohListings", listing._id, {
				saleAt: saleTime(listing, listing.lastSeenAt),
			});
			updated++;
		}
		return { updated, isDone: page.isDone, cursor: page.continueCursor };
	},
});

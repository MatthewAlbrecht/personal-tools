// What's new in a Deck: my visits, for "new since my last visit", and how
// many new Listings each Card gets a week.
import { searchedPrintingsByCard } from "../../../src/lib/yugioh/searches";
import { shownMatchStatus } from "../../../src/lib/yugioh/title-reading";
import {
	LISTING_RATE_WINDOW_MS,
	newListingsPerWeek,
	nextVisit,
} from "../../../src/lib/yugioh/whats-new";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/**
 * Records that I looked at a Deck at `now`, continuing or starting a visit.
 * A missing Deck is ignored: there's nothing to be new in.
 */
export async function recordDeckVisit(
	ctx: MutationCtx,
	deckId: Id<"yugiohDecks">,
	now: number,
): Promise<void> {
	if (!(await ctx.db.get("yugiohDecks", deckId))) return;
	const existing = await readVisit(ctx, deckId);
	const visit = nextVisit(existing, now);
	if (existing === null) {
		await ctx.db.insert("yugiohDeckVisits", { deckId, ...visit });
	} else if (
		visit.viewedAt !== existing.viewedAt ||
		visit.newSince !== existing.newSince
	) {
		await ctx.db.patch("yugiohDeckVisits", existing._id, visit);
	}
}

/** Where "new" starts in a Deck this visit; null before my first visit. */
export async function readNewSince(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<number | null> {
	return (await readVisit(ctx, deckId))?.newSince ?? null;
}

async function readVisit(ctx: QueryCtx, deckId: Id<"yugiohDecks">) {
	return await ctx.db
		.query("yugiohDeckVisits")
		.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
		.unique();
}

/** Most Listings one Printing's new-Listing rate reads. */
export const MAX_RATE_LISTINGS = 200;

/**
 * Each Card's new Listings a week: Listings matched to the Printings it
 * searches (its Chosen Printing, or every Candidate while undecided), listed
 * in the last 4 weeks. A match whose new title is still being read doesn't
 * count yet. `candidates` are the Deck's Candidate Printings.
 */
export async function readNewListingRates(
	ctx: QueryCtx,
	cards: ReadonlyArray<Doc<"yugiohDeckCards">>,
	candidates: ReadonlyArray<Doc<"yugiohCandidatePrintings">>,
	now: number,
): Promise<Map<Id<"yugiohDeckCards">, number>> {
	const byPrinting = new Map<
		Id<"yugiohPrintings">,
		Promise<Doc<"yugiohListings">[]>
	>();
	// A Listing listed in the window was first captured in it too, so the
	// read can start at the window. Newest first, so the cap drops the oldest.
	function recentListings(printingId: Id<"yugiohPrintings">) {
		let listings = byPrinting.get(printingId);
		if (!listings) {
			listings = ctx.db
				.query("yugiohListings")
				.withIndex("by_matchedPrintingId", (q) =>
					q
						.eq("matchedPrintingId", printingId)
						.gt("_creationTime", now - LISTING_RATE_WINDOW_MS),
				)
				.order("desc")
				.take(MAX_RATE_LISTINGS)
				.then((found) =>
					found.filter((listing) => shownMatchStatus(listing) === "match"),
				);
			byPrinting.set(printingId, listings);
		}
		return listings;
	}

	const rates = new Map<Id<"yugiohDeckCards">, number>();
	for (const [cardId, printingIds] of searchedPrintingsByCard(
		cards,
		candidates,
	)) {
		const listings = (
			await Promise.all(printingIds.map(recentListings))
		).flat();
		rates.set(cardId, newListingsPerWeek(listings, now));
	}
	return rates;
}

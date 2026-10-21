// Where a captured page's Listings show in the tracker: a Deck's Listings,
// filtered to the Card when the page is about one. The extension's dock links
// there after a capture.
import { v } from "convex/values";
import { normalizeSetCode } from "../../../src/lib/yugioh/deck";
import { missesCopies } from "../../../src/lib/yugioh/searches";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

export const yugiohListingsPageValidator = v.union(
	v.object({
		deckId: v.id("yugiohDecks"),
		cardId: v.union(v.id("yugiohDeckCards"), v.null()),
	}),
	v.null(),
);

export type ListingsPage = {
	deckId: Id<"yugiohDecks">;
	cardId: Id<"yugiohDeckCards"> | null;
} | null;

/** Cards (across Decks) looked at for one Printing. */
const MAX_CARDS_PER_PRINTING = 50;
/** Printings sharing one set code looked at. */
const MAX_PRINTINGS_PER_SET_CODE = 50;

type Wanting = {
	deckId: Id<"yugiohDecks">;
	cardId: Id<"yugiohDeckCards">;
	/** Still missing copies, and searching this Printing. */
	wants: boolean;
};

/**
 * The Listings page for a page about these Printings: the first Deck (oldest
 * first) still missing copies of one of them, else the first Deck with any of
 * them. Its Card when the page is about one Printing, or only one of the
 * Deck's Cards has them. Null when no Deck has them.
 */
export async function listingsPageFor(
	ctx: QueryCtx,
	printingIds: readonly Id<"yugiohPrintings">[],
): Promise<ListingsPage> {
	const found: Wanting[] = [];
	for (const printingId of printingIds) {
		const candidates = await ctx.db
			.query("yugiohCandidatePrintings")
			.withIndex("by_printingId", (q) => q.eq("printingId", printingId))
			.take(MAX_CARDS_PER_PRINTING);
		for (const candidate of candidates) {
			const card = await ctx.db.get("yugiohDeckCards", candidate.deckCardId);
			if (!card) continue;
			const searched =
				card.chosenPrintingId === null || card.chosenPrintingId === printingId;
			found.push({
				deckId: card.deckId,
				cardId: card._id,
				wants: searched && missesCopies(card),
			});
		}
	}
	if (found.length === 0) return null;

	const deckCreated = new Map<Id<"yugiohDecks">, number>();
	for (const { deckId } of found) {
		if (deckCreated.has(deckId)) continue;
		const deck = await ctx.db.get("yugiohDecks", deckId);
		deckCreated.set(deckId, deck?._creationTime ?? Number.POSITIVE_INFINITY);
	}
	const byDeckAge = (a: Wanting, b: Wanting) =>
		(deckCreated.get(a.deckId) ?? 0) - (deckCreated.get(b.deckId) ?? 0);
	const ranked = [
		...found.filter((f) => f.wants).sort(byDeckAge),
		...found.filter((f) => !f.wants).sort(byDeckAge),
	];
	const first = ranked[0];
	if (!first) return null;
	const cards = new Set(
		ranked.filter((f) => f.deckId === first.deckId).map((f) => f.cardId),
	);
	return {
		deckId: first.deckId,
		cardId: printingIds.length === 1 || cards.size === 1 ? first.cardId : null,
	};
}

/** The Printings with these set codes (any rarity). */
export async function printingIdsWithSetCodes(
	ctx: QueryCtx,
	setCodes: readonly string[],
): Promise<Id<"yugiohPrintings">[]> {
	const ids: Id<"yugiohPrintings">[] = [];
	for (const setCode of setCodes) {
		const printings = await ctx.db
			.query("yugiohPrintings")
			.withIndex("by_setCode_and_rarity", (q) =>
				q.eq("setCode", normalizeSetCode(setCode)),
			)
			.take(MAX_PRINTINGS_PER_SET_CODE);
		ids.push(...printings.map((printing) => printing._id));
	}
	return ids;
}

import {
	type Search,
	buildDeckSearches,
} from "../../../src/lib/yugioh/searches";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { readDeck } from "./decks";

/** A Deck's eBay Searches, or null when the Deck doesn't exist. */
export async function readSearches(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<Search[] | null> {
	const deck = await readDeck(ctx, deckId);
	if (!deck) return null;
	return buildDeckSearches(deck.sections.flatMap((group) => group.cards));
}

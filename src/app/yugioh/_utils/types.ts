import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";

export type DeckView = NonNullable<
	FunctionReturnType<typeof api.yugioh.decks.getDeck>
>;
export type DeckSection = DeckView["sections"][number];
export type DeckCard = DeckSection["cards"][number];
export type CandidatePrinting = DeckCard["candidates"][number];
export type DeckSummary = FunctionReturnType<
	typeof api.yugioh.decks.listDecks
>[number];
export type EbaySearch = NonNullable<
	FunctionReturnType<typeof api.yugioh.searches.listSearches>
>[number];

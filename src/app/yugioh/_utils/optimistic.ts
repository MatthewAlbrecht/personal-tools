import type { OptimisticLocalStore } from "convex/browser";
import { type CardOrder, deckProgress, moveToIndex } from "~/lib/yugioh/deck";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { DeckCard, DeckView } from "./types";

/**
 * Applies an optimistic change to every cached getDeck for the Deck: the
 * priced one (with `now`) on the Cards tab and the plain one in the shell.
 */
export function updateCachedDeck(
	store: OptimisticLocalStore,
	deckId: Id<"yugiohDecks">,
	update: (deck: DeckView) => DeckView,
): void {
	for (const { args, value } of store.getAllQueries(api.yugioh.decks.getDeck)) {
		if (args.deckId !== deckId || !value) continue;
		store.setQuery(api.yugioh.decks.getDeck, args, update(value));
	}
}

export type CardPatch = Partial<
	Pick<
		DeckCard,
		| "copiesNeeded"
		| "copiesOwned"
		| "lowestAcceptableCondition"
		| "section"
		| "priority"
	>
>;

/**
 * Applies an updateCard patch to a cached Deck view so steppers respond at
 * once. Mirrors the server: owned never exceeds needed. Cards keep their
 * place until the server's result reorders them.
 */
export function applyCardPatch(
	deck: DeckView,
	deckCardId: DeckCard["_id"],
	patch: CardPatch,
): DeckView {
	const sections = deck.sections.map((group) => ({
		...group,
		cards: group.cards.map((card) => {
			if (card._id !== deckCardId) return card;
			const next = { ...card, ...stripUndefined(patch) };
			if (patch.copiesOwned === undefined) {
				next.copiesOwned = Math.min(next.copiesOwned, next.copiesNeeded);
			}
			return next;
		}),
	}));
	return {
		...deck,
		sections,
		...deckProgress(sections.flatMap((group) => group.cards)),
	};
}

function stripUndefined(patch: CardPatch): CardPatch {
	return Object.fromEntries(
		Object.entries(patch).filter(([, value]) => value !== undefined),
	) as CardPatch;
}

/** Moves a Card within its own Section of a cached Deck view, as moveCard does. */
export function applyCardMove(
	deck: DeckView,
	deckCardId: DeckCard["_id"],
	toIndex: number,
): DeckView {
	return {
		...deck,
		sections: deck.sections.map((group) =>
			group.cards.some((card) => card._id === deckCardId)
				? { ...group, cards: moveToIndex(group.cards, deckCardId, toIndex) }
				: group,
		),
	};
}

/**
 * Flips the toggle at once. The Cards re-sort when the server answers, since
 * Custom positions only live on the server.
 */
export function applyCardOrder(deck: DeckView, cardOrder: CardOrder): DeckView {
	return { ...deck, cardOrder };
}

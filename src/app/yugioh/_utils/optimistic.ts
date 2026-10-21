import { deckProgress } from "~/lib/yugioh/deck";
import type { DeckCard, DeckView } from "./types";

export type CardPatch = Partial<
	Pick<
		DeckCard,
		"copiesNeeded" | "copiesOwned" | "lowestAcceptableCondition" | "section"
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

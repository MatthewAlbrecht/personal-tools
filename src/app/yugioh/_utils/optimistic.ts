import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { dealGrade, percentOfReference } from "~/lib/yugioh/deals";
import { type CardOrder, deckProgress, moveToIndex } from "~/lib/yugioh/deck";
import { listingCopies } from "~/lib/yugioh/listing-edits";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { DeckCard, DeckView, ListingView } from "./types";

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

type ListingsPageView = FunctionReturnType<
	typeof api.yugioh.listings.listListings
>;

/**
 * Applies an optimistic change to a Listing in every cached Listings view
 * that shows it. `update` returns the changed Listing, or null when the
 * change takes it out of the view.
 */
export function updateCachedListing(
	store: OptimisticLocalStore,
	listingId: ListingView["_id"],
	update: (listing: ListingView) => ListingView | null,
): void {
	const query = api.yugioh.listings.listListings;
	for (const { args, value } of store.getAllQueries(query)) {
		if (!value) continue;
		const next = applyListingUpdate(value, listingId, update);
		if (next !== value) store.setQuery(query, args, next);
	}
}

/** `updateCachedListing` on one cached page; the same page when it doesn't show the Listing. */
export function applyListingUpdate(
	page: ListingsPageView,
	listingId: ListingView["_id"],
	update: (listing: ListingView) => ListingView | null,
): ListingsPageView {
	const listing = page.listings.find((l) => l._id === listingId);
	if (!listing) return page;
	const next = update(listing);
	if (next === null) {
		return {
			...page,
			listings: page.listings.filter((l) => l._id !== listingId),
			matching: page.matching - 1,
		};
	}
	return {
		...page,
		listings: page.listings.map((l) => (l._id === listingId ? next : l)),
	};
}

/**
 * A Listing with the Copies I set (null: the title's), repriced as the server
 * will: the landed total over the new Copies, regraded against the same
 * Reference price when it was graded.
 */
export function withCopies(
	listing: ListingView,
	copies: ListingView["copiesOverride"],
): ListingView {
	const next = { ...listing, copiesOverride: copies };
	const price = listing.perCopyPrice;
	if (price === null) return next;
	const lot = listingCopies(next);
	const total = price.price + (price.shipping ?? 0) + price.importFees;
	const perCopy = Math.round((total / lot) * 100) / 100;
	const reference = listing.deal.reference?.price ?? null;
	const graded = listing.deal.percentOfReference !== null && reference !== null;
	const percent = graded ? percentOfReference(perCopy, reference) : null;
	return {
		...next,
		perCopyPrice: { ...price, copies: lot, perCopy },
		deal: graded
			? {
					...listing.deal,
					percentOfReference: percent,
					grade: percent === null ? null : dealGrade(percent),
				}
			: listing.deal,
	};
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

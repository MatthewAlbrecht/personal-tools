// Cost to finish and the buy-now total, per Card, Section and Deck.
// Relative imports only (Convex imports this).

/**
 * A fixed-price Listing counts toward the buy-now total only if a capture
 * has seen it this recently, since one not seen for longer has likely sold
 * or ended unseen. **(assumption)**
 */
export const BUY_NOW_FRESH_DAYS = 7;
export const BUY_NOW_FRESH_MS = BUY_NOW_FRESH_DAYS * 24 * 60 * 60 * 1000;

/** What one Candidate Printing of a Card costs a Copy, in USD. */
export type CandidatePrices = {
	printingId: string;
	/** The lower of its Reference prices; null without enough sales. */
	reference: number | null;
	/** The cheapest Qualifying buy-it-now Per-copy price right now. */
	buyNow: number | null;
};

/** What finishing one Card costs, in USD. */
export type CardCost = {
	remainingCopies: number;
	/** Remaining Copies × Reference price; null when no Reference price. */
	toFinish: number | null;
	/** Remaining Copies × the cheapest buy-it-now Per-copy price; null when none. */
	buyNow: number | null;
};

/**
 * A Card's cost to finish and buy-now total. A Chosen Printing prices the
 * Card alone; an undecided Card takes its cheapest Candidate for each figure.
 * A finished Card costs nothing, priced or not.
 */
export function cardCost(
	card: {
		copiesNeeded: number;
		copiesOwned: number;
		chosenPrintingId: string | null;
	},
	candidates: readonly CandidatePrices[],
): CardCost {
	const remainingCopies = Math.max(card.copiesNeeded - card.copiesOwned, 0);
	if (remainingCopies === 0) {
		return { remainingCopies, toFinish: 0, buyNow: 0 };
	}
	const priced =
		card.chosenPrintingId === null
			? candidates
			: candidates.filter((c) => c.printingId === card.chosenPrintingId);
	const reference = cheapest(priced.map((c) => c.reference));
	const buyNow = cheapest(priced.map((c) => c.buyNow));
	return {
		remainingCopies,
		toFinish: reference === null ? null : cents(remainingCopies * reference),
		buyNow: buyNow === null ? null : cents(remainingCopies * buyNow),
	};
}

/** Section and Deck totals: only the Cards that have a figure add to it. */
export type CostTotals = { toFinish: number; buyNow: number };

export function sumCosts(costs: readonly CardCost[]): CostTotals {
	let toFinish = 0;
	let buyNow = 0;
	for (const cost of costs) {
		toFinish += cost.toFinish ?? 0;
		buyNow += cost.buyNow ?? 0;
	}
	return { toFinish: cents(toFinish), buyNow: cents(buyNow) };
}

/** A Deck's cost to finish and buy-now total, and the Cards they leave out. */
export type DeckCost<Id extends string = string> = CostTotals & {
	/** Cards with Copies still to buy. */
	unfinishedCards: number;
	/** Unfinished Cards without a Reference price: not in `toFinish`. */
	cardsWithoutPrice: Array<{ _id: Id; cardName: string }>;
	/** Unfinished Cards with no buy-it-now Listing: not in `buyNow`. */
	cardsWithoutBuyNow: number;
};

export function deckCost<Id extends string>(
	cards: ReadonlyArray<{ _id: Id; cardName: string; cost: CardCost }>,
): DeckCost<Id> {
	const unfinished = cards.filter((card) => card.cost.remainingCopies > 0);
	return {
		...sumCosts(cards.map((card) => card.cost)),
		unfinishedCards: unfinished.length,
		cardsWithoutPrice: unfinished
			.filter((card) => card.cost.toFinish === null)
			.map((card) => ({ _id: card._id, cardName: card.cardName }))
			.sort((a, b) => a.cardName.localeCompare(b.cardName)),
		cardsWithoutBuyNow: unfinished.filter((card) => card.cost.buyNow === null)
			.length,
	};
}

/**
 * By cost order within a Section's unfinished (or finished) Cards: highest
 * cost to finish first, then Cards without a price, each tie by name.
 */
export function byRemainingCost<T extends { cardName: string }>(
	costOf: (card: T) => number | null,
): (a: T, b: T) => number {
	return (a, b) => {
		const costA = costOf(a);
		const costB = costOf(b);
		if (costA !== costB) {
			if (costA === null) return 1;
			if (costB === null) return -1;
			return costB - costA;
		}
		return a.cardName.localeCompare(b.cardName);
	};
}

function cheapest(prices: ReadonlyArray<number | null>): number | null {
	let lowest: number | null = null;
	for (const price of prices) {
		if (price !== null && (lowest === null || price < lowest)) lowest = price;
	}
	return lowest;
}

function cents(amount: number): number {
	return Math.round(amount * 100) / 100;
}

const wholeDollars = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 0,
});

/** A total or subtotal in whole dollars: `$1,240`. */
export function formatWholeDollars(amount: number): string {
	return wholeDollars.format(amount);
}

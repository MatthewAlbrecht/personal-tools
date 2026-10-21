// Edits I make to a Listing from its row: its condition (set by me, which
// wins over the title's read everywhere) and its rarity (a re-match to
// another Printing under the same set code). Relative imports only (Convex
// imports this).

import { RARITY_NAMES } from "./deck";
import {
	READ_CONDITIONS,
	type ReadCondition,
	type TitleRead,
} from "./title-reading";

/** "Not stated", as a condition I set: the Listing's condition is unknown. */
export const NOT_STATED = "notStated";

/** What I can set a Listing's condition to, in the order the picker offers. */
export const CONDITION_CHOICES = [...READ_CONDITIONS, NOT_STATED] as const;
export type ConditionChoice = (typeof CONDITION_CHOICES)[number];

/** A Listing's condition fields: the AI's read and the one I set, if any. */
type ConditionFields = {
	titleRead?: TitleRead | null;
	/** Missing or null: I haven't set one. */
	conditionOverride?: ConditionChoice | null;
};

/**
 * A Listing's condition: the one I set, else what its title states. Null
 * when unknown. Every rule that looks at condition reads it through here.
 */
export function listingCondition(
	listing: ConditionFields,
): ReadCondition | null {
	const override = listing.conditionOverride ?? null;
	if (override !== null) return override === NOT_STATED ? null : override;
	return listing.titleRead?.condition ?? null;
}

/** Whether I set the Listing's condition myself. */
export function isConditionSetByYou(listing: ConditionFields): boolean {
	return (listing.conditionOverride ?? null) !== null;
}

/** The picker's current choice: the shown condition, or "not stated". */
export function conditionChoice(listing: ConditionFields): ConditionChoice {
	return listingCondition(listing) ?? NOT_STATED;
}

/** A rarity a Listing could be: my Printing of it, or null when I have none. */
export type RarityChoice<PrintingId extends string = string> = {
	rarity: string;
	printingId: PrintingId | null;
	/** The Printing is one the Deck still needs (its Listings show). */
	needed: boolean;
};

type ChoicePrinting<PrintingId extends string> = {
	_id: PrintingId;
	setCode: string;
	rarity: string;
	overloadedRarities: readonly string[];
};

/**
 * The rarities a matched Listing could be, one each, most prized first: my
 * Printings under its set code (any region's), then the Overloaded rarities
 * none of them is. The matched Printing always holds its rarity; otherwise a
 * Printing under the matched set code beats another region's.
 */
export function rarityChoices<PrintingId extends string>(
	printings: ReadonlyArray<ChoicePrinting<PrintingId>>,
	matched: ChoicePrinting<PrintingId>,
	needed: ReadonlySet<string>,
): RarityChoice<PrintingId>[] {
	const byRarity = new Map<string, ChoicePrinting<PrintingId>>();
	const ranked = [
		matched,
		...printings.filter((p) => p.setCode === matched.setCode),
		...printings.filter((p) => p.setCode !== matched.setCode),
	];
	for (const printing of ranked) {
		if (!byRarity.has(printing.rarity)) byRarity.set(printing.rarity, printing);
	}
	const overloaded = new Set<string>();
	for (const printing of ranked) {
		for (const rarity of printing.overloadedRarities) {
			if (!byRarity.has(rarity)) overloaded.add(rarity);
		}
	}
	return [
		...sortByRarity([...byRarity.keys()]).map((rarity) => {
			const printing = byRarity.get(rarity);
			return {
				rarity,
				printingId: printing?._id ?? null,
				needed: printing !== undefined && needed.has(printing._id),
			};
		}),
		...sortByRarity([...overloaded]).map((rarity) => ({
			rarity,
			printingId: null,
			needed: false,
		})),
	];
}

/** Most prized first; rarities I don't know go last, A to Z. */
function sortByRarity(rarities: string[]): string[] {
	function rank(rarity: string): number {
		const index = RARITY_NAMES.indexOf(rarity);
		return index === -1 ? RARITY_NAMES.length : index;
	}
	return rarities.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

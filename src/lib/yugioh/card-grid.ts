// The Deck page's Cards grid: column choice, which image a tile shows, and
// how a Card's Copies read. Pure logic, relative imports only.

import { PRIORITIES, type Priority } from "./deck";

export const GRID_COLUMNS = [2, 3, 4] as const;
export type GridColumns = (typeof GRID_COLUMNS)[number];

export const DEFAULT_GRID_COLUMNS: GridColumns = 3;

/** On a phone, 4 columns leave a tile too narrow for its name and price. */
export const PHONE_MAX_COLUMNS: GridColumns = 3;

/** A saved column choice, or the default for anything unreadable. */
export function parseGridColumns(raw: string | null): GridColumns {
	const parsed = Number(raw);
	return (
		GRID_COLUMNS.find((columns) => columns === parsed) ?? DEFAULT_GRID_COLUMNS
	);
}

/** The columns actually shown: the choice, clamped on a phone. */
export function shownGridColumns(
	chosen: GridColumns,
	phone: boolean,
): GridColumns {
	return phone && chosen > PHONE_MAX_COLUMNS ? PHONE_MAX_COLUMNS : chosen;
}

type TileCandidate = {
	printingId: string;
	tcgplayer: { imageUrl: string | null };
};

/**
 * The Printing a tile names (the Chosen one, or the only Candidate) and the
 * one it pictures: the named Printing's image, else the first Candidate with
 * an image, else the named Printing (or first Candidate) for the placeholder.
 */
export function tilePrintings<C extends TileCandidate>(card: {
	chosenPrintingId: string | null;
	candidates: readonly C[];
}): { shown: C | undefined; pictured: C | undefined } {
	const chosen = card.candidates.find(
		(candidate) => candidate.printingId === card.chosenPrintingId,
	);
	const shown =
		chosen ?? (card.candidates.length === 1 ? card.candidates[0] : undefined);
	const pictured = shown?.tcgplayer.imageUrl
		? shown
		: (card.candidates.find((candidate) => candidate.tcgplayer.imageUrl) ??
			shown ??
			card.candidates[0]);
	return { shown, pictured };
}

/**
 * TCGplayer's 400px product image holds only a 273px-wide card, soft at tile
 * size; its CDN serves the same image at 1000px.
 */
export function largeTcgplayerImage(url: string): string {
	return url.replace(/_in_400x400(\.\w+)$/, "_in_1000x1000$1");
}

/** A Card's Copies as a tile shows them: one pip per Copy needed, filled when owned. */
export function tileCopies(card: {
	copiesOwned: number;
	copiesNeeded: number;
}): { finished: boolean; left: number; pips: boolean[] } {
	return {
		finished: card.copiesOwned >= card.copiesNeeded,
		left: Math.max(card.copiesNeeded - card.copiesOwned, 0),
		pips: Array.from(
			{ length: card.copiesNeeded },
			(_, index) => index < card.copiesOwned,
		),
	};
}

/** The Cards tab's priority filter from its `priority` param; unset is All. */
export function priorityFilterFromParam(
	value: string | null,
): Priority | undefined {
	return PRIORITIES.find((priority) => priority === value);
}

/**
 * Each Section with only its Cards of `priority`, leaving out Sections left
 * empty. Without a priority (All), the Sections as given.
 */
export function sectionsWithPriority<
	S extends { cards: ReadonlyArray<{ priority: Priority }> },
>(sections: S[], priority: Priority | undefined): S[] {
	if (priority === undefined) return sections;
	return sections.flatMap((group) => {
		const cards = group.cards.filter((card) => card.priority === priority);
		return cards.length > 0 ? [{ ...group, cards }] : [];
	});
}

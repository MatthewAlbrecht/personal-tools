// Yu-Gi-Oh domain library: pure logic shared by Convex (relative imports only)
// and the /yugioh UI. Vocabulary follows src/app/yugioh/GLOSSARY.md.

export const SECTIONS = ["main", "extra", "side"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
	main: "Main",
	extra: "Extra",
	side: "Side",
};

/** Best to worst. A Card accepts its Lowest acceptable condition and anything better. */
export const CONDITIONS = [
	"nearMint",
	"lightlyPlayed",
	"moderatelyPlayed",
	"heavilyPlayed",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
	nearMint: "Near Mint",
	lightlyPlayed: "Lightly Played",
	moderatelyPlayed: "Moderately Played",
	heavilyPlayed: "Heavily Played",
};

export const DEFAULT_LOWEST_ACCEPTABLE_CONDITION: Condition = "nearMint";

/** A Deck never runs more than 3 Copies of a Card. */
export const MAX_COPIES_NEEDED = 3;

/** Known rarities, most prized first, with the abbreviation used on mobile rows. */
export const RARITIES = [
	{ name: "Quarter Century Secret Rare", abbreviation: "QCSR" },
	{ name: "Starlight Rare", abbreviation: "StR" },
	{ name: "Prismatic Secret Rare", abbreviation: "PScR" },
	{ name: "Collector's Rare", abbreviation: "CR" },
	{ name: "Ultimate Rare", abbreviation: "UtR" },
	{ name: "Ghost Rare", abbreviation: "GR" },
	{ name: "Secret Rare", abbreviation: "ScR" },
	{ name: "Ultra Rare", abbreviation: "UR" },
	{ name: "Super Rare", abbreviation: "SR" },
	{ name: "Rare", abbreviation: "R" },
	{ name: "Common", abbreviation: "C" },
] as const;

export const RARITY_NAMES: string[] = RARITIES.map((rarity) => rarity.name);

/** Trims and uppercases a set code: " ra01-en008 " → "RA01-EN008". */
export function normalizeSetCode(setCode: string): string {
	return setCode.trim().toUpperCase();
}

/**
 * Collapses whitespace and, when the rarity is a known one (any casing, or its
 * abbreviation), returns its canonical name. Unknown rarities are title-cased.
 */
export function normalizeRarity(rarity: string): string {
	const cleaned = rarity.trim().replace(/\s+/g, " ");
	const lower = cleaned.toLowerCase();
	const known = RARITIES.find(
		(entry) =>
			entry.name.toLowerCase() === lower ||
			entry.abbreviation.toLowerCase() === lower,
	);
	if (known) return known.name;
	return cleaned
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

/** "Quarter Century Secret Rare" → "QCSR"; unknown rarities keep their full name. */
export function rarityAbbreviation(rarity: string): string {
	return (
		RARITIES.find((entry) => entry.name === rarity)?.abbreviation ?? rarity
	);
}

/** Suggestion filter: any part of the name, or the start of its abbreviation ("qc" → QCSR). */
export function rarityMatchesQuery(rarity: string, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === "") return true;
	if (rarity.toLowerCase().includes(q)) return true;
	return rarityAbbreviation(rarity).toLowerCase().startsWith(q);
}

/**
 * Known rarities (plus `extra`) matching a query, best first: exact
 * abbreviation, then name prefix, then any other match. Ties keep prize order.
 */
export function suggestRarities(
	query: string,
	extra: readonly string[] = [],
): string[] {
	const q = query.trim().toLowerCase();
	const all = [...new Set([...RARITY_NAMES, ...extra])];
	function rank(rarity: string): number {
		if (rarityAbbreviation(rarity).toLowerCase() === q) return 0;
		if (rarity.toLowerCase().startsWith(q)) return 1;
		return 2;
	}
	return all
		.filter((rarity) => rarityMatchesQuery(rarity, q))
		.map((rarity, index) => ({ rarity, index, rank: rank(rarity) }))
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((entry) => entry.rarity);
}

/**
 * Normalizes Overloaded rarities: canonical names, de-duplicated, without the
 * Printing's own rarity.
 */
export function normalizeOverloadedRarities(
	rarities: readonly string[],
	ownRarity: string,
): string[] {
	const own = normalizeRarity(ownRarity);
	const result: string[] = [];
	for (const rarity of rarities) {
		const normalized = normalizeRarity(rarity);
		if (normalized === "" || normalized === own) continue;
		if (!result.includes(normalized)) result.push(normalized);
	}
	return result;
}

export type DeckCardProgress = { copiesNeeded: number; copiesOwned: number };

export function isCardFinished(card: DeckCardProgress): boolean {
	return card.copiesOwned >= card.copiesNeeded;
}

/** Copies owned / needed for a Deck. Extra owned Copies of one Card never count toward another. */
export function deckProgress(cards: readonly DeckCardProgress[]): {
	copiesOwned: number;
	copiesNeeded: number;
} {
	let copiesOwned = 0;
	let copiesNeeded = 0;
	for (const card of cards) {
		copiesNeeded += card.copiesNeeded;
		copiesOwned += Math.min(card.copiesOwned, card.copiesNeeded);
	}
	return { copiesOwned, copiesNeeded };
}

/**
 * Groups Cards into Sections (Main, Extra, Side; empty ones left out). Within
 * a Section, unfinished Cards come first, then finished ones; each group
 * keeps the order given by `compare` (by name until prices exist).
 */
export function groupCardsBySection<
	T extends DeckCardProgress & { section: Section; cardName: string },
>(
	cards: readonly T[],
	compare: (a: T, b: T) => number = (a, b) =>
		a.cardName.localeCompare(b.cardName),
): Array<{ section: Section; cards: T[] }> {
	return SECTIONS.map((section) => {
		const inSection = cards.filter((card) => card.section === section);
		const unfinished = inSection
			.filter((card) => !isCardFinished(card))
			.sort(compare);
		const finished = inSection
			.filter((card) => isCardFinished(card))
			.sort(compare);
		return { section, cards: [...unfinished, ...finished] };
	}).filter((group) => group.cards.length > 0);
}

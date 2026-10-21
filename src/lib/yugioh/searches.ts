// eBay Search packing and links. Pure logic shared by Convex (relative imports
// only) and the /yugioh UI. Formats: docs/yugioh/references/tcgplayer-ebay-links.md.

import { findSetCodes } from "./title-reading";

/** eBay takes about 8 set codes in one `(A,B,…)` Search. */
export const MAX_SET_CODES_PER_SEARCH = 8;

export type SearchPrinting = {
	cardName: string;
	setCode: string;
	rarity: string;
};

export type SearchableCard = {
	cardName: string;
	copiesNeeded: number;
	copiesOwned: number;
	chosenPrintingId: string | null;
	candidates: Array<{
		printingId: string;
		setCode: string;
		rarity: string;
		overloadedRarities: string[];
	}>;
};

export type Search = {
	setCodes: string[];
	/** Exclusion words, without the leading minus (e.g. "super"). */
	exclusions: string[];
	/** The Printings this Search looks for, by set code then Card name. */
	printings: SearchPrinting[];
	/** The eBay query its pages run: "(RA01-EN008,RA01-EN024) -super". */
	keywords: string;
	newlyListedUrl: string;
	soldUrl: string;
};

/** A Card still missing copies is searched; one with every copy owned is done. */
export function missesCopies(card: {
	copiesNeeded: number;
	copiesOwned: number;
}): boolean {
	return card.copiesOwned < card.copiesNeeded;
}

/**
 * The Candidates a Card is searched for: its Chosen Printing, or every
 * Candidate while it's undecided.
 */
export function searchedCandidates<
	Candidate extends { printingId: string },
>(card: {
	chosenPrintingId: string | null;
	candidates: readonly Candidate[];
}): Candidate[] {
	if (card.chosenPrintingId === null) return [...card.candidates];
	return card.candidates.filter(
		(candidate) => candidate.printingId === card.chosenPrintingId,
	);
}

/**
 * The Printings each Card searches, by Card ID, from a Deck's Cards and its
 * Candidate Printings (each naming its Card).
 */
export function searchedPrintingsByCard<
	CardId extends string,
	PrintingId extends string,
>(
	cards: ReadonlyArray<{ _id: CardId; chosenPrintingId: PrintingId | null }>,
	candidates: ReadonlyArray<{ deckCardId: CardId; printingId: PrintingId }>,
): Map<CardId, PrintingId[]> {
	return new Map(
		cards.map((card) => [
			card._id,
			searchedCandidates({
				chosenPrintingId: card.chosenPrintingId,
				candidates: candidates.filter((c) => c.deckCardId === card._id),
			}).map((c) => c.printingId),
		]),
	);
}

/**
 * Packs a Deck's Printings into eBay Searches of at most 8 set codes.
 *
 * - Only Cards still missing copies are searched; a done Card gets none.
 * - A Card with a Chosen Printing searches only that one; an undecided Card
 *   searches all its Candidates.
 * - An Overloaded set code gets one Exclusion per other rarity printed under
 *   it. Set codes share a Search when the union of their Exclusions drops none
 *   of the Search's Printings (no word of a wanted rarity or Card name), and
 *   a Search leaves out that union.
 * - Packed to few Searches, deterministically (`packSearches`); set codes
 *   inside a Search are sorted.
 */
export function buildDeckSearches(cards: readonly SearchableCard[]): Search[] {
	const byCode = new Map<string, SearchPrinting[]>();
	const otherRaritiesByCode = new Map<string, Set<string>>();
	for (const card of cards.filter(missesCopies)) {
		for (const candidate of searchedCandidates(card)) {
			const printings = byCode.get(candidate.setCode) ?? [];
			// The same Printing on two Cards (Main and Side) is searched once.
			if (!printings.some((p) => p.rarity === candidate.rarity)) {
				printings.push({
					cardName: card.cardName,
					setCode: candidate.setCode,
					rarity: candidate.rarity,
				});
			}
			byCode.set(candidate.setCode, printings);
			const others = otherRaritiesByCode.get(candidate.setCode) ?? new Set();
			for (const rarity of candidate.overloadedRarities) others.add(rarity);
			otherRaritiesByCode.set(candidate.setCode, others);
		}
	}

	return packSearches(
		[...byCode].map(([setCode, printings]) => ({
			setCode,
			exclusions: exclusionsFor(
				[...(otherRaritiesByCode.get(setCode) ?? [])],
				printings,
			),
			protectedWords: protectedWordsOf(printings),
		})),
	).map((bin) =>
		toSearch(bin.setCodes.sort(), [...bin.exclusions].sort(), byCode),
	);
}

type PackedSetCode = {
	setCode: string;
	exclusions: string[];
	protectedWords: Set<string>;
};

type Bin = {
	setCodes: string[];
	exclusions: Set<string>;
	protectedWords: Set<string>;
};

/**
 * First-fit decreasing: set codes with the most Exclusions first (then by
 * Exclusion words, then set code), each into the first Search with room whose
 * Exclusions and its own spare each other's Printings, else a new Search.
 * Depends only on the set codes and their Printings, never on Card order, so
 * an unchanged Deck gets the same Searches in the same order every run. A
 * Deck change can shift set codes between later Searches; anything keyed to
 * a Search reads its set codes back from the URL, not its number.
 */
function packSearches(setCodes: readonly PackedSetCode[]): Bin[] {
	const ordered = [...setCodes].sort(
		(a, b) =>
			b.exclusions.length - a.exclusions.length ||
			a.exclusions.join(" ").localeCompare(b.exclusions.join(" ")) ||
			a.setCode.localeCompare(b.setCode),
	);
	const bins: Bin[] = [];
	for (const code of ordered) {
		const fits = (bin: Bin): boolean =>
			bin.setCodes.length < MAX_SET_CODES_PER_SEARCH &&
			!code.exclusions.some((word) => bin.protectedWords.has(word)) &&
			![...bin.exclusions].some((word) => code.protectedWords.has(word));
		const bin = bins.find(fits);
		if (bin) {
			bin.setCodes.push(code.setCode);
			for (const word of code.exclusions) bin.exclusions.add(word);
			for (const word of code.protectedWords) bin.protectedWords.add(word);
		} else {
			bins.push({
				setCodes: [code.setCode],
				exclusions: new Set(code.exclusions),
				protectedWords: new Set(code.protectedWords),
			});
		}
	}
	return bins;
}

/**
 * The Exclusion word for a rarity: its first distinctive word ("Super Rare" →
 * "super", "Collector's Rare" → "collector", "Quarter Century Secret Rare" →
 * "quarter").
 */
export function exclusionWord(rarity: string): string {
	return words(rarity)[0] ?? "";
}

/**
 * Exclusions for one set code: a word per unwanted rarity, minus any word the
 * wanted rarities or Card names under that code contain (excluding "-secret"
 * would also drop Quarter Century Secret Rare; "-super" would drop Super
 * Polymerization). Sorted and de-duplicated.
 */
function exclusionsFor(
	otherRarities: readonly string[],
	wanted: readonly SearchPrinting[],
): string[] {
	const wantedRarities = new Set(wanted.map((printing) => printing.rarity));
	const protectedWords = protectedWordsOf(wanted);
	const exclusions = new Set<string>();
	for (const rarity of otherRarities) {
		if (wantedRarities.has(rarity)) continue;
		const word = exclusionWord(rarity);
		if (word !== "" && !protectedWords.has(word)) exclusions.add(word);
	}
	return [...exclusions].sort();
}

/** Words no Exclusion may be: the wanted rarities' and Card names'. */
function protectedWordsOf(wanted: readonly SearchPrinting[]): Set<string> {
	return new Set(
		wanted.flatMap((printing) => [
			...words(printing.rarity),
			...words(printing.cardName),
		]),
	);
}

/** Lowercase words, without possessive "'s": "Collector's Rare" → ["collector", "rare"]. */
function words(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/['’]s\b/g, "")
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== "");
}

function toSearch(
	setCodes: string[],
	exclusions: string[],
	byCode: ReadonlyMap<string, SearchPrinting[]>,
): Search {
	const keywords = searchKeywords(setCodes, exclusions);
	return {
		setCodes,
		exclusions,
		printings: setCodes.flatMap((code) => byCode.get(code) ?? []),
		keywords,
		newlyListedUrl: ebayNewlyListedUrl(keywords),
		soldUrl: ebaySoldUrl(keywords),
	};
}

/** eBay's OR form, then Exclusions: "(RA01-EN008,RA01-EN024) -super -ultra". */
export function searchKeywords(
	setCodes: readonly string[],
	exclusions: readonly string[],
): string {
	const codes = setCodes.length === 1 ? setCodes[0] : `(${setCodes.join(",")})`;
	return [codes, ...exclusions.map((word) => `-${word}`)].join(" ");
}

const EBAY_SEARCH_URL = "https://www.ebay.com/sch/i.html";

/**
 * The set codes an eBay Search URL looks for, uppercased, from its keywords
 * (`_nkw`); none when it isn't a URL or names no set code.
 */
export function ebaySearchSetCodes(url: string): string[] {
	let keywords: string | null;
	try {
		keywords = new URL(url).searchParams.get("_nkw");
	} catch {
		return [];
	}
	return keywords ? findSetCodes(keywords) : [];
}

/** Newest Listings first (`_sop=10`, "Time: newly listed"). */
export function ebayNewlyListedUrl(keywords: string): string {
	const params = new URLSearchParams({ _nkw: keywords, _sop: "10" });
	return `${EBAY_SEARCH_URL}?${params.toString()}`;
}

/**
 * Running auctions only, ending soonest first (`LH_Auction=1`, `_sop=1`):
 * the refresh page before an auction's push (ticket 16).
 */
export function ebayEndingSoonUrl(keywords: string): string {
	const params = new URLSearchParams({
		_nkw: keywords,
		LH_Auction: "1",
		_sop: "1",
	});
	return `${EBAY_SEARCH_URL}?${params.toString()}`;
}

/** Sold and completed Listings, most recently ended first (`_sop=13`). */
export function ebaySoldUrl(keywords: string): string {
	const params = new URLSearchParams({
		_nkw: keywords,
		LH_Sold: "1",
		LH_Complete: "1",
		_sop: "13",
	});
	return `${EBAY_SEARCH_URL}?${params.toString()}`;
}

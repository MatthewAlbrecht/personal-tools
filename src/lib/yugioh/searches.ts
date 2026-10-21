// eBay Search packing and links. Pure logic shared by Convex (relative imports
// only) and the /yugioh UI. Formats: docs/yugioh/references/tcgplayer-ebay-links.md.

/** eBay takes about 8 set codes in one `(A,B,…)` Search. */
export const MAX_SET_CODES_PER_SEARCH = 8;

export type SearchPrinting = {
	cardName: string;
	setCode: string;
	rarity: string;
};

export type SearchableCard = {
	cardName: string;
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
	newlyListedUrl: string;
	soldUrl: string;
};

/**
 * Packs a Deck's Printings into eBay Searches of at most 8 set codes.
 *
 * - A Card with a Chosen Printing searches only that one; an undecided Card
 *   searches all its Candidates.
 * - An Overloaded set code gets one Exclusion per other rarity printed under
 *   it, and a Search only holds set codes needing exactly the same Exclusions.
 * - Searches come fewest Exclusions first, then by set code.
 */
export function buildDeckSearches(cards: readonly SearchableCard[]): Search[] {
	const byCode = new Map<string, SearchPrinting[]>();
	const otherRaritiesByCode = new Map<string, Set<string>>();
	for (const card of cards) {
		const searched =
			card.chosenPrintingId === null
				? card.candidates
				: card.candidates.filter(
						(candidate) => candidate.printingId === card.chosenPrintingId,
					);
		for (const candidate of searched) {
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

	// Keyed by the joined words so identical Exclusion sets share a group.
	const groups = new Map<string, { exclusions: string[]; codes: string[] }>();
	for (const [setCode, printings] of byCode) {
		const exclusions = exclusionsFor(
			[...(otherRaritiesByCode.get(setCode) ?? [])],
			printings,
		);
		const key = exclusions.join(" ");
		const group = groups.get(key) ?? { exclusions, codes: [] };
		group.codes.push(setCode);
		groups.set(key, group);
	}

	return [...groups.entries()]
		.sort(
			([keyA, a], [keyB, b]) =>
				a.exclusions.length - b.exclusions.length || keyA.localeCompare(keyB),
		)
		.flatMap(([, { exclusions, codes }]) =>
			chunk(codes.sort(), MAX_SET_CODES_PER_SEARCH).map((group) =>
				toSearch(group, exclusions, byCode),
			),
		);
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
	const protectedWords = new Set(
		wanted.flatMap((printing) => [
			...words(printing.rarity),
			...words(printing.cardName),
		]),
	);
	const exclusions = new Set<string>();
	for (const rarity of otherRarities) {
		if (wantedRarities.has(rarity)) continue;
		const word = exclusionWord(rarity);
		if (word !== "" && !protectedWords.has(word)) exclusions.add(word);
	}
	return [...exclusions].sort();
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
		newlyListedUrl: ebayNewlyListedUrl(keywords),
		soldUrl: ebaySoldUrl(keywords),
	};
}

/** Splits into as few chunks of at most `size` as possible, sized evenly. */
function chunk<T>(items: readonly T[], size: number): T[][] {
	const count = Math.ceil(items.length / size);
	const chunks: T[][] = [];
	for (let i = 0; i < count; i++) {
		const start = Math.round((i * items.length) / count);
		const end = Math.round(((i + 1) * items.length) / count);
		chunks.push(items.slice(start, end));
	}
	return chunks;
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

/** Newest Listings first (`_sop=10`, "Time: newly listed"). */
export function ebayNewlyListedUrl(keywords: string): string {
	const params = new URLSearchParams({ _nkw: keywords, _sop: "10" });
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

import { ConvexError } from "convex/values";
import type { Condition, Section } from "../../../src/lib/yugioh/deck";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	MAX_CANDIDATES_PER_CARD,
	MAX_CARDS_PER_DECK,
	type PrintingInput,
	addCandidatePrinting,
	addCard,
	cleanName,
	createDeck,
	findOrCreatePrinting,
	getDeckCardOrThrow,
	listCandidates,
	listDeckCards,
	nameKey,
	removeCard,
	updateCard,
} from "./decks";

export type SeedCard = {
	cardName: string;
	section: Section;
	copiesNeeded: number;
	/** Left as saved when omitted (0 for a new Card). */
	copiesOwned?: number;
	/** Left as saved when omitted (Near Mint for a new Card). */
	lowestAcceptableCondition?: Condition;
	candidates: PrintingInput[];
};

export type SeedDeck = {
	name: string;
	cards: SeedCard[];
	/**
	 * Also remove Cards and Candidate Printings the Deck has but the list
	 * doesn't. Off by default: they're reported back instead.
	 */
	removeUnlisted?: boolean;
};

export type UnlistedCard = { cardName: string; section: Section };
export type UnlistedCandidate = UnlistedCard & {
	setCode: string;
	rarity: string;
};

export type SeedReport = {
	deckId: Id<"yugiohDecks">;
	deckCreated: boolean;
	cardsAdded: number;
	cardsChanged: number;
	candidatesAdded: number;
	cardsRemoved: number;
	candidatesRemoved: number;
	/** In the Deck but not the list, and kept (removeUnlisted was off). */
	unlistedCards: UnlistedCard[];
	unlistedCandidates: UnlistedCandidate[];
};

function cardKey(cardName: string, section: Section): string {
	return `${section}:${nameKey(cardName)}`;
}

/** Rejects a malformed list before anything is written. */
function checkSeedDeck(seed: SeedDeck): void {
	if (seed.cards.length > MAX_CARDS_PER_DECK) {
		throw new ConvexError(
			`A Deck holds up to ${MAX_CARDS_PER_DECK} Cards; the list has ${seed.cards.length}.`,
		);
	}
	const seen = new Set<string>();
	for (const card of seed.cards) {
		const key = cardKey(card.cardName, card.section);
		if (seen.has(key)) {
			throw new ConvexError(
				`${card.cardName} is listed twice in ${card.section}. Merge it into one entry with the total copies.`,
			);
		}
		seen.add(key);
		if (card.candidates.length === 0) {
			throw new ConvexError(
				`${card.cardName} needs at least one Candidate Printing.`,
			);
		}
		if (card.candidates.length > MAX_CANDIDATES_PER_CARD) {
			throw new ConvexError(
				`${card.cardName} has more than ${MAX_CANDIDATES_PER_CARD} Candidate Printings.`,
			);
		}
	}
}

async function findOrCreateDeckByName(
	ctx: MutationCtx,
	name: string,
): Promise<{ deckId: Id<"yugiohDecks">; created: boolean }> {
	const deckName = cleanName(name, "Deck name");
	const matches = await ctx.db
		.query("yugiohDecks")
		.withIndex("by_name", (q) => q.eq("name", deckName))
		.take(2);
	if (matches.length > 1) {
		throw new ConvexError(
			`More than one Deck is named ${deckName}. Rename or remove the extras first.`,
		);
	}
	const [existing] = matches;
	if (existing) return { deckId: existing._id, created: false };
	return { deckId: await createDeck(ctx, deckName), created: true };
}

/**
 * Loads a whole Deck from a list, matching the Deck by name and each Card by
 * name + Section (or by name alone when it moved Section). Safe to re-run:
 * Cards and Candidates already saved are kept and updated, Printings are
 * shared, and the mutation is all-or-nothing.
 */
export async function loadDeck(
	ctx: MutationCtx,
	seed: SeedDeck,
): Promise<SeedReport> {
	checkSeedDeck(seed);
	const { deckId, created } = await findOrCreateDeckByName(ctx, seed.name);
	const report: SeedReport = {
		deckId,
		deckCreated: created,
		cardsAdded: 0,
		cardsChanged: 0,
		candidatesAdded: 0,
		cardsRemoved: 0,
		candidatesRemoved: 0,
		unlistedCards: [],
		unlistedCandidates: [],
	};

	const { matches, unmatched } = matchSavedCards(
		seed.cards,
		await listDeckCards(ctx, deckId),
	);
	// Unlisted Cards go first, so removing them frees room for new ones.
	for (const card of unmatched) {
		if (seed.removeUnlisted) {
			await removeCard(ctx, card._id);
			report.cardsRemoved++;
		} else {
			report.unlistedCards.push({
				cardName: card.cardName,
				section: card.section,
			});
		}
	}

	for (const [index, card] of seed.cards.entries()) {
		const existing = matches.get(index);
		const deckCardId = existing
			? await updateSavedCard(ctx, existing, card, report)
			: await addListedCard(ctx, deckId, card, report);
		await syncCandidates(ctx, deckCardId, card, seed.removeUnlisted, report);
	}
	return report;
}

/**
 * Pairs listed Cards with saved ones: first by name + Section, then a leftover
 * saved Card with the same name, which means the Card moved Section.
 */
function matchSavedCards(
	listed: readonly SeedCard[],
	saved: ReadonlyArray<Doc<"yugiohDeckCards">>,
): {
	matches: Map<number, Doc<"yugiohDeckCards">>;
	unmatched: Array<Doc<"yugiohDeckCards">>;
} {
	const matches = new Map<number, Doc<"yugiohDeckCards">>();
	let unmatched = [...saved];
	function claim(
		isMatch: (card: SeedCard, savedCard: Doc<"yugiohDeckCards">) => boolean,
	): void {
		for (const [index, card] of listed.entries()) {
			if (matches.has(index)) continue;
			const found = unmatched.find((savedCard) => isMatch(card, savedCard));
			if (!found) continue;
			matches.set(index, found);
			unmatched = unmatched.filter((savedCard) => savedCard !== found);
		}
	}
	claim(
		(card, savedCard) =>
			cardKey(card.cardName, card.section) ===
			cardKey(savedCard.cardName, savedCard.section),
	);
	claim(
		(card, savedCard) => nameKey(card.cardName) === nameKey(savedCard.cardName),
	);
	return { matches, unmatched };
}

async function addListedCard(
	ctx: MutationCtx,
	deckId: Id<"yugiohDecks">,
	card: SeedCard,
	report: SeedReport,
): Promise<Id<"yugiohDeckCards">> {
	// checkSeedDeck guarantees one; this narrows the type.
	const [first] = card.candidates;
	if (!first) throw new ConvexError(`${card.cardName} has no Candidates.`);
	const deckCardId = await addCard(ctx, deckId, {
		cardName: card.cardName,
		section: card.section,
		copiesNeeded: card.copiesNeeded,
		copiesOwned: card.copiesOwned,
		lowestAcceptableCondition: card.lowestAcceptableCondition,
		...first,
	});
	report.cardsAdded++;
	report.candidatesAdded++;
	return deckCardId;
}

async function updateSavedCard(
	ctx: MutationCtx,
	saved: Doc<"yugiohDeckCards">,
	card: SeedCard,
	report: SeedReport,
): Promise<Id<"yugiohDeckCards">> {
	// An omitted Copies owned keeps the saved count, lowered to fit if needed.
	const copiesOwned =
		card.copiesOwned ?? Math.min(saved.copiesOwned, card.copiesNeeded);
	const condition =
		card.lowestAcceptableCondition ?? saved.lowestAcceptableCondition;
	if (
		saved.section !== card.section ||
		saved.copiesNeeded !== card.copiesNeeded ||
		saved.copiesOwned !== copiesOwned ||
		saved.lowestAcceptableCondition !== condition
	) {
		await updateCard(ctx, saved._id, {
			section: card.section,
			copiesNeeded: card.copiesNeeded,
			copiesOwned,
			lowestAcceptableCondition: condition,
		});
		report.cardsChanged++;
	}
	return saved._id;
}

/**
 * Makes the Card's Candidates include every listed Printing. Unlisted ones
 * are reported, or removed first with removeUnlisted so a full Card can swap
 * them.
 */
async function syncCandidates(
	ctx: MutationCtx,
	deckCardId: Id<"yugiohDeckCards">,
	card: SeedCard,
	removeUnlisted: boolean | undefined,
	report: SeedReport,
): Promise<void> {
	const saved = await getDeckCardOrThrow(ctx, deckCardId);
	const wanted = new Map<Id<"yugiohPrintings">, PrintingInput>();
	for (const candidate of card.candidates) {
		// Also merges new Overloaded rarities into an already-saved Printing.
		const printingId = await findOrCreatePrinting(
			ctx,
			saved.cardName,
			candidate,
		);
		wanted.set(printingId, candidate);
	}
	const current = await listCandidates(ctx, deckCardId);
	for (const candidate of current) {
		if (wanted.has(candidate.printingId)) continue;
		if (removeUnlisted) {
			// Direct delete: the Card may briefly have no Candidates until the
			// listed ones are added below.
			await ctx.db.delete("yugiohCandidatePrintings", candidate._id);
			report.candidatesRemoved++;
			continue;
		}
		const printing = await ctx.db.get("yugiohPrintings", candidate.printingId);
		if (!printing) continue;
		report.unlistedCandidates.push({
			cardName: saved.cardName,
			section: saved.section,
			setCode: printing.setCode,
			rarity: printing.rarity,
		});
	}
	if (
		removeUnlisted &&
		saved.chosenPrintingId !== null &&
		!wanted.has(saved.chosenPrintingId)
	) {
		await ctx.db.patch("yugiohDeckCards", deckCardId, {
			chosenPrintingId: null,
		});
	}
	const currentIds = new Set(current.map((candidate) => candidate.printingId));
	for (const [printingId, candidate] of wanted) {
		if (currentIds.has(printingId)) continue;
		await addCandidatePrinting(ctx, deckCardId, candidate);
		report.candidatesAdded++;
	}
}

import { ConvexError } from "convex/values";
import {
	type Condition,
	DEFAULT_LOWEST_ACCEPTABLE_CONDITION,
	MAX_COPIES_NEEDED,
	type Section,
	deckProgress,
	groupCardsBySection,
	normalizeOverloadedRarities,
	normalizeRarity,
	normalizeSetCode,
} from "../../../src/lib/yugioh/deck";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { type TcgplayerView, tcgplayerView } from "./tcgplayer";

/** Bounds every Yu-Gi-Oh read. A Deck is at most 60 Main + 15 Extra + 15 Side Cards. */
export const MAX_DECKS = 50;
export const MAX_CARDS_PER_DECK = 150;
export const MAX_CANDIDATES_PER_CARD = 10;
export const MAX_CANDIDATES_PER_DECK =
	MAX_CARDS_PER_DECK * MAX_CANDIDATES_PER_CARD;

export function cleanName(name: string, label: string): string {
	const trimmed = name.trim().replace(/\s+/g, " ");
	if (trimmed === "") throw new ConvexError(`${label} can't be empty.`);
	if (trimmed.length > 200) throw new ConvexError(`${label} is too long.`);
	return trimmed;
}

function nameKey(name: string): string {
	return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function createDeck(
	ctx: MutationCtx,
	name: string,
): Promise<Id<"yugiohDecks">> {
	return await ctx.db.insert("yugiohDecks", {
		name: cleanName(name, "Deck name"),
	});
}

export type DeckSummary = {
	_id: Id<"yugiohDecks">;
	name: string;
	cardCount: number;
	copiesOwned: number;
	copiesNeeded: number;
};

export async function listDeckSummaries(ctx: QueryCtx): Promise<DeckSummary[]> {
	const decks = await ctx.db.query("yugiohDecks").order("desc").take(MAX_DECKS);
	return await Promise.all(
		decks.map(async (deck) => {
			const cards = await ctx.db
				.query("yugiohDeckCards")
				.withIndex("by_deckId", (q) => q.eq("deckId", deck._id))
				.take(MAX_CARDS_PER_DECK);
			return {
				_id: deck._id,
				name: deck.name,
				cardCount: cards.length,
				...deckProgress(cards),
			};
		}),
	);
}

export type PrintingInput = {
	setCode: string;
	rarity: string;
	overloadedRarities: string[];
};

/**
 * Printings are shared across Decks: the same set code + rarity always
 * resolves to one row. Overloaded rarities learned later are merged in.
 */
export async function findOrCreatePrinting(
	ctx: MutationCtx,
	cardName: string,
	input: PrintingInput,
): Promise<Id<"yugiohPrintings">> {
	const setCode = normalizeSetCode(input.setCode);
	if (setCode === "") throw new ConvexError("Set code can't be empty.");
	if (setCode.length > 40) throw new ConvexError("Set code is too long.");
	const rarity = cleanName(normalizeRarity(input.rarity), "Rarity");
	const overloadedRarities = normalizeOverloadedRarities(
		input.overloadedRarities,
		rarity,
	);
	const existing = await ctx.db
		.query("yugiohPrintings")
		.withIndex("by_setCode_and_rarity", (q) =>
			q.eq("setCode", setCode).eq("rarity", rarity),
		)
		.unique();
	if (existing) {
		if (nameKey(existing.cardName) !== nameKey(cardName)) {
			throw new ConvexError(
				`${setCode} ${rarity} is already saved as ${existing.cardName}. Check the set code, or use that Card name.`,
			);
		}
		const merged = normalizeOverloadedRarities(
			[...existing.overloadedRarities, ...overloadedRarities],
			rarity,
		);
		if (merged.length !== existing.overloadedRarities.length) {
			await ctx.db.patch("yugiohPrintings", existing._id, {
				overloadedRarities: merged,
			});
		}
		return existing._id;
	}
	const printingId = await ctx.db.insert("yugiohPrintings", {
		cardName,
		setCode,
		rarity,
		overloadedRarities,
		tcgplayerStatus: "searching",
		tcgplayerProductUrl: null,
		tcgplayerImageUrl: null,
	});
	// A new Printing gets its TCGplayer product page looked up once, now.
	await ctx.scheduler.runAfter(0, internal.yugioh.tcgplayer.lookUpProduct, {
		printingId,
	});
	return printingId;
}

function checkCopiesNeeded(copiesNeeded: number): void {
	if (
		!Number.isInteger(copiesNeeded) ||
		copiesNeeded < 1 ||
		copiesNeeded > MAX_COPIES_NEEDED
	) {
		throw new ConvexError(
			`Copies needed must be a whole number from 1 to ${MAX_COPIES_NEEDED}.`,
		);
	}
}

export async function getDeckOrThrow(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<Doc<"yugiohDecks">> {
	const deck = await ctx.db.get("yugiohDecks", deckId);
	if (!deck) throw new ConvexError("This Deck doesn't exist.");
	return deck;
}

export async function getDeckCardOrThrow(
	ctx: QueryCtx,
	deckCardId: Id<"yugiohDeckCards">,
): Promise<Doc<"yugiohDeckCards">> {
	const card = await ctx.db.get("yugiohDeckCards", deckCardId);
	if (!card) throw new ConvexError("This Card isn't in the Deck anymore.");
	return card;
}

export type AddCardInput = PrintingInput & {
	cardName: string;
	section: Section;
	copiesNeeded: number;
	copiesOwned?: number;
	lowestAcceptableCondition?: Condition;
};

/** Adds a Card to a Deck with its first Candidate Printing. */
export async function addCard(
	ctx: MutationCtx,
	deckId: Id<"yugiohDecks">,
	input: AddCardInput,
): Promise<Id<"yugiohDeckCards">> {
	await getDeckOrThrow(ctx, deckId);
	const cardName = cleanName(input.cardName, "Card name");
	checkCopiesNeeded(input.copiesNeeded);
	const copiesOwned = input.copiesOwned ?? 0;
	checkCopiesOwned(copiesOwned, input.copiesNeeded);
	const existing = await ctx.db
		.query("yugiohDeckCards")
		.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
		.take(MAX_CARDS_PER_DECK);
	if (existing.length >= MAX_CARDS_PER_DECK) {
		throw new ConvexError("This Deck is full.");
	}
	const printingId = await findOrCreatePrinting(ctx, cardName, input);
	const deckCardId = await ctx.db.insert("yugiohDeckCards", {
		deckId,
		cardName,
		section: input.section,
		copiesNeeded: input.copiesNeeded,
		copiesOwned,
		lowestAcceptableCondition:
			input.lowestAcceptableCondition ?? DEFAULT_LOWEST_ACCEPTABLE_CONDITION,
		chosenPrintingId: null,
	});
	await ctx.db.insert("yugiohCandidatePrintings", {
		deckId,
		deckCardId,
		printingId,
	});
	return deckCardId;
}

function checkCopiesOwned(copiesOwned: number, copiesNeeded: number): void {
	if (
		!Number.isInteger(copiesOwned) ||
		copiesOwned < 0 ||
		copiesOwned > copiesNeeded
	) {
		throw new ConvexError(
			`Copies owned must be a whole number from 0 to ${copiesNeeded}.`,
		);
	}
}

export type CandidateView = {
	_id: Id<"yugiohCandidatePrintings">;
	printingId: Id<"yugiohPrintings">;
	setCode: string;
	rarity: string;
	overloadedRarities: string[];
	tcgplayer: TcgplayerView;
};

export type DeckCardView = {
	_id: Id<"yugiohDeckCards">;
	cardName: string;
	section: Section;
	copiesNeeded: number;
	copiesOwned: number;
	lowestAcceptableCondition: Condition;
	chosenPrintingId: Id<"yugiohPrintings"> | null;
	/** The Chosen Printing first, then in the order they were added. */
	candidates: CandidateView[];
};

export type DeckView = {
	_id: Id<"yugiohDecks">;
	name: string;
	cardCount: number;
	copiesOwned: number;
	copiesNeeded: number;
	sections: Array<{ section: Section; cards: DeckCardView[] }>;
};

export async function readDeck(
	ctx: QueryCtx,
	deckId: Id<"yugiohDecks">,
): Promise<DeckView | null> {
	const deck = await ctx.db.get("yugiohDecks", deckId);
	if (!deck) return null;
	const [cards, candidates] = await Promise.all([
		ctx.db
			.query("yugiohDeckCards")
			.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
			.take(MAX_CARDS_PER_DECK),
		ctx.db
			.query("yugiohCandidatePrintings")
			.withIndex("by_deckId", (q) => q.eq("deckId", deckId))
			.take(MAX_CANDIDATES_PER_DECK),
	]);
	const printingIds = [...new Set(candidates.map((c) => c.printingId))];
	const printings = new Map(
		(
			await Promise.all(
				printingIds.map((id) => ctx.db.get("yugiohPrintings", id)),
			)
		)
			.filter((printing) => printing !== null)
			.map((printing) => [printing._id, printing]),
	);
	const cardViews: DeckCardView[] = cards.map((card) => {
		const views = candidates
			.filter((candidate) => candidate.deckCardId === card._id)
			.flatMap((candidate): CandidateView[] => {
				const printing = printings.get(candidate.printingId);
				if (!printing) return [];
				return [
					{
						_id: candidate._id,
						printingId: printing._id,
						setCode: printing.setCode,
						rarity: printing.rarity,
						overloadedRarities: printing.overloadedRarities,
						tcgplayer: tcgplayerView(printing),
					},
				];
			});
		const chosen = views.filter((c) => c.printingId === card.chosenPrintingId);
		const others = views.filter((c) => c.printingId !== card.chosenPrintingId);
		return {
			_id: card._id,
			cardName: card.cardName,
			section: card.section,
			copiesNeeded: card.copiesNeeded,
			copiesOwned: card.copiesOwned,
			lowestAcceptableCondition: card.lowestAcceptableCondition,
			chosenPrintingId: card.chosenPrintingId,
			candidates: [...chosen, ...others],
		};
	});
	return {
		_id: deck._id,
		name: deck.name,
		cardCount: cards.length,
		...deckProgress(cards),
		sections: groupCardsBySection(cardViews),
	};
}

export type CardUpdate = {
	copiesNeeded?: number;
	copiesOwned?: number;
	lowestAcceptableCondition?: Condition;
	section?: Section;
};

/**
 * Edits a Card in its Deck. Lowering Copies needed below Copies owned lowers
 * owned with it, since ownership is counted per Deck.
 */
export async function updateCard(
	ctx: MutationCtx,
	deckCardId: Id<"yugiohDeckCards">,
	update: CardUpdate,
): Promise<void> {
	const card = await getDeckCardOrThrow(ctx, deckCardId);
	const copiesNeeded = update.copiesNeeded ?? card.copiesNeeded;
	checkCopiesNeeded(copiesNeeded);
	let copiesOwned = card.copiesOwned;
	if (update.copiesOwned !== undefined) {
		checkCopiesOwned(update.copiesOwned, copiesNeeded);
		copiesOwned = update.copiesOwned;
	} else {
		copiesOwned = Math.min(copiesOwned, copiesNeeded);
	}
	await ctx.db.patch("yugiohDeckCards", deckCardId, {
		copiesNeeded,
		copiesOwned,
		...(update.lowestAcceptableCondition !== undefined && {
			lowestAcceptableCondition: update.lowestAcceptableCondition,
		}),
		...(update.section !== undefined && { section: update.section }),
	});
}

async function findCandidate(
	ctx: QueryCtx,
	deckCardId: Id<"yugiohDeckCards">,
	printingId: Id<"yugiohPrintings">,
): Promise<Doc<"yugiohCandidatePrintings"> | null> {
	return await ctx.db
		.query("yugiohCandidatePrintings")
		.withIndex("by_deckCardId_and_printingId", (q) =>
			q.eq("deckCardId", deckCardId).eq("printingId", printingId),
		)
		.unique();
}

async function listCandidates(
	ctx: QueryCtx,
	deckCardId: Id<"yugiohDeckCards">,
): Promise<Array<Doc<"yugiohCandidatePrintings">>> {
	return await ctx.db
		.query("yugiohCandidatePrintings")
		.withIndex("by_deckCardId_and_printingId", (q) =>
			q.eq("deckCardId", deckCardId),
		)
		.take(MAX_CANDIDATES_PER_CARD);
}

export async function addCandidatePrinting(
	ctx: MutationCtx,
	deckCardId: Id<"yugiohDeckCards">,
	input: PrintingInput,
): Promise<Id<"yugiohCandidatePrintings">> {
	const card = await getDeckCardOrThrow(ctx, deckCardId);
	const existing = await listCandidates(ctx, deckCardId);
	if (existing.length >= MAX_CANDIDATES_PER_CARD) {
		throw new ConvexError(
			`A Card can have up to ${MAX_CANDIDATES_PER_CARD} Candidate Printings.`,
		);
	}
	const printingId = await findOrCreatePrinting(ctx, card.cardName, input);
	if (existing.some((candidate) => candidate.printingId === printingId)) {
		throw new ConvexError(
			"That Printing is already a Candidate for this Card.",
		);
	}
	return await ctx.db.insert("yugiohCandidatePrintings", {
		deckId: card.deckId,
		deckCardId,
		printingId,
	});
}

/** Sets the Chosen Printing (or null for undecided). Other Candidates stay saved. */
export async function choosePrinting(
	ctx: MutationCtx,
	deckCardId: Id<"yugiohDeckCards">,
	printingId: Id<"yugiohPrintings"> | null,
): Promise<void> {
	await getDeckCardOrThrow(ctx, deckCardId);
	if (
		printingId !== null &&
		!(await findCandidate(ctx, deckCardId, printingId))
	) {
		throw new ConvexError("That Printing isn't a Candidate for this Card.");
	}
	await ctx.db.patch("yugiohDeckCards", deckCardId, {
		chosenPrintingId: printingId,
	});
}

/** Removes a Candidate. A Card keeps at least one; removing the Chosen one leaves it undecided. */
export async function removeCandidatePrinting(
	ctx: MutationCtx,
	candidateId: Id<"yugiohCandidatePrintings">,
): Promise<void> {
	const candidate = await ctx.db.get("yugiohCandidatePrintings", candidateId);
	if (!candidate) return;
	const card = await getDeckCardOrThrow(ctx, candidate.deckCardId);
	const candidates = await listCandidates(ctx, card._id);
	if (candidates.length <= 1) {
		throw new ConvexError(
			"A Card needs at least one Candidate Printing. Remove the Card instead.",
		);
	}
	await ctx.db.delete("yugiohCandidatePrintings", candidateId);
	if (card.chosenPrintingId === candidate.printingId) {
		await ctx.db.patch("yugiohDeckCards", card._id, { chosenPrintingId: null });
	}
}

/**
 * Removes a Card and its Candidates from its Deck. Printings stay: they're
 * shared across Decks and keep their Listings and price history.
 */
export async function removeCard(
	ctx: MutationCtx,
	deckCardId: Id<"yugiohDeckCards">,
): Promise<void> {
	const card = await ctx.db.get("yugiohDeckCards", deckCardId);
	if (!card) return;
	for (const candidate of await listCandidates(ctx, deckCardId)) {
		await ctx.db.delete("yugiohCandidatePrintings", candidate._id);
	}
	await ctx.db.delete("yugiohDeckCards", deckCardId);
}

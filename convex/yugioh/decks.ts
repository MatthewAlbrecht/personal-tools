import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Decks from "../model/yugioh/decks";
import {
	yugiohCardCostValidator,
	yugiohCardOrderValidator,
	yugiohConditionValidator,
	yugiohCostTotalsValidator,
	yugiohDeckCostValidator,
	yugiohSectionValidator,
	yugiohTcgplayerStatusValidator,
} from "../model/yugioh/validators";
import * as WhatsNew from "../model/yugioh/whatsNew";

const deckSummaryValidator = v.object({
	_id: v.id("yugiohDecks"),
	name: v.string(),
	cardCount: v.number(),
	copiesOwned: v.number(),
	copiesNeeded: v.number(),
	cost: v.union(yugiohDeckCostValidator, v.null()),
});

const candidateValidator = v.object({
	_id: v.id("yugiohCandidatePrintings"),
	printingId: v.id("yugiohPrintings"),
	setCode: v.string(),
	rarity: v.string(),
	overloadedRarities: v.array(v.string()),
	tcgplayer: v.object({
		status: yugiohTcgplayerStatusValidator,
		productUrl: v.union(v.string(), v.null()),
		imageUrl: v.union(v.string(), v.null()),
		searchUrl: v.string(),
	}),
});

const deckCardValidator = v.object({
	_id: v.id("yugiohDeckCards"),
	cardName: v.string(),
	section: yugiohSectionValidator,
	copiesNeeded: v.number(),
	copiesOwned: v.number(),
	lowestAcceptableCondition: yugiohConditionValidator,
	chosenPrintingId: v.union(v.id("yugiohPrintings"), v.null()),
	candidates: v.array(candidateValidator),
	cost: v.union(yugiohCardCostValidator, v.null()),
	/** New Listings a week over the last 4 weeks; null without `now`. */
	newListingsPerWeek: v.union(v.number(), v.null()),
});

const deckValidator = deckSummaryValidator.extend({
	cardOrder: yugiohCardOrderValidator,
	sections: v.array(
		v.object({
			section: yugiohSectionValidator,
			cost: v.union(yugiohCostTotalsValidator, v.null()),
			cards: v.array(deckCardValidator),
		}),
	),
});

const printingFields = {
	setCode: v.string(),
	rarity: v.string(),
	overloadedRarities: v.array(v.string()),
};

/**
 * Every Deck with its progress. Pass `now` (Unix ms; a query can't read the
 * clock) to price each Deck's cost to finish; without it, `cost` is null.
 */
export const listDecks = query({
	args: { now: v.optional(v.number()) },
	returns: v.array(deckSummaryValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Decks.listDeckSummaries(ctx, args.now);
	},
});

export const createDeck = mutation({
	args: { name: v.string() },
	returns: v.id("yugiohDecks"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Decks.createDeck(ctx, args.name);
	},
});

/**
 * A Deck with its Cards by Section. Pass `now` (Unix ms; a query can't read
 * the clock) to price it: cost to finish and buy-now totals per Card,
 * Section and Deck, with By cost order sorted by cost. Without `now`, costs
 * are null and By cost sorts by name, which suits callers that only need
 * the Deck's name or Printings.
 */
export const getDeck = query({
	args: { deckId: v.id("yugiohDecks"), now: v.optional(v.number()) },
	returns: v.union(deckValidator, v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Decks.readDeck(ctx, args.deckId, args.now);
	},
});

/**
 * Records that I opened the Deck, for "new since my last visit". Looking
 * again within 30 minutes continues the visit, so what's new stays new.
 */
export const recordDeckVisit = mutation({
	args: { deckId: v.id("yugiohDecks") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await WhatsNew.recordDeckVisit(ctx, args.deckId, Date.now());
		return null;
	},
});

export const setCardOrder = mutation({
	args: { deckId: v.id("yugiohDecks"), cardOrder: yugiohCardOrderValidator },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await Decks.setCardOrder(ctx, args.deckId, args.cardOrder);
		return null;
	},
});

/**
 * Moves a Card within its Section's Custom order. Pass the `now` getDeck was
 * priced at, so unpositioned Cards sit where the screen showed them; it
 * defaults to the current time.
 */
export const moveCard = mutation({
	args: {
		deckCardId: v.id("yugiohDeckCards"),
		toIndex: v.number(),
		now: v.optional(v.number()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await Decks.moveCard(
			ctx,
			args.deckCardId,
			args.toIndex,
			args.now ?? Date.now(),
		);
		return null;
	},
});

export const addCard = mutation({
	args: {
		deckId: v.id("yugiohDecks"),
		cardName: v.string(),
		section: yugiohSectionValidator,
		copiesNeeded: v.number(),
		...printingFields,
	},
	returns: v.id("yugiohDeckCards"),
	handler: async (ctx, { deckId, ...input }) => {
		requireAuth(ctx);
		return await Decks.addCard(ctx, deckId, input);
	},
});

export const updateCard = mutation({
	args: {
		deckCardId: v.id("yugiohDeckCards"),
		copiesNeeded: v.optional(v.number()),
		copiesOwned: v.optional(v.number()),
		lowestAcceptableCondition: v.optional(yugiohConditionValidator),
		section: v.optional(yugiohSectionValidator),
	},
	returns: v.null(),
	handler: async (ctx, { deckCardId, ...update }) => {
		requireAuth(ctx);
		await Decks.updateCard(ctx, deckCardId, update);
		return null;
	},
});

export const addCandidatePrinting = mutation({
	args: { deckCardId: v.id("yugiohDeckCards"), ...printingFields },
	returns: v.id("yugiohCandidatePrintings"),
	handler: async (ctx, { deckCardId, ...input }) => {
		requireAuth(ctx);
		return await Decks.addCandidatePrinting(ctx, deckCardId, input);
	},
});

export const choosePrinting = mutation({
	args: {
		deckCardId: v.id("yugiohDeckCards"),
		printingId: v.union(v.id("yugiohPrintings"), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await Decks.choosePrinting(ctx, args.deckCardId, args.printingId);
		return null;
	},
});

export const removeCandidatePrinting = mutation({
	args: { candidateId: v.id("yugiohCandidatePrintings") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await Decks.removeCandidatePrinting(ctx, args.candidateId);
		return null;
	},
});

export const removeCard = mutation({
	args: { deckCardId: v.id("yugiohDeckCards") },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await Decks.removeCard(ctx, args.deckCardId);
		return null;
	},
});

/**
 * Backfill: re-normalizes Printing rarities and Overloaded rarities saved
 * before `normalizeRarity` title-cased bracketed words ("(pharaoh's Rare)" →
 * "(Pharaoh's Rare)"), a page at a time. Run until `isDone`, passing back
 * `cursor`; a non-empty `conflicts` lists Printings left alone because the
 * corrected set code + rarity already has a row:
 * `npx convex run yugioh/decks:renormalizePrintingRarities '{"paginationOpts":{"numItems":200,"cursor":null}}'`.
 */
export const renormalizePrintingRarities = internalMutation({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		updated: v.number(),
		conflicts: v.array(v.id("yugiohPrintings")),
		isDone: v.boolean(),
		cursor: v.string(),
	}),
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("yugiohPrintings")
			.paginate(args.paginationOpts);
		let updated = 0;
		const conflicts: Array<Id<"yugiohPrintings">> = [];
		for (const printing of page.page) {
			const result = await Decks.renormalizePrintingRarities(ctx, printing);
			if (result === "updated") updated++;
			if (result === "conflict") conflicts.push(printing._id);
		}
		return {
			updated,
			conflicts,
			isDone: page.isDone,
			cursor: page.continueCursor,
		};
	},
});

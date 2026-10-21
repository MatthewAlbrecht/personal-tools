import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Decks from "../model/yugioh/decks";
import {
	yugiohConditionValidator,
	yugiohSectionValidator,
	yugiohTcgplayerStatusValidator,
} from "../model/yugioh/validators";

const deckSummaryValidator = v.object({
	_id: v.id("yugiohDecks"),
	name: v.string(),
	cardCount: v.number(),
	copiesOwned: v.number(),
	copiesNeeded: v.number(),
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
});

const deckValidator = deckSummaryValidator.extend({
	sections: v.array(
		v.object({
			section: yugiohSectionValidator,
			cards: v.array(deckCardValidator),
		}),
	),
});

const printingFields = {
	setCode: v.string(),
	rarity: v.string(),
	overloadedRarities: v.array(v.string()),
};

export const listDecks = query({
	args: {},
	returns: v.array(deckSummaryValidator),
	handler: async (ctx) => {
		requireAuth(ctx);
		return await Decks.listDeckSummaries(ctx);
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

export const getDeck = query({
	args: { deckId: v.id("yugiohDecks") },
	returns: v.union(deckValidator, v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Decks.readDeck(ctx, args.deckId);
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

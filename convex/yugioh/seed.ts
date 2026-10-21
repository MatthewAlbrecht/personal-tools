import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import * as Seed from "../model/yugioh/seed";
import {
	yugiohConditionValidator,
	yugiohSectionValidator,
} from "../model/yugioh/validators";

const sectionCardValidator = v.object({
	cardName: v.string(),
	section: yugiohSectionValidator,
});

/**
 * Loads a whole Deck from a list, for the seeding agent
 * (docs/yugioh/seeding.md). Internal: run it with `npx convex run`.
 */
export const loadDeck = internalMutation({
	args: {
		name: v.string(),
		cards: v.array(
			v.object({
				cardName: v.string(),
				section: yugiohSectionValidator,
				copiesNeeded: v.number(),
				copiesOwned: v.optional(v.number()),
				lowestAcceptableCondition: v.optional(yugiohConditionValidator),
				candidates: v.array(
					v.object({
						setCode: v.string(),
						rarity: v.string(),
						overloadedRarities: v.array(v.string()),
					}),
				),
			}),
		),
		removeUnlisted: v.optional(v.boolean()),
	},
	returns: v.object({
		deckId: v.id("yugiohDecks"),
		deckCreated: v.boolean(),
		cardsAdded: v.number(),
		cardsChanged: v.number(),
		candidatesAdded: v.number(),
		cardsRemoved: v.number(),
		candidatesRemoved: v.number(),
		unlistedCards: v.array(sectionCardValidator),
		unlistedCandidates: v.array(
			sectionCardValidator.extend({ setCode: v.string(), rarity: v.string() }),
		),
	}),
	handler: async (ctx, args) => {
		return await Seed.loadDeck(ctx, args);
	},
});

import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Searches from "../model/yugioh/searches";

const searchValidator = v.object({
	setCodes: v.array(v.string()),
	exclusions: v.array(v.string()),
	printings: v.array(
		v.object({ cardName: v.string(), setCode: v.string(), rarity: v.string() }),
	),
	keywords: v.string(),
	newlyListedUrl: v.string(),
	soldUrl: v.string(),
});

/** A Deck's eBay Searches with their Newly Listed and Sold links. */
export const listSearches = query({
	args: { deckId: v.id("yugiohDecks") },
	returns: v.union(v.array(searchValidator), v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Searches.readSearches(ctx, args.deckId);
	},
});

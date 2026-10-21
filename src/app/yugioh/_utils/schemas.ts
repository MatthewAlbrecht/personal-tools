import { z } from "zod";
import { CONDITIONS, MAX_COPIES_NEEDED, SECTIONS } from "~/lib/yugioh/deck";
import {
	REJECTED_PRODUCT_URL,
	checkTcgplayerProductUrl,
} from "~/lib/yugioh/tcgplayer";

// Field schemas mirror the checks in convex/model/yugioh/decks.ts.

export const deckNameSchema = z.object({
	name: z.string().trim().min(1, "Give the Deck a name.").max(200),
});

export const printingSchema = z.object({
	setCode: z
		.string()
		.trim()
		.min(1, "Enter the set code, like RA01-EN008.")
		.max(40, "That set code is too long."),
	rarity: z.string().trim().min(1, "Enter the rarity.").max(200),
	overloadedRarities: z.array(z.string()),
});

export const addCardSchema = printingSchema.extend({
	cardName: z.string().trim().min(1, "Enter the Card name.").max(200),
	section: z.enum(SECTIONS),
	copiesNeeded: z
		.number()
		.int()
		.min(1, "A Deck needs at least 1 Copy.")
		.max(MAX_COPIES_NEEDED, `A Deck runs at most ${MAX_COPIES_NEEDED} Copies.`),
});

export const copiesSchema = z.object({
	count: z.number().int().min(0),
});

export const conditionSchema = z.object({
	lowestAcceptableCondition: z.enum(CONDITIONS),
});

export const chosenPrintingSchema = z.object({
	printingId: z.string(),
});

/**
 * A pasted TCGplayer product URL. Runs the same pattern check as the server
 * (`setProductUrl`), so a wrong URL is caught before it's sent.
 */
export function productUrlSchema(printing: {
	cardName: string;
	rarity: string;
}): z.ZodType<{ url: string }, z.ZodTypeDef, { url: string }> {
	return z.object({
		url: z
			.string()
			.trim()
			.min(1, "Paste the product URL.")
			.refine(
				(url) => checkTcgplayerProductUrl(url, printing) !== null,
				REJECTED_PRODUCT_URL,
			),
	});
}

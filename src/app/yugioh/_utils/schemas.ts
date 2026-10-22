import { z } from "zod";
import {
	CARD_ORDERS,
	CONDITIONS,
	MAX_COPIES_NEEDED,
	PRIORITIES,
	SECTIONS,
} from "~/lib/yugioh/deck";
import {
	CONDITION_FILTERS,
	LISTING_KINDS,
	LISTING_VIEWS,
	MARKETPLACES,
} from "~/lib/yugioh/listing-filters";
import { SORT_DIRECTIONS, SORT_KEYS } from "~/lib/yugioh/listing-sort";
import {
	HOME_COUNTRY,
	MAX_COUNTRY_LENGTH,
	isHomeCountry,
} from "~/lib/yugioh/pricing";
import {
	REJECTED_PRODUCT_URL,
	checkTcgplayerProductUrl,
} from "~/lib/yugioh/tcgplayer";
import { LANGUAGES } from "~/lib/yugioh/title-reading";

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

export const cardOrderSchema = z.object({
	cardOrder: z.enum(CARD_ORDERS),
});

export const gridColumnsSchema = z.object({
	columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

export const conditionSchema = z.object({
	lowestAcceptableCondition: z.enum(CONDITIONS),
});

export const prioritySchema = z.object({
	priority: z.enum(PRIORITIES),
});

export const chosenPrintingSchema = z.object({
	printingId: z.string(),
});

/**
 * A pasted TCGplayer product URL. Runs the same check as the server
 * (`setProductUrl`), so a URL that isn't a product page is caught before it's
 * sent; the server then checks the product is the Printing.
 */
export const productUrlSchema = z.object({
	url: z
		.string()
		.trim()
		.min(1, "Paste the product URL.")
		.refine(
			(url) => checkTcgplayerProductUrl(url) !== null,
			REJECTED_PRODUCT_URL,
		),
});

/** The "Not a match" choice in the Listing drawer's match form. */
export const NOT_A_MATCH = "notMatch";

/** A Listing's match, set by hand: a Printing ID or `NOT_A_MATCH`. */
export const listingMatchSchema = z.object({
	match: z.string().min(1, "Choose a Printing, or Not a match."),
});

/** An import fee rate as typed: a percent from 0 to 100. */
const importFeePercentSchema = z
	.string()
	.trim()
	.min(1, "Enter a rate.")
	.refine((value) => {
		const percent = Number(value);
		return Number.isFinite(percent) && percent >= 0 && percent <= 100;
	}, "Enter a rate from 0 to 100%.");

export const importFeeRateSchema = z.object({
	percent: importFeePercentSchema,
});

export const newImportFeeRateSchema = z.object({
	country: z
		.string()
		.trim()
		.min(1, "Enter the country as eBay writes it.")
		.max(MAX_COUNTRY_LENGTH, "That country name is too long.")
		.refine(
			(country) => !isHomeCountry(country),
			`${HOME_COUNTRY} Listings pay no import fees.`,
		),
	percent: importFeePercentSchema,
});

/** "Any" leaves a Listing filter unset. */
export const ANY = "any";

/** The Listings filter drawer: each field is a filter, or "any". */
export const listingFiltersSchema = z.object({
	marketplace: z.enum([ANY, ...MARKETPLACES]),
	type: z.enum([ANY, ...LISTING_KINDS]),
	language: z.enum([ANY, ...LANGUAGES]),
	condition: z.enum([ANY, ...CONDITION_FILTERS]),
	graded: z.enum([ANY, "yes", "no"]),
	location: z.string(),
	card: z.string(),
	priority: z.array(z.enum(PRIORITIES)),
	section: z.array(z.enum(SECTIONS)),
});

/** The Cards tab's priority filter: every Card, or one priority's. */
export const cardsPriorityFilterSchema = z.object({
	priority: z.enum([ANY, ...PRIORITIES]),
});

/** The Listings view (Available or Sold) and the New toggle within it. */
export const listingsViewSchema = z.object({
	view: z.enum(LISTING_VIEWS),
	new: z.boolean(),
	rejected: z.boolean(),
});

/** The Listings sort on small screens, where there are no column headers. */
export const listingSortSchema = z.object({
	key: z.enum(SORT_KEYS),
	direction: z.enum(SORT_DIRECTIONS),
});

/** The alerts switch on Settings: on or off for this device. */
export const pushAlertsSchema = z.object({ enabled: z.boolean() });

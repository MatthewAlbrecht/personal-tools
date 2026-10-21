import { type Infer, v } from "convex/values";
import type {
	CardOrder,
	Condition,
	Section,
} from "../../../src/lib/yugioh/deck";

export const yugiohSectionValidator = v.union(
	v.literal("main"),
	v.literal("extra"),
	v.literal("side"),
);

export const yugiohConditionValidator = v.union(
	v.literal("nearMint"),
	v.literal("lightlyPlayed"),
	v.literal("moderatelyPlayed"),
	v.literal("heavilyPlayed"),
);

export const yugiohCardOrderValidator = v.union(
	v.literal("byCost"),
	v.literal("custom"),
);

/**
 * Where a Printing's TCGplayer product lookup stands: AI is "searching" right
 * after the Printing is added, then it's "found" or "needsPaste".
 */
export const yugiohTcgplayerStatusValidator = v.union(
	v.literal("searching"),
	v.literal("found"),
	v.literal("needsPaste"),
);

/** The marketplaces Listings come from. */
export const yugiohMarketplaceValidator = v.union(
	v.literal("ebay"),
	v.literal("tcgplayer"),
);

/** How a Listing sells: fixed price, fixed price that takes offers, or auction. */
export const yugiohListingTypeValidator = v.union(
	v.literal("buyItNow"),
	v.literal("bestOffer"),
	v.literal("auction"),
);

/**
 * One eBay search result exactly as the extension's page reader sends it.
 * Prices are in `currency`, the lowest end of a range. `shipping` is 0 for
 * free delivery and null when the page doesn't say. `endsAt` and `listedAt`
 * are Unix ms; `soldDate` is `YYYY-MM-DD`. `sellerLocation` is the country
 * from eBay's "Located in …" row, null when the page doesn't show one.
 */
export const yugiohCapturedEbayListingValidator = v.object({
	itemId: v.string(),
	url: v.string(),
	title: v.string(),
	imageUrl: v.union(v.string(), v.null()),
	price: v.union(v.number(), v.null()),
	currency: v.union(v.string(), v.null()),
	shipping: v.union(v.number(), v.null()),
	listingType: yugiohListingTypeValidator,
	bids: v.union(v.number(), v.null()),
	endsAt: v.union(v.number(), v.null()),
	listedAt: v.union(v.number(), v.null()),
	sellerLocation: v.union(v.string(), v.null()),
	sold: v.boolean(),
	soldDate: v.union(v.string(), v.null()),
});

// Compile-time check that the validators and the domain library agree.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const sectionsAgree: Same<Infer<typeof yugiohSectionValidator>, Section> = true;
const conditionsAgree: Same<
	Infer<typeof yugiohConditionValidator>,
	Condition
> = true;
const cardOrdersAgree: Same<
	Infer<typeof yugiohCardOrderValidator>,
	CardOrder
> = true;
void sectionsAgree;
void cardOrdersAgree;
void conditionsAgree;

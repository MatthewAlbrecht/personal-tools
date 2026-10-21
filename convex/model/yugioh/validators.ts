import { type Infer, v } from "convex/values";
import type {
	CardOrder,
	Condition,
	Section,
} from "../../../src/lib/yugioh/deck";
import type {
	ExchangeRate,
	PerCopyPrice,
} from "../../../src/lib/yugioh/pricing";
import type {
	Language,
	MatchStatus,
	ReadCondition,
	TitleJudgments,
	TitleRead,
} from "../../../src/lib/yugioh/title-reading";

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

export const yugiohLanguageValidator = v.union(
	v.literal("english"),
	v.literal("japanese"),
	v.literal("korean"),
	v.literal("chinese"),
	v.literal("german"),
	v.literal("french"),
	v.literal("italian"),
	v.literal("spanish"),
	v.literal("portuguese"),
);

export const yugiohReadConditionValidator = v.union(
	v.literal("nearMint"),
	v.literal("lightlyPlayed"),
	v.literal("moderatelyPlayed"),
	v.literal("heavilyPlayed"),
	v.literal("damaged"),
);

/** Everything read from a Listing's title (null fields: the title doesn't say). */
export const yugiohTitleReadValidator = v.object({
	setCode: v.union(v.string(), v.null()),
	rarity: v.union(v.string(), v.null()),
	condition: v.union(yugiohReadConditionValidator, v.null()),
	copies: v.number(),
	language: yugiohLanguageValidator,
	graded: v.boolean(),
	gradingCompany: v.union(v.string(), v.null()),
	grade: v.union(v.string(), v.null()),
});

/** What the AI judged from a title, before code checks it (see title-reading.ts). */
export const yugiohTitleJudgmentsValidator = v.object({
	setCode: v.union(v.string(), v.null()),
	rarity: v.union(v.string(), v.null()),
	condition: v.union(yugiohReadConditionValidator, v.null()),
	copies: v.number(),
	language: yugiohLanguageValidator,
	graded: v.boolean(),
	gradingCompany: v.union(v.string(), v.null()),
});

/** Where a Listing's title read stands. */
export const yugiohTitleReadStatusValidator = v.union(
	v.literal("reading"),
	v.literal("read"),
	v.literal("failed"),
);

/**
 * How a Listing's Per-copy price adds up, every amount in dollars. `shipping`
 * is null when the Listing doesn't say (counted as 0).
 */
export const yugiohPerCopyPriceValidator = v.object({
	price: v.number(),
	shipping: v.union(v.number(), v.null()),
	importFees: v.number(),
	importFeePercent: v.number(),
	importFeeDefaulted: v.boolean(),
	copies: v.number(),
	perCopy: v.number(),
});

/** One currency's daily rate: what 1 unit is worth in dollars. */
export const yugiohExchangeRateValidator = v.object({
	currency: v.string(),
	usdPerUnit: v.number(),
});

/** Whether a Listing is for one of my Printings. */
export const yugiohMatchStatusValidator = v.union(
	v.literal("match"),
	v.literal("notMatch"),
	v.literal("unsure"),
);

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
const languagesAgree: Same<
	Infer<typeof yugiohLanguageValidator>,
	Language
> = true;
const readConditionsAgree: Same<
	Infer<typeof yugiohReadConditionValidator>,
	ReadCondition
> = true;
const titleReadsAgree: Same<
	Infer<typeof yugiohTitleReadValidator>,
	TitleRead
> = true;
const matchStatusesAgree: Same<
	Infer<typeof yugiohMatchStatusValidator>,
	MatchStatus
> = true;
void languagesAgree;
void readConditionsAgree;
const titleJudgmentsAgree: Same<
	Infer<typeof yugiohTitleJudgmentsValidator>,
	TitleJudgments
> = true;
void titleReadsAgree;
void titleJudgmentsAgree;
void matchStatusesAgree;
const perCopyPricesAgree: Same<
	Infer<typeof yugiohPerCopyPriceValidator>,
	PerCopyPrice
> = true;
const exchangeRatesAgree: Same<
	Infer<typeof yugiohExchangeRateValidator>,
	ExchangeRate
> = true;
void perCopyPricesAgree;
void exchangeRatesAgree;
void sectionsAgree;
void cardOrdersAgree;
void conditionsAgree;

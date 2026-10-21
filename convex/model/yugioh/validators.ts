import { type Infer, v } from "convex/values";
import type {
	PlannedVisit,
	RunStatus,
	RunTrigger,
	VisitKind,
} from "../../../src/lib/yugioh/automation";
import type {
	CardCost,
	CostTotals,
	DeckCost,
} from "../../../src/lib/yugioh/costs";
import type { DealGrade, Reference } from "../../../src/lib/yugioh/deals";
import type {
	CardOrder,
	Condition,
	Section,
} from "../../../src/lib/yugioh/deck";
import type { ListingFilters } from "../../../src/lib/yugioh/listing-filters";
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
import type { Id } from "../../_generated/dataModel";
import type { DealView } from "./deals";

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

/**
 * One current Listing on a TCGplayer product page, as the extension's page
 * reader sends it. `listingId` is TCGplayer's own, stable across visits
 * (`<productConditionId>-<sellerKey>`). `condition` is TCGplayer's wording
 * ("Near Mint 1st Edition"). Prices are USD; `shipping` is 0 when free or
 * included and null when the page doesn't say. `quantity` is how many Copies
 * the seller has. `customTitle` is the seller's own title on a Listing with
 * photos, which may be another card (a foreign alt art, a graded copy).
 */
export const yugiohCapturedTcgplayerListingValidator = v.object({
	listingId: v.string(),
	seller: v.union(v.string(), v.null()),
	condition: v.string(),
	price: v.number(),
	shipping: v.union(v.number(), v.null()),
	quantity: v.union(v.number(), v.null()),
	customTitle: v.union(v.string(), v.null()),
});

/**
 * One of a TCGplayer product page's latest sales. `soldDate` is
 * `YYYY-MM-DD`; `price` is per Copy, in USD; `shipping` is null because the
 * page doesn't show it. `customTitle` as for a Listing.
 */
export const yugiohCapturedTcgplayerSaleValidator = v.object({
	soldDate: v.string(),
	condition: v.string(),
	quantity: v.number(),
	price: v.number(),
	shipping: v.union(v.number(), v.null()),
	customTitle: v.union(v.string(), v.null()),
});

/**
 * One TCGplayer product page: its current Listings and latest sales.
 * `listingsFromCheapest` is true when the Listings shown start from the
 * cheapest (page 1, no condition or printing filter), so a Listing they
 * leave out is gone or pricier.
 */
export const yugiohCapturedTcgplayerProductValidator = v.object({
	productId: v.number(),
	url: v.string(),
	listingsFromCheapest: v.boolean(),
	listings: v.array(yugiohCapturedTcgplayerListingValidator),
	sales: v.array(yugiohCapturedTcgplayerSaleValidator),
});

/** What a TCGplayer Listing or sale says beyond the eBay-shaped fields. */
export const yugiohTcgplayerDetailsValidator = v.object({
	/** Null for a sale: TCGplayer doesn't say who sold it. */
	seller: v.union(v.string(), v.null()),
	/** TCGplayer's wording, e.g. "Near Mint 1st Edition". */
	condition: v.string(),
	/** Copies the seller has, or Copies sold; null when the page doesn't say. */
	quantity: v.union(v.number(), v.null()),
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

/** A Printing's Reference price on one marketplace; null price: not enough sales. */
export const yugiohReferenceValidator = v.object({
	price: v.union(v.number(), v.null()),
	sales: v.number(),
});

export const yugiohDealGradeValidator = v.union(
	v.literal("great"),
	v.literal("good"),
	v.literal("fair"),
	v.literal("poor"),
);

/** How a Listing compares with its Printing's eBay Reference price, in one Deck. */
export const yugiohDealValidator = v.object({
	qualifying: v.boolean(),
	belowCondition: v.boolean(),
	reference: v.union(yugiohReferenceValidator, v.null()),
	grade: v.union(yugiohDealGradeValidator, v.null()),
	percentOfReference: v.union(v.number(), v.null()),
});

/** What finishing one Card costs, in USD; null figures: no price. */
export const yugiohCardCostValidator = v.object({
	remainingCopies: v.number(),
	toFinish: v.union(v.number(), v.null()),
	buyNow: v.union(v.number(), v.null()),
});

/** A Section's or Deck's cost to finish and buy-now total, in USD. */
export const yugiohCostTotalsValidator = v.object({
	toFinish: v.number(),
	buyNow: v.number(),
});

/** A Deck's totals, and the unfinished Cards each total leaves out. */
export const yugiohDeckCostValidator = v.object({
	toFinish: v.number(),
	buyNow: v.number(),
	unfinishedCards: v.number(),
	cardsWithoutPrice: v.array(
		v.object({ _id: v.id("yugiohDeckCards"), cardName: v.string() }),
	),
	cardsWithoutBuyNow: v.number(),
});

/** Filters on a Deck's Listings, as kept in the URL; unset lets everything through. */
export const yugiohListingFiltersValidator = v.object({
	new: v.optional(v.boolean()),
	ending: v.optional(v.boolean()),
	marketplace: v.optional(yugiohMarketplaceValidator),
	type: v.optional(
		v.union(v.literal("buyItNow"), v.literal("auction"), v.literal("sold")),
	),
	language: v.optional(yugiohLanguageValidator),
	condition: v.optional(
		v.union(yugiohReadConditionValidator, v.literal("unknown")),
	),
	graded: v.optional(v.boolean()),
	match: v.optional(v.union(yugiohMatchStatusValidator, v.literal("reading"))),
	location: v.optional(v.string()),
	/** A Deck Card ID, as it appears in the URL; an unknown one matches nothing. */
	card: v.optional(v.string()),
});

/** What started an automated browser run. */
export const yugiohRunTriggerValidator = v.union(
	v.literal("launchAgent"),
	v.literal("t3"),
	v.literal("manual"),
);

/**
 * An automated run: asked for by the script, running once the extension
 * claims it, then finished (every page tried) or failed (the run as a whole
 * broke: never picked up, timed out, abandoned).
 */
export const yugiohRunStatusValidator = v.union(
	v.literal("requested"),
	v.literal("running"),
	v.literal("finished"),
	v.literal("failed"),
);

/** Which kind of page an automated run visits. */
export const yugiohVisitKindValidator = v.union(
	v.literal("ebayNewlyListed"),
	v.literal("ebaySold"),
	v.literal("tcgplayer"),
);

/** One page in a run's visit plan. */
export const yugiohPlannedVisitValidator = v.object({
	url: v.string(),
	kind: yugiohVisitKindValidator,
	/** The set codes of a Search, or a Printing's Card name and set code. */
	label: v.string(),
});

/** A page that failed in a run, as the runs list shows it. */
export const yugiohPageErrorValidator = v.object({
	kind: yugiohVisitKindValidator,
	label: v.string(),
	error: v.string(),
});

/**
 * An automated run as stored (`yugiohAutomationRuns`). Times are Unix ms.
 * The page counts are running totals of its `yugiohAutomationVisits`.
 */
export const yugiohAutomationRunValidator = v.object({
	trigger: yugiohRunTriggerValidator,
	status: yugiohRunStatusValidator,
	requestedAt: v.number(),
	startedAt: v.union(v.number(), v.null()),
	endedAt: v.union(v.number(), v.null()),
	pagesPlanned: v.number(),
	pagesVisited: v.number(),
	searchPagesVisited: v.number(),
	productPagesVisited: v.number(),
	failedPages: v.number(),
	listingsCaptured: v.number(),
	newListings: v.number(),
	/** Why the run as a whole failed (never picked up, timed out, abandoned). */
	error: v.union(v.string(), v.null()),
	/** The first few pages that failed, for the runs list. */
	pageErrors: v.array(yugiohPageErrorValidator),
});

/** What the extension reports after visiting one page. */
export const yugiohVisitReportValidator = v.object({
	...yugiohPlannedVisitValidator.fields,
	/** Listings (and TCGplayer sales) the page sent; 0 when it sent none. */
	listingsCaptured: v.number(),
	/** Of those, the ones the app hadn't seen before. */
	newListings: v.number(),
	/** Why the page captured nothing, or null when it worked. */
	error: v.union(v.string(), v.null()),
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
const referencesAgree: Same<
	Infer<typeof yugiohReferenceValidator>,
	Reference
> = true;
const dealGradesAgree: Same<
	Infer<typeof yugiohDealGradeValidator>,
	DealGrade
> = true;
void referencesAgree;
void dealGradesAgree;
const dealsAgree: Same<Infer<typeof yugiohDealValidator>, DealView> = true;
void dealsAgree;
const cardCostsAgree: Same<
	Infer<typeof yugiohCardCostValidator>,
	CardCost
> = true;
const costTotalsAgree: Same<
	Infer<typeof yugiohCostTotalsValidator>,
	CostTotals
> = true;
const deckCostsAgree: Same<
	Infer<typeof yugiohDeckCostValidator>,
	DeckCost<Id<"yugiohDeckCards">>
> = true;
void cardCostsAgree;
void costTotalsAgree;
void deckCostsAgree;
const listingFiltersAgree: Same<
	Infer<typeof yugiohListingFiltersValidator>,
	ListingFilters
> = true;
void listingFiltersAgree;

const runTriggersAgree: Same<
	Infer<typeof yugiohRunTriggerValidator>,
	RunTrigger
> = true;
const runStatusesAgree: Same<
	Infer<typeof yugiohRunStatusValidator>,
	RunStatus
> = true;
const visitKindsAgree: Same<
	Infer<typeof yugiohVisitKindValidator>,
	VisitKind
> = true;
const plannedVisitsAgree: Same<
	Infer<typeof yugiohPlannedVisitValidator>,
	PlannedVisit
> = true;
void runTriggersAgree;
void runStatusesAgree;
void visitKindsAgree;
void plannedVisitsAgree;

// Pushes (ticket 13). Ticket 14 adds an auction kind.
export const yugiohPushKindValidator = v.union(
	v.literal("deal"),
	v.literal("test"),
);

/**
 * `pending` until its delivery time (held through quiet hours), `sending`
 * while the push service is called, then `sent` (reached a device),
 * `failed` (reached none) or `skipped` (no longer worth sending).
 */
export const yugiohPushStatusValidator = v.union(
	v.literal("pending"),
	v.literal("sending"),
	v.literal("sent"),
	v.literal("failed"),
	v.literal("skipped"),
);

/** A device's push subscription, as `PushSubscription.toJSON()` gives it. */
export const yugiohPushSubscriptionValidator = v.object({
	endpoint: v.string(),
	keys: v.object({ p256dh: v.string(), auth: v.string() }),
});

/** What the push service said about one device. */
export const yugiohPushOutcomeValidator = v.union(
	v.object({ status: v.literal("sent") }),
	v.object({ status: v.literal("gone") }),
	v.object({ status: v.literal("failed"), reason: v.string() }),
);

/** How the push service should treat one push. */
export const yugiohPushOptionsValidator = v.object({
	ttlSeconds: v.number(),
	urgency: v.union(v.literal("normal"), v.literal("high")),
	// Replaces a still-undelivered push with the same topic.
	topic: v.union(v.string(), v.null()),
});

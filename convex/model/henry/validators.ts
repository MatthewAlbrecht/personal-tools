import { v } from "convex/values";

/**
 * Why a unit has a push waiting: it listed or relisted (ticket 06). Events
 * for one unit while its push is held add to one set. Ticket 07 adds
 * `dropped` (a starred unit's price went down).
 */
export const henryPushReasonValidator = v.union(
	v.literal("listed"),
	v.literal("relisted"),
);

/**
 * `pending` until its delivery time (held through quiet hours, taking in
 * later events for the unit), `sending` while the push service is called,
 * then `sent` (reached a device), `failed` (reached none) or `skipped` (no
 * longer true, or no device has push on).
 */
export const henryPushStatusValidator = v.union(
	v.literal("pending"),
	v.literal("sending"),
	v.literal("sent"),
	v.literal("failed"),
	v.literal("skipped"),
);

/** On the market until it's missing from two successful checks in a row; then off the market until seen again (relisted). */
export const henryUnitStatusValidator = v.union(
	v.literal("onMarket"),
	v.literal("offMarket"),
);

/**
 * A unit's timeline. The baseline's units start with `trackingBegan`; units
 * first seen after it start with `listed`. `offMarket` when it misses two
 * successful checks in a row; `relisted` when it's seen again after that.
 */
export const henryUnitEventKindValidator = v.union(
	v.literal("trackingBegan"),
	v.literal("listed"),
	v.literal("offMarket"),
	v.literal("relisted"),
);

export const henryCheckOutcomeValidator = v.union(
	v.literal("success"),
	v.literal("failure"),
);

/** What the hourly action hands the record-check mutation. */
export const henryCheckResultValidator = v.union(
	// The response body, slimmed to the fields the check reads.
	v.object({ kind: v.literal("response"), body: v.string() }),
	// The request itself failed (network error, non-2xx).
	v.object({ kind: v.literal("fetchFailed"), reason: v.string() }),
);

/** A unit's facts as SightMap reports them in one check. */
export const henryUnitFactsValidator = v.object({
	sightmapId: v.string(),
	number: v.string(),
	floor: v.number(),
	floorPlan: v.string(),
	beds: v.number(),
	baths: v.number(),
	sqft: v.number(),
	facesI25: v.boolean(),
	/** Base rent: the tracked price. */
	price: v.number(),
	/** Total monthly price with mandatory fees. */
	totalPrice: v.number(),
	/** The lease term `price` is quoted for; null when SightMap omits it. */
	leaseTermMonths: v.union(v.number(), v.null()),
	/** `YYYY-MM-DD`. */
	availableOn: v.string(),
	specials: v.union(v.string(), v.null()),
});

export const henryCheckSummaryValidator = v.object({
	at: v.number(),
	outcome: henryCheckOutcomeValidator,
	reason: v.union(v.string(), v.null()),
	unitCount: v.union(v.number(), v.null()),
});

/**
 * Current price minus the price 3, 7 and 14 days before `now`, measured from
 * the first price point when the unit listed (or tracking began) within the
 * window. Negative is a drop.
 */
export const henryPriceChangesValidator = v.object({
	d3: v.number(),
	d7: v.number(),
	d14: v.number(),
});

export const henryLedgerUnitValidator = henryUnitFactsValidator
	.omit("sightmapId")
	.extend({
		_id: v.id("henryUnits"),
		/** Whole days since it listed while that's under 7; null otherwise (incl. baseline units). */
		newDays: v.union(v.number(), v.null()),
		changes: henryPriceChangesValidator,
		/** Starred itself (independent of its floor plan's star). */
		unitStarred: v.boolean(),
		/** Its floor plan is starred. Starred = either. */
		planStarred: v.boolean(),
	});

export const henryPricePointValidator = v.object({
	at: v.number(),
	price: v.number(),
	totalPrice: v.number(),
	leaseTermMonths: v.union(v.number(), v.null()),
});

/**
 * One line of a unit's timeline: an event from `henryUnitEvents` (with the
 * price then), or a price change from consecutive price points.
 */
export const henryTimelineEntryValidator = v.union(
	v.object({
		kind: henryUnitEventKindValidator,
		at: v.number(),
		price: v.number(),
	}),
	v.object({
		kind: v.literal("priceChange"),
		at: v.number(),
		from: v.number(),
		to: v.number(),
	}),
);

/** The unit drawer. */
export const henryUnitDetailsValidator = henryLedgerUnitValidator.extend({
	status: henryUnitStatusValidator,
	/** When it came on the market after the baseline; null when tracked since the baseline. */
	listedAt: v.union(v.number(), v.null()),
	firstSeenAt: v.number(),
	offMarketAt: v.union(v.number(), v.null()),
	/** Current price minus its first price point (listing or tracking began). */
	sinceStart: v.number(),
	/** Oldest first; the latest `MAX_HISTORY` price points. */
	history: v.array(henryPricePointValidator),
	/** Newest first. */
	timeline: v.array(henryTimelineEntryValidator),
});

/** A "Gone this week" row: what it was and what it last cost. */
export const henryGoneUnitValidator = v.object({
	_id: v.id("henryUnits"),
	number: v.string(),
	floorPlan: v.string(),
	beds: v.number(),
	sqft: v.number(),
	/** Its last price on the market. */
	price: v.number(),
	offMarketAt: v.number(),
});

export const henryLedgerValidator = v.object({
	/** The baseline: the first successful check. Null before it. */
	trackingBeganAt: v.union(v.number(), v.null()),
	/** The latest successful check. */
	lastCheckedAt: v.union(v.number(), v.null()),
	/** The latest check, successful or not. */
	lastCheck: v.union(henryCheckSummaryValidator, v.null()),
	onMarketCount: v.number(),
	newThisWeekCount: v.number(),
	goneThisWeekCount: v.number(),
	/** Tracking has begun and the latest successful check is over 3 hours before `now`. */
	checksFailing: v.boolean(),
	/** Starred floor plans, by name, whether or not a unit on one is on the market. */
	starredPlans: v.array(v.string()),
	/** On the market, cheapest first. */
	units: v.array(henryLedgerUnitValidator),
	/** Off the market in the 7 days before `now`, newest first. */
	goneThisWeek: v.array(henryGoneUnitValidator),
});

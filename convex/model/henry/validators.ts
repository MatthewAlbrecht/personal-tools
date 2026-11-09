import { v } from "convex/values";

/** On the market = in the latest successful check. Off the market (ticket 04): missed two in a row. */
export const henryUnitStatusValidator = v.union(
	v.literal("onMarket"),
	v.literal("offMarket"),
);

/**
 * A unit's timeline. The baseline's units start with `trackingBegan`; units
 * first seen after it start with `listed`. Ticket 04 adds `offMarket` and
 * `relisted`.
 */
export const henryUnitEventKindValidator = v.union(
	v.literal("trackingBegan"),
	v.literal("listed"),
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

export const henryLedgerUnitValidator = henryUnitFactsValidator
	.omit("sightmapId")
	.extend({
		_id: v.id("henryUnits"),
		/** Whole days since it listed while that's under 7; null otherwise (incl. baseline units). */
		newDays: v.union(v.number(), v.null()),
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
	/** On the market, cheapest first. */
	units: v.array(henryLedgerUnitValidator),
});

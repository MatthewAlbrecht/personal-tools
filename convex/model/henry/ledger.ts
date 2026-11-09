import type { Infer } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import { MAX_ON_MARKET, latestCheck, trackingBeganAt } from "./checks";
import { readStar, readStarredPlans } from "./stars";
import { ledgerUnit, readPriceChanges } from "./units";
import type { henryLedgerValidator } from "./validators";

export type HenryLedger = Infer<typeof henryLedgerValidator>;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** "Gone this week" looks back this far. */
const GONE_FOR = 7 * DAY;
/** With no successful check for longer than this, the page says checks are failing. */
const STALE_AFTER = 3 * HOUR;
/** A week of units going off the market: a bound, not an expected size. */
const MAX_GONE = 100;

/**
 * The Ledger at `now`: the summary line, every unit on the market (cheapest
 * first) and the units gone this week (newest first).
 */
export async function readLedger(
	ctx: QueryCtx,
	now: number,
): Promise<HenryLedger> {
	const [began, lastSuccess, last, onMarket, gone, starredPlans] =
		await Promise.all([
			trackingBeganAt(ctx),
			latestCheck(ctx, "success"),
			latestCheck(ctx),
			ctx.db
				.query("henryUnits")
				.withIndex("by_status_and_price", (q) => q.eq("status", "onMarket"))
				.take(MAX_ON_MARKET),
			ctx.db
				.query("henryUnits")
				.withIndex("by_status_and_offMarketAt", (q) =>
					q.eq("status", "offMarket").gte("offMarketAt", now - GONE_FOR),
				)
				.order("desc")
				.take(MAX_GONE),
			readStarredPlans(ctx),
		]);

	const plans = new Set(starredPlans);
	const units = await Promise.all(
		onMarket.map(async (unit) => {
			const [changes, star] = await Promise.all([
				readPriceChanges(ctx, unit, now),
				readStar(ctx, unit, plans),
			]);
			return ledgerUnit(unit, changes, star, now);
		}),
	);

	return {
		trackingBeganAt: began,
		lastCheckedAt: lastSuccess?.at ?? null,
		lastCheck: last
			? {
					at: last.at,
					outcome: last.outcome,
					reason: last.reason,
					unitCount: last.unitCount,
				}
			: null,
		onMarketCount: units.length,
		newThisWeekCount: units.filter((unit) => unit.newDays !== null).length,
		goneThisWeekCount: gone.length,
		checksFailing:
			began !== null &&
			(lastSuccess === null || now - lastSuccess.at > STALE_AFTER),
		starredPlans,
		units,
		goneThisWeek: gone.map((unit) => ({
			_id: unit._id,
			number: unit.number,
			floorPlan: unit.floorPlan,
			beds: unit.beds,
			sqft: unit.sqft,
			price: unit.price,
			// Always set off the market; the index range excludes null.
			offMarketAt: unit.offMarketAt ?? now,
		})),
	};
}

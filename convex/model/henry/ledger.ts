import type { Infer } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import { latestCheck, trackingBeganAt } from "./checks";
import { ledgerUnit, readPriceChanges } from "./units";
import type { henryLedgerValidator } from "./validators";

export type HenryLedger = Infer<typeof henryLedgerValidator>;

/** Far above The Henry's ~250 apartments: a bound, not a page size. */
const MAX_ON_MARKET = 400;

/** The Ledger at `now`: the summary line and every unit on the market, cheapest first. */
export async function readLedger(
	ctx: QueryCtx,
	now: number,
): Promise<HenryLedger> {
	const [began, lastSuccess, last, onMarket] = await Promise.all([
		trackingBeganAt(ctx),
		latestCheck(ctx, "success"),
		latestCheck(ctx),
		ctx.db
			.query("henryUnits")
			.withIndex("by_status_and_price", (q) => q.eq("status", "onMarket"))
			.take(MAX_ON_MARKET),
	]);

	const units = await Promise.all(
		onMarket.map(async (unit) =>
			ledgerUnit(unit, await readPriceChanges(ctx, unit, now), now),
		),
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
		units,
	};
}

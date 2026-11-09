import type { Infer } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import { latestCheck, trackingBeganAt } from "./checks";
import type { henryLedgerValidator } from "./validators";

export type HenryLedger = Infer<typeof henryLedgerValidator>;

const DAY = 24 * 60 * 60 * 1000;
/** "New" lasts this long after listing. */
const NEW_FOR = 7 * DAY;
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

	const units = onMarket.map((unit) => ({
		_id: unit._id,
		number: unit.number,
		floor: unit.floor,
		floorPlan: unit.floorPlan,
		beds: unit.beds,
		baths: unit.baths,
		sqft: unit.sqft,
		facesI25: unit.facesI25,
		price: unit.price,
		totalPrice: unit.totalPrice,
		leaseTermMonths: unit.leaseTermMonths,
		availableOn: unit.availableOn,
		specials: unit.specials,
		newDays: newDays(unit.listedAt, now),
	}));

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

/** Whole days since it listed, while it's still New; null otherwise. */
function newDays(listedAt: number | null, now: number): number | null {
	if (listedAt === null) return null;
	const age = Math.max(0, now - listedAt);
	return age < NEW_FOR ? Math.floor(age / DAY) : null;
}

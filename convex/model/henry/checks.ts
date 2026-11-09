import type { Infer } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { type HenryUnitFacts, parseSightmap } from "./sightmap";
import type { henryCheckResultValidator } from "./validators";

export type HenryCheckResult = Infer<typeof henryCheckResultValidator>;

const DAY = 24 * 60 * 60 * 1000;
/** Check log retention. */
const KEEP_CHECKS_FOR = 30 * DAY;
/** Old checks deleted per check: hourly checks, so a few keep up. */
const PRUNE_PER_CHECK = 5;
/** Far above The Henry's ~250 apartments: a bound, not a page size. */
export const MAX_ON_MARKET = 400;
/** Successful checks in a row a unit can be missing from before it's gone. */
const MISSES_TO_GO = 2;

/**
 * Records one hourly check. A response that can't be read, or (after the
 * baseline) one that's empty or under half the units on the market, is
 * logged as a failure and changes nothing. A good one updates every unit in
 * it: the first successful check is the baseline (units "tracked since"
 * then); after it, units not seen before are listed and gone units seen
 * again are relisted. Units on the market but missing from it get a miss;
 * two in a row take them off the market. A price point is recorded only
 * when base rent changes.
 */
export async function recordCheck(
	ctx: MutationCtx,
	now: number,
	result: HenryCheckResult,
): Promise<void> {
	await pruneOldChecks(ctx, now);

	const parsed =
		result.kind === "fetchFailed"
			? ({ ok: false, reason: result.reason } as const)
			: parseSightmap(result.body);
	if (!parsed.ok) {
		await logCheck(ctx, now, { outcome: "failure", reason: parsed.reason });
		return;
	}

	const isBaseline = (await trackingBeganAt(ctx)) === null;
	if (isBaseline && parsed.units.length === 0) {
		await logCheck(ctx, now, {
			outcome: "failure",
			reason: "No units in the first check",
		});
		return;
	}

	const onMarket = isBaseline
		? []
		: await ctx.db
				.query("henryUnits")
				.withIndex("by_status_and_price", (q) => q.eq("status", "onMarket"))
				.take(MAX_ON_MARKET);
	const short = shortResponseReason(parsed.units.length, onMarket.length);
	if (!isBaseline && short !== null) {
		await logCheck(ctx, now, { outcome: "failure", reason: short });
		return;
	}

	for (const facts of parsed.units) {
		await recordUnit(ctx, now, facts, isBaseline);
	}
	const seen = new Set(parsed.units.map((facts) => facts.sightmapId));
	for (const unit of onMarket) {
		if (!seen.has(unit.sightmapId)) await recordMiss(ctx, now, unit);
	}
	await logCheck(ctx, now, {
		outcome: "success",
		unitCount: parsed.units.length,
	});
}

async function recordUnit(
	ctx: MutationCtx,
	now: number,
	facts: HenryUnitFacts,
	isBaseline: boolean,
): Promise<void> {
	const existing = await ctx.db
		.query("henryUnits")
		.withIndex("by_sightmapId", (q) => q.eq("sightmapId", facts.sightmapId))
		.unique();

	if (existing === null) {
		const unitId = await ctx.db.insert("henryUnits", {
			...facts,
			status: "onMarket",
			firstSeenAt: now,
			lastSeenAt: now,
			listedAt: isBaseline ? null : now,
			missedChecks: 0,
			offMarketAt: null,
		});
		await ctx.db.insert("henryUnitEvents", {
			unitId,
			kind: isBaseline ? "trackingBegan" : "listed",
			at: now,
			price: facts.price,
		});
		await recordPricePoint(ctx, unitId, now, facts);
		return;
	}

	if (existing.price !== facts.price) {
		await recordPricePoint(ctx, existing._id, now, facts);
	}
	// Listed vs relisted is decided here: a known unit back from off the
	// market is relisted (ticket 06 pushes for it here, like a new listing).
	const relisted = existing.status === "offMarket";
	if (relisted) {
		await ctx.db.insert("henryUnitEvents", {
			unitId: existing._id,
			kind: "relisted",
			at: now,
			price: facts.price,
		});
	}
	await ctx.db.patch("henryUnits", existing._id, {
		...facts,
		lastSeenAt: now,
		missedChecks: 0,
		...(relisted
			? { status: "onMarket", listedAt: now, offMarketAt: null }
			: {}),
	});
}

/** A unit on the market missing from a successful check: the second miss in a row takes it off. */
async function recordMiss(
	ctx: MutationCtx,
	now: number,
	unit: Doc<"henryUnits">,
): Promise<void> {
	const missedChecks = unit.missedChecks + 1;
	if (missedChecks < MISSES_TO_GO) {
		await ctx.db.patch("henryUnits", unit._id, { missedChecks });
		return;
	}
	await ctx.db.patch("henryUnits", unit._id, {
		missedChecks,
		status: "offMarket",
		offMarketAt: now,
	});
	await ctx.db.insert("henryUnitEvents", {
		unitId: unit._id,
		kind: "offMarket",
		at: now,
		price: unit.price,
	});
}

/**
 * Why a response is too short to trust after the baseline (a broken page on
 * their side, not a building emptying out), or null when it's fine.
 */
function shortResponseReason(
	unitCount: number,
	onMarketCount: number,
): string | null {
	if (unitCount === 0) return "No units in the response";
	if (unitCount * 2 < onMarketCount) {
		return `Only ${unitCount} units, under half of the ${onMarketCount} on the market`;
	}
	return null;
}

async function recordPricePoint(
	ctx: MutationCtx,
	unitId: Doc<"henryUnits">["_id"],
	at: number,
	facts: HenryUnitFacts,
): Promise<void> {
	await ctx.db.insert("henryPricePoints", {
		unitId,
		at,
		price: facts.price,
		totalPrice: facts.totalPrice,
		leaseTermMonths: facts.leaseTermMonths,
	});
}

async function logCheck(
	ctx: MutationCtx,
	at: number,
	check:
		| { outcome: "success"; unitCount: number }
		| { outcome: "failure"; reason: string },
): Promise<void> {
	await ctx.db.insert("henryChecks", {
		at,
		outcome: check.outcome,
		reason: check.outcome === "failure" ? check.reason : null,
		unitCount: check.outcome === "success" ? check.unitCount : null,
	});
}

async function pruneOldChecks(ctx: MutationCtx, now: number): Promise<void> {
	const old = await ctx.db
		.query("henryChecks")
		.withIndex("by_at", (q) => q.lt("at", now - KEEP_CHECKS_FOR))
		.take(PRUNE_PER_CHECK);
	for (const check of old) {
		await ctx.db.delete("henryChecks", check._id);
	}
}

/**
 * When the baseline was taken: the first unit ever seen. Null before the
 * first successful check. (Read from units, not the check log, which is
 * pruned.)
 */
export async function trackingBeganAt(ctx: QueryCtx): Promise<number | null> {
	const first = await ctx.db
		.query("henryUnits")
		.withIndex("by_firstSeenAt")
		.first();
	return first?.firstSeenAt ?? null;
}

export async function latestCheck(
	ctx: QueryCtx,
	outcome?: Doc<"henryChecks">["outcome"],
): Promise<Doc<"henryChecks"> | null> {
	const checks =
		outcome === undefined
			? ctx.db.query("henryChecks").withIndex("by_at")
			: ctx.db
					.query("henryChecks")
					.withIndex("by_outcome_and_at", (q) => q.eq("outcome", outcome));
	return await checks.order("desc").first();
}

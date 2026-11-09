import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/** How a unit is starred: itself, its floor plan, both or neither. */
export type HenryStar = { unitStarred: boolean; planStarred: boolean };

/**
 * Starred floor plans: The Henry has about 15 plans, so this is a bound,
 * not an expected size.
 */
const MAX_STARRED_PLANS = 100;
/** Floor plan names are short codes like "B2" or "TH". */
const MAX_PLAN_LENGTH = 20;

/** Every starred floor plan, sorted by name. */
export async function readStarredPlans(ctx: QueryCtx): Promise<string[]> {
	const rows = await ctx.db
		.query("henryStarredPlans")
		.withIndex("by_floorPlan")
		.take(MAX_STARRED_PLANS);
	return rows.map((row) => row.floorPlan);
}

/**
 * Whether `unit` is starred itself and whether its floor plan is. Pass the
 * starred plans when reading many units, to read them once.
 */
export async function readStar(
	ctx: QueryCtx,
	unit: Pick<Doc<"henryUnits">, "_id" | "floorPlan">,
	starredPlans?: ReadonlySet<string>,
): Promise<HenryStar> {
	const [direct, planStarred] = await Promise.all([
		unitStarRow(ctx, unit._id),
		starredPlans
			? starredPlans.has(unit.floorPlan)
			: planStarRow(ctx, unit.floorPlan).then((row) => row !== null),
	]);
	return { unitStarred: direct !== null, planStarred };
}

/**
 * Starred = starred itself or through its floor plan. Record check uses
 * this to decide whether a new or relisted unit always pushes (ticket 06).
 */
export async function isStarred(
	ctx: QueryCtx,
	unit: Pick<Doc<"henryUnits">, "_id" | "floorPlan">,
): Promise<boolean> {
	const star = await readStar(ctx, unit);
	return star.unitStarred || star.planStarred;
}

/** Stars the unit, or unstars it if starred. Returns whether it's now starred. */
export async function toggleUnitStar(
	ctx: MutationCtx,
	unitId: Id<"henryUnits">,
	now: number,
): Promise<boolean> {
	const unit = await ctx.db.get("henryUnits", unitId);
	if (unit === null) throw new ConvexError("That unit isn't tracked.");
	const row = await unitStarRow(ctx, unitId);
	if (row !== null) {
		await ctx.db.delete("henryStarredUnits", row._id);
		return false;
	}
	await ctx.db.insert("henryStarredUnits", { unitId, starredAt: now });
	return true;
}

/**
 * Stars the floor plan (every unit on it, now and later), or unstars it if
 * starred. Returns whether it's now starred.
 */
export async function toggleFloorPlanStar(
	ctx: MutationCtx,
	floorPlan: string,
	now: number,
): Promise<boolean> {
	const plan = floorPlan.trim();
	if (plan === "" || plan.length > MAX_PLAN_LENGTH) {
		throw new ConvexError("That isn't a floor plan.");
	}
	const row = await planStarRow(ctx, plan);
	if (row !== null) {
		await ctx.db.delete("henryStarredPlans", row._id);
		return false;
	}
	await ctx.db.insert("henryStarredPlans", { floorPlan: plan, starredAt: now });
	return true;
}

async function unitStarRow(
	ctx: QueryCtx,
	unitId: Id<"henryUnits">,
): Promise<Doc<"henryStarredUnits"> | null> {
	return await ctx.db
		.query("henryStarredUnits")
		.withIndex("by_unitId", (q) => q.eq("unitId", unitId))
		.first();
}

async function planStarRow(
	ctx: QueryCtx,
	floorPlan: string,
): Promise<Doc<"henryStarredPlans"> | null> {
	return await ctx.db
		.query("henryStarredPlans")
		.withIndex("by_floorPlan", (q) => q.eq("floorPlan", floorPlan))
		.first();
}

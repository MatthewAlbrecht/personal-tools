import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Stars from "../model/henry/stars";

/** Stars a unit, or unstars it if starred. Returns whether it's now starred. */
export const toggleUnitStar = mutation({
	args: { unitId: v.id("henryUnits") },
	returns: v.boolean(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Stars.toggleUnitStar(ctx, args.unitId, Date.now());
	},
});

/**
 * Stars a floor plan (e.g. "B2"), so every unit on it counts as starred,
 * including ones that list later; or unstars it if starred. Returns whether
 * it's now starred.
 */
export const toggleFloorPlanStar = mutation({
	args: { floorPlan: v.string() },
	returns: v.boolean(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Stars.toggleFloorPlanStar(ctx, args.floorPlan, Date.now());
	},
});

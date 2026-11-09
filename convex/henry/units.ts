import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Units from "../model/henry/units";
import { henryUnitDetailsValidator } from "../model/henry/validators";

/**
 * One unit's drawer by its number (e.g. "608"): facts, price changes at
 * `now` (Unix ms; a query can't read the clock), price history and timeline.
 * Null when no unit with that number was ever seen.
 */
export const getUnit = query({
	args: { number: v.string(), now: v.number() },
	returns: v.union(henryUnitDetailsValidator, v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Units.readUnitDetails(ctx, args.number, args.now);
	},
});

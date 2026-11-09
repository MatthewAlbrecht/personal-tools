import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAuth } from "../auth";
import * as Ledger from "../model/henry/ledger";
import { henryLedgerValidator } from "../model/henry/validators";

/**
 * The Henry page: the summary line, every unit on the market (cheapest
 * first) and the units gone this week. Pass `now` (Unix ms; a query can't
 * read the clock) to judge which units are New, which went this week, and
 * whether checks are failing.
 */
export const getLedger = query({
	args: { now: v.number() },
	returns: henryLedgerValidator,
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await Ledger.readLedger(ctx, args.now);
	},
});

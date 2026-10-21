import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import * as TitleReadRetry from "../model/yugioh/titleReadRetry";

/**
 * Backfill: re-reads every Listing whose title read failed (e.g. before the
 * TypeSafe key was set), with fresh attempts, a page at a time. Run until
 * `isDone`, passing back `cursor`:
 * `npx convex run yugioh/titleReadRetry:requeueFailedTitleReads '{"paginationOpts":{"numItems":100,"cursor":null}}'`.
 */
export const requeueFailedTitleReads = internalMutation({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		queued: v.number(),
		isDone: v.boolean(),
		cursor: v.string(),
	}),
	handler: async (ctx, args) => {
		return await TitleReadRetry.requeueFailedTitleReads(
			ctx,
			args.paginationOpts,
		);
	},
});

/** Hourly cron: retries failed title reads that are due. */
export const retryFailedTitleReads = internalMutation({
	args: {},
	returns: v.object({ queued: v.number() }),
	handler: async (ctx) => {
		return {
			queued: await TitleReadRetry.retryDueTitleReads(ctx, Date.now()),
		};
	},
});

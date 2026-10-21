// Trying failed title reads again: by hand (a backfill) and on a timer. Each
// batch is staggered so it never fires its TypeSafe calls all at once.
import type { PaginationOptions } from "convex/server";
import { TITLE_READ_STAGGER_MS } from "../../../src/lib/yugioh/title-read-retry";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** Most failed reads one timed retry re-queues. */
export const MAX_RETRIES_PER_RUN = 50;

/**
 * Re-queues a page of failed reads, whether or not they're due or out of
 * attempts, with a fresh set of attempts. For after the TypeSafe key is set.
 */
export async function requeueFailedTitleReads(
	ctx: MutationCtx,
	paginationOpts: PaginationOptions,
): Promise<{ queued: number; isDone: boolean; cursor: string }> {
	const page = await ctx.db
		.query("yugiohListings")
		.withIndex("by_titleReadStatus", (q) => q.eq("titleReadStatus", "failed"))
		.paginate(paginationOpts);
	for (const [index, listing] of page.page.entries()) {
		await requeue(ctx, listing._id, index, { resetAttempts: true });
	}
	return {
		queued: page.page.length,
		isDone: page.isDone,
		cursor: page.continueCursor,
	};
}

/**
 * Re-queues the failed reads that are due a retry, oldest due first. Listings
 * out of attempts have no retry time, so they stay failed.
 */
export async function retryDueTitleReads(
	ctx: MutationCtx,
	now: number,
): Promise<number> {
	const due = await ctx.db
		.query("yugiohListings")
		.withIndex("by_titleReadRetryAt", (q) =>
			q.gte("titleReadRetryAt", 0).lte("titleReadRetryAt", now),
		)
		.take(MAX_RETRIES_PER_RUN);
	let queued = 0;
	for (const listing of due) {
		if (listing.titleReadStatus !== "failed") continue;
		await requeue(ctx, listing._id, queued, { resetAttempts: false });
		queued++;
	}
	return queued;
}

async function requeue(
	ctx: MutationCtx,
	listingId: Id<"yugiohListings">,
	position: number,
	{ resetAttempts }: { resetAttempts: boolean },
): Promise<void> {
	await ctx.db.patch("yugiohListings", listingId, {
		titleReadStatus: "reading",
		titleReadRetryAt: undefined,
		...(resetAttempts ? { titleReadAttempts: undefined } : {}),
	});
	await ctx.scheduler.runAfter(
		position * TITLE_READ_STAGGER_MS,
		internal.yugioh.titleReading.readTitle,
		{ listingId },
	);
}

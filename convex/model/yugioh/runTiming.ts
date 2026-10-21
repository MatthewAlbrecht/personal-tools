import {
	POSTING_WINDOW_MS,
	type RunTiming,
	learnRunTiming,
} from "../../../src/lib/yugioh/run-timing";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { matchedPrintingId } from "./deals";
import { userTimeZone } from "./pushes";

/**
 * Most Listings read to learn posting times: the newest captured in the
 * window. Past it, the oldest weeks are undercounted.
 */
const MAX_LISTINGS_READ = 2000;

/**
 * When scheduled full runs happen, as last learned. Before the first
 * relearn: still learning, since the first capture.
 */
export async function readRunTiming(ctx: QueryCtx): Promise<RunTiming> {
	const stored = await ctx.db.query("yugiohRunTiming").first();
	if (stored) {
		const { status, dataSince, timeZone, busyHours } = stored;
		return { status, dataSince, timeZone, busyHours };
	}
	return {
		status: "learning",
		dataSince: await firstCaptureAt(ctx),
		timeZone: await userTimeZone(ctx),
		busyHours: [],
	};
}

/**
 * Relearns when full runs happen from when the Listings matched to my
 * Printings went up. Only eBay's own listing time counts: when a capture
 * first saw a Listing follows the run schedule, so it would only learn the
 * schedule back. A Listing went up before it was captured, so those listed
 * in the window were all captured in it.
 */
export async function relearnRunTiming(
	ctx: MutationCtx,
	now: number,
): Promise<void> {
	const listedTimes: number[] = [];
	let read = 0;
	// Newest captured first (by creation time), until the window's start.
	for await (const listing of ctx.db.query("yugiohListings").order("desc")) {
		if (listing._creationTime <= now - POSTING_WINDOW_MS) break;
		if (++read > MAX_LISTINGS_READ) break;
		if (listing.listedAt !== null && matchedPrintingId(listing) !== null) {
			listedTimes.push(listing.listedAt);
		}
	}
	const timing = learnRunTiming({
		listedTimes,
		dataSince: await firstCaptureAt(ctx),
		timeZone: await userTimeZone(ctx),
		now,
	});
	const stored = await ctx.db.query("yugiohRunTiming").first();
	if (stored) {
		await ctx.db.replace("yugiohRunTiming", stored._id, {
			...timing,
			learnedAt: now,
		});
	} else {
		await ctx.db.insert("yugiohRunTiming", { ...timing, learnedAt: now });
	}
}

/** When the first Listing was captured; null before any. */
async function firstCaptureAt(ctx: QueryCtx): Promise<number | null> {
	const first = await ctx.db.query("yugiohListings").order("asc").first();
	return first?.firstSeenAt ?? null;
}

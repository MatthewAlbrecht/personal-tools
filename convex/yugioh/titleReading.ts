import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { TitleJudgments } from "../../src/lib/yugioh/title-reading";
import { internal } from "../_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import * as Matching from "../model/yugioh/matching";
import { judgeTitle } from "../model/yugioh/titleReader";
import { yugiohTitleJudgmentsValidator } from "../model/yugioh/validators";

/**
 * Reads one Listing's title with the AI, then matches the Listing. Scheduled
 * by ingest for a new Listing or a changed title, never on a timer. If the AI
 * fails, the title's set code still decides what it can.
 */
export const readTitle = internalAction({
	args: { listingId: v.id("yugiohListings") },
	returns: v.null(),
	handler: async (ctx, { listingId }) => {
		const toRead = await ctx.runQuery(
			internal.yugioh.titleReading.getTitleToRead,
			{ listingId },
		);
		if (!toRead) return null;
		let judgments: TitleJudgments | null = null;
		try {
			judgments = await judgeTitle(toRead.title, toRead);
		} catch (error) {
			console.error(`Couldn't read Listing title "${toRead.title}"`, error);
		}
		await ctx.runMutation(internal.yugioh.titleReading.saveTitleRead, {
			listingId,
			title: toRead.title,
			judgments,
		});
		return null;
	},
});

export const getTitleToRead = internalQuery({
	args: { listingId: v.id("yugiohListings") },
	returns: v.union(
		v.object({
			title: v.string(),
			setCodes: v.array(v.string()),
			rarities: v.array(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, { listingId }) => {
		return await Matching.titleToRead(ctx, listingId);
	},
});

export const saveTitleRead = internalMutation({
	args: {
		listingId: v.id("yugiohListings"),
		title: v.string(),
		judgments: v.union(yugiohTitleJudgmentsValidator, v.null()),
	},
	returns: v.null(),
	handler: async (ctx, { listingId, title, judgments }) => {
		await Matching.saveTitleRead(ctx, listingId, title, judgments);
		return null;
	},
});

/**
 * One-off backfill: queues AI reads for Listings captured before title reading
 * existed. Run until it returns `{ queued: 0 }`:
 * `npx convex run yugioh/titleReading:queueUnreadTitles '{}'`.
 */
export const queueUnreadTitles = internalMutation({
	args: { batchSize: v.optional(v.number()) },
	returns: v.object({ queued: v.number() }),
	handler: async (ctx, { batchSize }) => {
		const size = Math.min(Math.max(Math.floor(batchSize ?? 100), 1), 250);
		return { queued: await Matching.queueUnreadTitles(ctx, size) };
	},
});

/**
 * One-off backfill: re-derives the language of Listings read before a language
 * the title states beat the set code ("CP04-EN003 … Japanese" was English), a
 * page at a time, without the AI. Run until `isDone`, passing back `cursor`:
 * `npx convex run yugioh/titleReading:rederiveListingLanguages '{"paginationOpts":{"numItems":200,"cursor":null}}'`.
 */
export const rederiveListingLanguages = internalMutation({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		updated: v.number(),
		isDone: v.boolean(),
		cursor: v.string(),
	}),
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("yugiohListings")
			.paginate(args.paginationOpts);
		let updated = 0;
		for (const listing of page.page) {
			if (await Matching.rederiveListingLanguage(ctx, listing)) updated++;
		}
		return { updated, isDone: page.isDone, cursor: page.continueCursor };
	},
});

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { GeniusCredit } from "./_utils/geniusParser";
import {
	collectCreditLabelsFromCredits,
	isCreditLabelIgnored,
	normalizeCreditLabelKey,
	sortCreditLabelsForAdminList,
	sortIgnoredCreditLabelsForAdminList,
} from "./_utils/geniusCreditVisibility";
import { requireAuth } from "./auth";

const creditLabelRowValidator = v.object({
	_id: v.id("geniusCreditLabels"),
	key: v.string(),
	label: v.string(),
	hiddenByDefault: v.boolean(),
	updatedAt: v.number(),
});

const ignoredCreditLabelRowValidator = v.object({
	_id: v.id("geniusCreditLabels"),
	key: v.string(),
	label: v.string(),
	updatedAt: v.number(),
});

export async function getSiteWideHiddenCreditLabelKeys(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
): Promise<string[]> {
	const rows = await ctx.db
		.query("geniusCreditLabels")
		.withIndex("by_hiddenByDefault", (q) => q.eq("hiddenByDefault", true))
		.collect();

	return rows.filter((row) => row.ignored !== true).map((row) => row.key);
}

export async function getIgnoredCreditLabelKeys(
	ctx: Pick<QueryCtx | MutationCtx, "db">,
): Promise<string[]> {
	const rows = await ctx.db
		.query("geniusCreditLabels")
		.withIndex("by_ignored", (q) => q.eq("ignored", true))
		.collect();

	return rows.map((row) => row.key);
}

export const listCreditLabels = query({
	args: {},
	returns: v.array(creditLabelRowValidator),
	handler: async (ctx) => {
		requireAuth(ctx);

		const ignoredLabelKeys = await getIgnoredCreditLabelKeys(ctx);
		const rows = await ctx.db.query("geniusCreditLabels").collect();
		return sortCreditLabelsForAdminList(
			rows
				.filter(
					(row) =>
						row.ignored !== true &&
						!isCreditLabelIgnored(row.label, ignoredLabelKeys),
				)
				.map((row) => ({
					_id: row._id,
					key: row.key,
					label: row.label,
					hiddenByDefault: row.hiddenByDefault,
					updatedAt: row.updatedAt,
				})),
		);
	},
});

export const listIgnoredCreditLabels = query({
	args: {},
	returns: v.array(ignoredCreditLabelRowValidator),
	handler: async (ctx) => {
		requireAuth(ctx);

		const rows = await ctx.db
			.query("geniusCreditLabels")
			.withIndex("by_ignored", (q) => q.eq("ignored", true))
			.collect();

		return sortIgnoredCreditLabelsForAdminList(
			rows.map((row) => ({
				_id: row._id,
				key: row.key,
				label: row.label,
				updatedAt: row.updatedAt,
			})),
		);
	},
});

export const refreshCreditLabels = mutation({
	args: {},
	returns: v.object({
		discoveredCount: v.number(),
		insertedCount: v.number(),
		updatedCount: v.number(),
	}),
	handler: async (ctx) => {
		requireAuth(ctx);

		const now = Date.now();
		const ignoredLabelKeys = await getIgnoredCreditLabelKeys(ctx);
		const discoveredLabels = new Map<string, string>();

		const albumSongs = await ctx.db.query("geniusSongs").collect();
		for (const song of albumSongs) {
			for (const label of collectCreditLabelsFromCredits(
				song.credits,
				ignoredLabelKeys,
			)) {
				const key = normalizeCreditLabelKey(label);
				if (!key) continue;
				if (!discoveredLabels.has(key)) {
					discoveredLabels.set(key, label);
				}
			}
		}

		const scrapes = await ctx.db.query("geniusLyricScrapes").collect();
		for (const scrape of scrapes) {
			for (const label of collectCreditLabelsFromCredits(
				scrape.credits,
				ignoredLabelKeys,
			)) {
				const key = normalizeCreditLabelKey(label);
				if (!key) continue;
				if (!discoveredLabels.has(key)) {
					discoveredLabels.set(key, label);
				}
			}
		}

		let insertedCount = 0;
		let updatedCount = 0;

		for (const [key, label] of discoveredLabels.entries()) {
			const existing = await ctx.db
				.query("geniusCreditLabels")
				.withIndex("by_key", (q) => q.eq("key", key))
				.first();

			if (existing) {
				if (existing.ignored === true) continue;
				if (existing.label !== label) {
					await ctx.db.patch(existing._id, { label, updatedAt: now });
					updatedCount += 1;
				}
				continue;
			}

			await ctx.db.insert("geniusCreditLabels", {
				key,
				label,
				hiddenByDefault: false,
				ignored: false,
				createdAt: now,
				updatedAt: now,
			});
			insertedCount += 1;
		}

		return {
			discoveredCount: discoveredLabels.size,
			insertedCount,
			updatedCount,
		};
	},
});

export const addIgnoredCreditLabel = mutation({
	args: {
		label: v.string(),
	},
	returns: v.id("geniusCreditLabels"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const trimmed = args.label.trim();
		if (!trimmed) {
			throw new Error("Ignored credit label is required");
		}

		const key = normalizeCreditLabelKey(trimmed);
		if (!key) {
			throw new Error("Ignored credit label is required");
		}

		const now = Date.now();
		const existing = await ctx.db
			.query("geniusCreditLabels")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				label: trimmed,
				ignored: true,
				hiddenByDefault: false,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("geniusCreditLabels", {
			key,
			label: trimmed,
			hiddenByDefault: false,
			ignored: true,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const removeIgnoredCreditLabel = mutation({
	args: {
		key: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const key = normalizeCreditLabelKey(args.key);
		if (!key) {
			throw new Error("Ignored credit label key is required");
		}

		const row = await ctx.db
			.query("geniusCreditLabels")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();

		if (!row || row.ignored !== true) {
			throw new Error("Ignored credit label not found");
		}

		await ctx.db.patch(row._id, {
			ignored: false,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const setCreditLabelHiddenByDefault = mutation({
	args: {
		key: v.string(),
		hiddenByDefault: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const key = normalizeCreditLabelKey(args.key);
		if (!key) {
			throw new Error("Credit label key is required");
		}

		const row = await ctx.db
			.query("geniusCreditLabels")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();

		if (!row) {
			throw new Error("Credit label not found");
		}

		if (row.ignored === true) {
			throw new Error("Ignored credit labels cannot be hidden by default");
		}

		await ctx.db.patch(row._id, {
			hiddenByDefault: args.hiddenByDefault,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export type CreditLabelRow = Doc<"geniusCreditLabels">;

export type { GeniusCredit };

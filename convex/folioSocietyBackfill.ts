import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	type MutationCtx,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
} from "./_generated/server";
import { requireAuth } from "./auth";
import { catalogFieldsFromProduct } from "./folioSocietyReleases";

const FOLIO_LOAD_HEADERS = {
	"sec-ch-ua-platform": '"macOS"',
	Referer: "https://www.foliosociety.com/usa/the-complete-collection",
	"sec-ch-ua": '"Chromium";v="139", "Not;A=Brand";v="99"',
	"sec-ch-ua-mobile": "?0",
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
	Accept: "application/json, text/plain, */*",
	"X-Store-Id": "2",
	DNT: "1",
};

const BATCH_SIZE = 50;

const releaseBatchValidator = v.object({
	ids: v.array(v.number()),
	continueCursor: v.union(v.string(), v.null()),
	isDone: v.boolean(),
});

export const listStoredReleaseBatch = internalQuery({
	args: {
		cursor: v.union(v.string(), v.null()),
	},
	returns: releaseBatchValidator,
	handler: async (ctx, args) => {
		const page = await ctx.db.query("folioSocietyReleases").paginate({
			numItems: BATCH_SIZE,
			cursor: args.cursor,
		});
		return {
			ids: page.page.map((release) => release.id),
			continueCursor: page.isDone ? null : page.continueCursor,
			isDone: page.isDone,
		};
	},
});

async function beginStoredCatalogBackfill(ctx: MutationCtx): Promise<null> {
	requireAuth(ctx);
	const config = await ctx.db.query("folioSocietyConfig").first();
	if (!config) {
		throw new Error("Folio Society config missing");
	}
	await ctx.db.patch(config._id, {
		backfillStatus: "running",
		backfillCursor: null,
		backfillProcessedCount: 0,
	});
	await ctx.scheduler.runAfter(0, internal.folioSocietyBackfill.runBatch, {
		cursor: null,
		processedCount: 0,
	});
	return null;
}

export const startStoredCatalogBackfill = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		return await beginStoredCatalogBackfill(ctx);
	},
});

/** Kept for existing settings UI; prefer startStoredCatalogBackfill. */
export const startFolioCatalogBackfill = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		return await beginStoredCatalogBackfill(ctx);
	},
});

export const applyBatch = internalMutation({
	args: {
		cursor: v.union(v.string(), v.null()),
		processedCount: v.number(),
		done: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const config = await ctx.db.query("folioSocietyConfig").first();
		if (!config) {
			throw new Error("Folio Society config missing");
		}
		await ctx.db.patch(config._id, {
			backfillCursor: args.cursor,
			backfillProcessedCount: args.processedCount,
			backfillStatus: args.done ? "done" : "running",
		});
		if (!args.done) {
			await ctx.scheduler.runAfter(0, internal.folioSocietyBackfill.runBatch, {
				cursor: args.cursor,
				processedCount: args.processedCount,
			});
		}
		return null;
	},
});

export const markBackfillError = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const config = await ctx.db.query("folioSocietyConfig").first();
		if (!config) {
			return null;
		}
		await ctx.db.patch(config._id, {
			backfillStatus: "error",
		});
		return null;
	},
});

export const runBatch = internalAction({
	args: {
		cursor: v.union(v.string(), v.null()),
		processedCount: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			const batch: {
				ids: number[];
				continueCursor: string | null;
				isDone: boolean;
			} = await ctx.runQuery(
				internal.folioSocietyBackfill.listStoredReleaseBatch,
				{ cursor: args.cursor },
			);

			if (batch.ids.length === 0) {
				await ctx.runMutation(internal.folioSocietyBackfill.applyBatch, {
					cursor: null,
					processedCount: args.processedCount,
					done: true,
				});
				return null;
			}

			const products = await fetchFolioProducts(batch.ids);
			for (const product of products) {
				if (
					typeof product !== "object" ||
					product === null ||
					typeof (product as Record<string, unknown>).id !== "number" ||
					typeof (product as Record<string, unknown>).name !== "string"
				) {
					continue;
				}
				await ctx.runMutation(
					internal.folioSocietyCatalog.applyCatalogFields,
					catalogFieldsFromProduct(product as Record<string, unknown>),
				);
			}

			const nextProcessed = args.processedCount + batch.ids.length;
			await ctx.runMutation(internal.folioSocietyBackfill.applyBatch, {
				cursor: batch.continueCursor,
				processedCount: nextProcessed,
				done: batch.isDone,
			});
		} catch (error) {
			console.error("Folio catalog backfill batch failed:", error);
			await ctx.runMutation(
				internal.folioSocietyBackfill.markBackfillError,
				{},
			);
		}
		return null;
	},
});

async function fetchFolioProducts(ids: number[]): Promise<unknown[]> {
	if (ids.length === 0) {
		return [];
	}

	const apiUrl = `https://www.foliosociety.com/usa/api/n/load?type=product&verbosity=3&ids=${ids.join(
		",",
	)}&pushDeps=false`;

	const response = await fetch(apiUrl, {
		headers: FOLIO_LOAD_HEADERS,
	});

	if (!response.ok) {
		throw new Error(
			`API request failed: ${response.status} ${response.statusText}`,
		);
	}

	const data: unknown = await response.json();
	if (
		typeof data !== "object" ||
		data === null ||
		!("result" in data) ||
		!Array.isArray(data.result)
	) {
		throw new Error("Invalid API response format");
	}

	return data.result as unknown[];
}

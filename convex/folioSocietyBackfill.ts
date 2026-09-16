import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
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

const configRangeValidator = v.object({
	startId: v.number(),
	endId: v.number(),
});

export const getConfigInternal = internalQuery({
	args: {},
	returns: v.union(configRangeValidator, v.null()),
	handler: async (ctx) => {
		const config = await ctx.db.query("folioSocietyConfig").first();
		if (!config) {
			return null;
		}
		return { startId: config.startId, endId: config.endId };
	},
});

export const startFolioCatalogBackfill = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		requireAuth(ctx);
		const config = await ctx.db.query("folioSocietyConfig").first();
		if (!config) {
			throw new Error("Folio Society config missing");
		}
		const cursor = config.startId - 1;
		await ctx.db.patch(config._id, {
			backfillStatus: "running",
			backfillCursorExternalId: cursor,
		});
		await ctx.scheduler.runAfter(0, internal.folioSocietyBackfill.runBatch, {
			cursor,
		});
		return null;
	},
});

export const applyBatch = internalMutation({
	args: {
		cursorAfter: v.number(),
		done: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const config = await ctx.db.query("folioSocietyConfig").first();
		if (!config) {
			throw new Error("Folio Society config missing");
		}
		await ctx.db.patch(config._id, {
			backfillCursorExternalId: args.cursorAfter,
			backfillStatus: args.done ? "done" : "running",
		});
		if (!args.done) {
			await ctx.scheduler.runAfter(0, internal.folioSocietyBackfill.runBatch, {
				cursor: args.cursorAfter,
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
		cursor: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const config: { startId: number; endId: number } | null =
			await ctx.runQuery(internal.folioSocietyBackfill.getConfigInternal, {});
		if (!config) {
			await ctx.runMutation(internal.folioSocietyBackfill.markBackfillError, {});
			return null;
		}

		if (args.cursor >= config.endId) {
			await ctx.runMutation(internal.folioSocietyBackfill.applyBatch, {
				cursorAfter: config.endId,
				done: true,
			});
			return null;
		}

		const firstId = args.cursor + 1;
		const lastId = Math.min(args.cursor + 25, config.endId);
		const ids: number[] = [];
		for (let id = firstId; id <= lastId; id++) {
			ids.push(id);
		}

		try {
			const products = await fetchFolioProducts(ids);
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
			await ctx.runMutation(internal.folioSocietyBackfill.applyBatch, {
				cursorAfter: lastId,
				done: lastId >= config.endId,
			});
		} catch (error) {
			console.error("Folio catalog backfill batch failed:", error);
			await ctx.runMutation(internal.folioSocietyBackfill.markBackfillError, {});
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

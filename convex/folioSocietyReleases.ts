import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { requireAuth } from "./auth";

// Type for the API product response
type FolioSocietyProduct = {
	id: number;
	sku: string;
	name: string;
	url: string;
	visibility: {
		catalog: boolean;
		search: boolean;
	};
	image?: string;
	price?: number;
	verbosity: number;
	type: string;
	store: number;
};

// Return type for sync action
type SyncResult = {
	success: boolean;
	syncedCount: number;
	totalIds: number;
	rangeExpanded: boolean;
	newEndId?: number;
	newReleases: FolioSocietyProduct[];
	newReleasesCount: number;
};

// Get all releases with optional filtering and sorting
export const getReleases = query({
	args: {
		limit: v.optional(v.number()),
		sortBy: v.optional(
			v.union(
				v.literal("firstSeenAt"),
				v.literal("lastSeenAt"),
				v.literal("name"),
				v.literal("price"),
				v.literal("id"),
			),
		),
		sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
		search: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Require authentication
		requireAuth(ctx);
		const { limit = 50, sortBy = "id", sortOrder = "desc", search } = args;

		let results = await ctx.db.query("folioSocietyReleases").collect();

		// Filter by search term
		if (search) {
			const searchLower = search.toLowerCase();
			results = results.filter((release) =>
				release.name.toLowerCase().includes(searchLower),
			);
		}

		// Sort results
		results.sort((a, b) => {
			const aVal = a[sortBy];
			const bVal = b[sortBy];

			let comparison = 0;
			if (typeof aVal === "string" && typeof bVal === "string") {
				comparison = aVal.localeCompare(bVal);
			} else if (typeof aVal === "number" && typeof bVal === "number") {
				comparison = aVal - bVal;
			}

			return sortOrder === "desc" ? -comparison : comparison;
		});

		// Apply limit
		return results.slice(0, limit);
	},
});

// Get a specific release by ID
export const getRelease = query({
	args: { id: v.id("folioSocietyReleases") },
	handler: async (ctx, args) => {
		// Require authentication
		requireAuth(ctx);
		return await ctx.db.get(args.id);
	},
});

// Get statistics about releases
export const getStats = query({
	args: {},
	handler: async (ctx) => {
		// Require authentication
		requireAuth(ctx);
		const releases = await ctx.db.query("folioSocietyReleases").collect();

		const total = releases.length;

		// Count releases from last 30 days
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
		const recent = releases.filter(
			(release) => release.firstSeenAt >= thirtyDaysAgo,
		).length;

		// Find most recent lastSeenAt
		const lastSync =
			releases.length > 0
				? Math.max(...releases.map((r) => r.lastSeenAt))
				: undefined;

		return {
			total,
			recent,
			lastSync,
		};
	},
});

export const getReleaseByExternalId = internalQuery({
	args: { id: v.number() },
	returns: v.union(v.id("folioSocietyReleases"), v.null()),
	handler: async (ctx, args): Promise<Id<"folioSocietyReleases"> | null> => {
		const release = await ctx.db
			.query("folioSocietyReleases")
			.withIndex("by_external_id", (q) => q.eq("id", args.id))
			.first();
		return release?._id ?? null;
	},
});

// Get all releases (simple query for sync action)
export const getAllReleases = query({
	args: {},
	handler: async (ctx) => {
		// Require authentication
		requireAuth(ctx);
		return await ctx.db.query("folioSocietyReleases").collect();
	},
});

// Get config (simple query for sync action)
export const getConfig = query({
	args: {},
	handler: async (ctx) => {
		// Require authentication
		requireAuth(ctx);
		return await ctx.db.query("folioSocietyConfig").first();
	},
});

// Create a new release
export const createRelease = mutation({
	args: {
		id: v.number(),
		sku: v.string(),
		name: v.string(),
		url: v.string(),
		visibility: v.any(),
		image: v.optional(v.string()),
		price: v.optional(v.number()),
		isActive: v.boolean(),
		firstSeenAt: v.number(),
		lastSeenAt: v.number(),
		lastUpdatedAt: v.number(),
	},
	handler: async (ctx, args) => {
		// Require authentication
		requireAuth(ctx);
		return await ctx.db.insert("folioSocietyReleases", args);
	},
});

// Update an existing release
export const updateRelease = mutation({
	args: {
		id: v.id("folioSocietyReleases"),
		sku: v.string(),
		name: v.string(),
		url: v.string(),
		visibility: v.any(),
		image: v.optional(v.string()),
		price: v.optional(v.number()),
		isActive: v.boolean(),
		lastSeenAt: v.number(),
		lastUpdatedAt: v.number(),
	},
	handler: async (ctx, args) => {
		// Require authentication
		requireAuth(ctx);
		const { id, ...updateData } = args;
		await ctx.db.patch(id, updateData);
	},
});

// Update config
export const updateConfig = mutation({
	args: {
		endId: v.number(),
		updatedAt: v.number(),
	},
	handler: async (ctx, args) => {
		// Require authentication
		requireAuth(ctx);
		const config = await ctx.db.query("folioSocietyConfig").first();
		if (config) {
			await ctx.db.patch(config._id, args);
		}
	},
});

// Sync releases from Folio Society API
export const syncReleases = action({
	args: {
		startId: v.optional(v.number()),
		endId: v.optional(v.number()),
		autoExpand: v.optional(v.boolean()),
		enrich: v.optional(v.boolean()),
		detailsTtlHours: v.optional(v.number()),
		maxConcurrent: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<SyncResult> => {
		// Require authentication
		requireAuth(ctx);
		// Get current config
		const config = (await ctx.runQuery(api.folioSocietyReleases.getConfig)) || {
			startId: 5130,
			endId: 5300,
			updatedAt: Date.now(),
		};

		if (!config) {
			throw new Error(
				"Configuration not found. Please update configuration first.",
			);
		}

		const {
			startId = config.startId,
			endId = config.endId,
			autoExpand = true,
			enrich = true,
		} = args;

		// Generate ID range
		const ids: number[] = Array.from(
			{ length: endId - startId + 1 },
			(_, i) => startId + i,
		);

		try {
			const rawProducts: unknown[] = [];
			for (const chunk of chunkIdRange(ids, 50)) {
				const chunkResult = await fetchFolioProducts(chunk);
				rawProducts.push(...chunkResult);
			}

			console.log(`📦 Raw products from API: ${rawProducts.length}`);

			// Validate products
			const validProducts: FolioSocietyProduct[] = rawProducts.filter(
				(product: unknown): product is FolioSocietyProduct => {
					if (typeof product !== "object" || product === null) return false;
					const p = product as Record<string, unknown>;
					return (
						typeof p.id === "number" &&
						typeof p.sku === "string" &&
						typeof p.name === "string" &&
						typeof p.url === "string" &&
						typeof p.visibility === "object"
					);
				},
			);

			console.log(`🔍 Processing ${validProducts.length} products from API...`);

			const newReleases: FolioSocietyProduct[] = [];
			const now = Date.now();

			// Update database with new/changed products
			for (const product of validProducts) {
				const existingId: Id<"folioSocietyReleases"> | null =
					await ctx.runQuery(
						internal.folioSocietyReleases.getReleaseByExternalId,
						{ id: product.id },
					);
				const isNew = existingId === null;

				if (isNew) {
					console.log(
						`🆕 NEW RELEASE FOUND: ${product.name} (ID: ${product.id}, SKU: ${product.sku})`,
					);
					newReleases.push(product);
				}

				if (existingId) {
					await ctx.runMutation(api.folioSocietyReleases.updateRelease, {
						id: existingId,
						sku: product.sku,
						name: product.name,
						url: product.url,
						visibility: product.visibility,
						image: product.image,
						price: product.price,
						isActive: true,
						lastSeenAt: now,
						lastUpdatedAt: now,
					});
				} else {
					await ctx.runMutation(api.folioSocietyReleases.createRelease, {
						id: product.id,
						sku: product.sku,
						name: product.name,
						url: product.url,
						visibility: product.visibility,
						image: product.image,
						price: product.price,
						isActive: true,
						firstSeenAt: now,
						lastSeenAt: now,
						lastUpdatedAt: now,
					});
				}

				await ctx.runMutation(
					internal.folioSocietyCatalog.applyCatalogFields,
					catalogFieldsFromProduct(
						product as unknown as Record<string, unknown>,
					),
				);
			}

			console.log(
				`✅ Database update completed. Found ${newReleases.length} new releases.`,
			);

			// Auto-expand range if enabled and we found products near the end
			let newConfig: { endId: number } | null = null;
			if (autoExpand && validProducts.length > 0) {
				const maxFoundId = Math.max(
					...validProducts.map((product) => product.id),
				);
				const currentRangeSize = endId - startId;

				// If we found products within 10% of the end of our range, expand it
				if (maxFoundId > endId - currentRangeSize * 0.1) {
					const newEndId = endId + 100; // Add 100 more IDs
					await ctx.runMutation(api.folioSocietyReleases.updateConfig, {
						endId: newEndId,
						updatedAt: now,
					});
					newConfig = { endId: newEndId };
				}
			}

			const result: SyncResult = {
				success: true,
				syncedCount: validProducts.length,
				totalIds: ids.length,
				rangeExpanded: newConfig !== null,
				newEndId: newConfig?.endId,
				newReleases,
				newReleasesCount: newReleases.length,
			};

			if (enrich) {
				console.log("⏭️  Sync skips auto-enrichment; use settings to enrich");
			}

			return result;
		} catch (error) {
			console.error("Error syncing Folio Society releases:", error);
			throw new Error(
				`Failed to sync releases: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
	},
});

function chunkIdRange(ids: number[], size: number): number[][] {
	const chunks: number[][] = [];
	for (let i = 0; i < ids.length; i += size) {
		chunks.push(ids.slice(i, i + size));
	}
	return chunks;
}

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

async function fetchFolioProducts(ids: number[]): Promise<unknown[]> {
	if (ids.length <= 50) {
		const apiUrl = `https://www.foliosociety.com/usa/api/n/load?type=product&verbosity=3&ids=${ids.join(
			",",
		)}&pushDeps=false`;

		console.log(`🌐 Making API call to: ${apiUrl.substring(0, 100)}...`);
		console.log(
			`📊 Checking ID range: ${ids[0]} to ${ids[ids.length - 1]} (${
				ids.length
			} ids)`,
		);

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
			console.error("❌ Invalid API response format:", data);
			throw new Error("Invalid API response format");
		}

		return data.result as unknown[];
	}

	throw new Error("Folio load chunk exceeds 50 ids");
}

export function catalogFieldsFromProduct(product: Record<string, unknown>): {
	productId: number;
	name: string;
	productType?: string;
	authorName?: string;
	launchTimeIso?: string;
	publicationDateText?: string;
	image?: string;
	folioImagePath?: string;
	isComingSoon?: boolean;
} {
	const authorRaw = product.author_name ?? product.authorName;
	const productType = product.type_id;
	const launchRaw = product.launch_time;
	const publicationRaw = product.publication_date;
	const comingRaw = product.is_coming_soon ?? product.isComingSoon;
	const image = typeof product.image === "string" ? product.image : undefined;

	return {
		productId: product.id as number,
		name: product.name as string,
		...(typeof productType === "string" ? { productType } : {}),
		...(typeof authorRaw === "string" ? { authorName: authorRaw } : {}),
		...(typeof launchRaw === "string" ? { launchTimeIso: launchRaw } : {}),
		...(typeof publicationRaw === "string"
			? { publicationDateText: publicationRaw }
			: {}),
		...(image !== undefined ? { image, folioImagePath: image } : {}),
		...(typeof comingRaw === "boolean" ? { isComingSoon: comingRaw } : {}),
	};
}

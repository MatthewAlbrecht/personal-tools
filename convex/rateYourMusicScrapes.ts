import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { RymScrapeSpotifyAlbumMatchSummary } from "./_utils/albumMatching";
import { matchRymScrapeToSpotifyAlbums } from "./_utils/albumMatching";
import {
	deleteReleaseDescriptorLinks,
	deleteReleaseGenreLinks,
	ensureDescriptorId,
	ensureGenreId,
	taxonomyKeyFromLabel,
} from "./_utils/rateYourMusicTaxonomy";
import { requireAuth } from "./auth";

const rymNamedLinkValidator = v.object({
	name: v.string(),
	href: v.optional(v.string()),
});

const rymScrapeSpotifyAlbumMatchSummaryValidator = v.object({
	scrapeId: v.id("rateYourMusicScrapes"),
	checkedAlbums: v.number(),
	linkedAlbums: v.number(),
	skippedAlreadyLinked: v.number(),
});

const rymScrapeSpotifyAlbumBackfillSummaryValidator = v.object({
	scannedScrapes: v.number(),
	processedScrapes: v.number(),
	checkedAlbums: v.number(),
	linkedAlbums: v.number(),
	skippedAlreadyLinked: v.number(),
	summaries: v.array(rymScrapeSpotifyAlbumMatchSummaryValidator),
});

export function normalizeRateYourMusicReleaseUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new ConvexError("RYM URL is required");
	}

	const withScheme = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		throw new ConvexError("Invalid RYM URL");
	}

	const host = url.hostname.toLowerCase();
	if (host !== "rateyourmusic.com" && host !== "www.rateyourmusic.com") {
		throw new ConvexError("URL must be on rateyourmusic.com");
	}

	url.protocol = "https:";
	url.hostname = "rateyourmusic.com";
	url.hash = "";
	url.search = "";

	let path = url.pathname;
	if (path.length > 1 && path.endsWith("/")) {
		path = path.slice(0, -1);
	}
	url.pathname = path;

	return url.href;
}

function releaseKindFromPathname(
	pathname: string,
): "album" | "ep" | "mixtape" | "comp" {
	if (pathname.includes("/release/ep/")) {
		return "ep";
	}
	if (pathname.includes("/release/comp/")) {
		return "comp";
	}
	if (pathname.includes("/release/mixtape/")) {
		return "mixtape";
	}
	if (pathname.includes("/release/album/")) {
		return "album";
	}
	throw new ConvexError(
		"RYM URL must be an album, EP, mixtape, or compilation release path",
	);
}

async function syncReleaseTaxonomy(
	ctx: MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
	args: {
		primaryGenres: Array<{ name: string; href?: string | undefined }>;
		secondaryGenres: Array<{ name: string; href?: string | undefined }>;
		descriptors: string[];
	},
	now: number,
): Promise<void> {
	await deleteReleaseGenreLinks(ctx, scrapeId);
	await deleteReleaseDescriptorLinks(ctx, scrapeId);

	for (const g of args.primaryGenres) {
		const label = g.name.trim();
		if (!label) {
			continue;
		}
		const genreId = await ensureGenreId(
			ctx,
			{ name: label, href: g.href },
			now,
		);
		await ctx.db.insert("rateYourMusicReleaseGenres", {
			scrapeId,
			genreId,
			role: "primary",
		});
	}

	for (const g of args.secondaryGenres) {
		const label = g.name.trim();
		if (!label) {
			continue;
		}
		const genreId = await ensureGenreId(
			ctx,
			{ name: label, href: g.href },
			now,
		);
		await ctx.db.insert("rateYourMusicReleaseGenres", {
			scrapeId,
			genreId,
			role: "secondary",
		});
	}

	for (const raw of args.descriptors) {
		const label = raw.trim();
		if (!label) {
			continue;
		}
		const descriptorId = await ensureDescriptorId(ctx, label, now);
		await ctx.db.insert("rateYourMusicReleaseDescriptors", {
			scrapeId,
			descriptorId,
		});
	}
}

export const upsertRateYourMusicScrape = mutation({
	args: {
		rymUrl: v.string(),
		releaseTypeLabel: v.optional(v.string()),
		albumTitle: v.string(),
		artists: v.array(rymNamedLinkValidator),
		primaryGenres: v.array(rymNamedLinkValidator),
		secondaryGenres: v.array(rymNamedLinkValidator),
		descriptors: v.array(v.string()),
		spotifyAlbumId: v.optional(v.string()),
		spotifyAlbumUrl: v.optional(v.string()),
		spotifyAlbumConvexId: v.optional(v.id("spotifyAlbums")),
		tracklistingTotalSeconds: v.optional(v.number()),
		lastScrapedAt: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<Id<"rateYourMusicScrapes">> => {
		requireAuth(ctx);

		const rymUrl = normalizeRateYourMusicReleaseUrl(args.rymUrl);
		const releaseKind = releaseKindFromPathname(new URL(rymUrl).pathname);
		const now = Date.now();
		const lastScrapedAt = args.lastScrapedAt ?? now;

		const shared = {
			rymUrl,
			releaseKind,
			releaseTypeLabel: args.releaseTypeLabel?.trim() || undefined,
			albumTitle: args.albumTitle.trim(),
			artists: args.artists,
			spotifyAlbumId: args.spotifyAlbumId?.trim() || undefined,
			spotifyAlbumUrl: args.spotifyAlbumUrl?.trim() || undefined,
			...(args.tracklistingTotalSeconds !== undefined
				? { tracklistingTotalSeconds: args.tracklistingTotalSeconds }
				: {}),
			lastScrapedAt,
			updatedAt: now,
		};

		const existing = await ctx.db
			.query("rateYourMusicScrapes")
			.withIndex("by_rymUrl", (q) => q.eq("rymUrl", rymUrl))
			.first();

		let scrapeId: Id<"rateYourMusicScrapes">;

		if (existing) {
			await ctx.db.patch(existing._id, {
				...shared,
				...(args.spotifyAlbumConvexId !== undefined
					? { spotifyAlbumConvexId: args.spotifyAlbumConvexId }
					: {}),
			});
			scrapeId = existing._id;
		} else {
			scrapeId = await ctx.db.insert("rateYourMusicScrapes", {
				...shared,
				spotifyAlbumConvexId: args.spotifyAlbumConvexId,
				createdAt: now,
			});
		}

		await syncReleaseTaxonomy(ctx, scrapeId, args, now);

		await matchRymScrapeToSpotifyAlbums(ctx, {
			scrapeId,
			spotifyAlbumId: args.spotifyAlbumId?.trim() || undefined,
			albumTitle: args.albumTitle,
			artists: args.artists,
			now,
		});

		await ctx.runMutation(
			internal.forLaterAlbums.refreshFilterProjectionsForScrape,
			{
				scrapeId,
			},
		);

		return scrapeId;
	},
});

export const backfillRymScrapeSpotifyAlbumMatches = mutation({
	args: {
		limit: v.optional(v.number()),
		scanLimit: v.optional(v.number()),
		albumLimit: v.optional(v.number()),
	},
	returns: rymScrapeSpotifyAlbumBackfillSummaryValidator,
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
		const scanLimit = Math.min(Math.max(args.scanLimit ?? 1000, limit), 5000);
		const albumLimit = Math.min(Math.max(args.albumLimit ?? 1024, 1), 5000);
		const scrapes = await ctx.db
			.query("rateYourMusicScrapes")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(scanLimit);

		const summaries: RymScrapeSpotifyAlbumMatchSummary[] = [];
		let scannedScrapes = 0;
		let skippedAlreadyLinked = 0;
		for (const scrape of scrapes) {
			if (summaries.length >= limit) {
				break;
			}
			scannedScrapes += 1;

			const existingLink = await ctx.db
				.query("rateYourMusicSpotifyAlbumLinks")
				.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrape._id))
				.first();
			if (existingLink) {
				skippedAlreadyLinked += 1;
				continue;
			}

			const summary = await matchRymScrapeToSpotifyAlbums(ctx, {
				scrapeId: scrape._id,
				spotifyAlbumId: scrape.spotifyAlbumId,
				albumTitle: scrape.albumTitle,
				artists: scrape.artists,
				now: Date.now(),
				limit: albumLimit,
			});
			summaries.push(summary);
		}

		return {
			scannedScrapes,
			processedScrapes: summaries.length,
			checkedAlbums: summaries.reduce(
				(total, summary) => total + summary.checkedAlbums,
				0,
			),
			linkedAlbums: summaries.reduce(
				(total, summary) => total + summary.linkedAlbums,
				0,
			),
			skippedAlreadyLinked: summaries.reduce(
				(total, summary) => total + summary.skippedAlreadyLinked,
				skippedAlreadyLinked,
			),
			summaries,
		};
	},
});

export const listRateYourMusicScrapes = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

		return await ctx.db
			.query("rateYourMusicScrapes")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(limit);
	},
});

export const getRateYourMusicScrapeByUrl = query({
	args: { rymUrl: v.string() },
	handler: async (ctx, args) => {
		requireAuth(ctx);
		let normalized: string;
		try {
			normalized = normalizeRateYourMusicReleaseUrl(args.rymUrl);
		} catch {
			return null;
		}

		return await ctx.db
			.query("rateYourMusicScrapes")
			.withIndex("by_rymUrl", (q) => q.eq("rymUrl", normalized))
			.first();
	},
});

type GenreTag = {
	key: string;
	label: string;
	href?: string;
};

type DescriptorTag = {
	key: string;
	label: string;
};

async function loadGenreTagsForScrape(
	ctx: QueryCtx | MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
	role: "primary" | "secondary",
): Promise<GenreTag[]> {
	const links = await ctx.db
		.query("rateYourMusicReleaseGenres")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const out: GenreTag[] = [];
	for (const link of links) {
		if (link.role !== role) {
			continue;
		}
		const genre = await ctx.db.get(link.genreId);
		if (!genre) {
			continue;
		}
		out.push({
			key: genre.key,
			label: genre.label,
			...(genre.href ? { href: genre.href } : {}),
		});
	}
	return out;
}

async function loadDescriptorTagsForScrape(
	ctx: QueryCtx | MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
): Promise<DescriptorTag[]> {
	const links = await ctx.db
		.query("rateYourMusicReleaseDescriptors")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", scrapeId))
		.collect();

	const out: DescriptorTag[] = [];
	for (const link of links) {
		const descriptor = await ctx.db.get(link.descriptorId);
		if (!descriptor) {
			continue;
		}
		out.push({
			key: descriptor.key,
			label: descriptor.label,
		});
	}
	return out;
}

export const getRateYourMusicScrapeDetails = query({
	args: { scrapeId: v.id("rateYourMusicScrapes") },
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const scrape = await ctx.db.get(args.scrapeId);
		if (!scrape) {
			return null;
		}

		const [primaryGenres, secondaryGenres, descriptors] = await Promise.all([
			loadGenreTagsForScrape(ctx, args.scrapeId, "primary"),
			loadGenreTagsForScrape(ctx, args.scrapeId, "secondary"),
			loadDescriptorTagsForScrape(ctx, args.scrapeId),
		]);

		return {
			scrape,
			primaryGenres,
			secondaryGenres,
			descriptors,
		};
	},
});

export const listRateYourMusicScrapeIdsByGenreKey = query({
	args: { genreKey: v.string() },
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const key = taxonomyKeyFromLabel(args.genreKey);
		if (!key) {
			return [];
		}

		const genre = await ctx.db
			.query("rateYourMusicGenres")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();

		if (!genre) {
			return [];
		}

		const links = await ctx.db
			.query("rateYourMusicReleaseGenres")
			.withIndex("by_genreId", (q) => q.eq("genreId", genre._id))
			.collect();

		const scrapeIds = [...new Set(links.map((l) => l.scrapeId))];
		return scrapeIds;
	},
});

export const listRateYourMusicScrapeIdsByDescriptorKey = query({
	args: { descriptorKey: v.string() },
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const key = taxonomyKeyFromLabel(args.descriptorKey);
		if (!key) {
			return [];
		}

		const descriptor = await ctx.db
			.query("rateYourMusicDescriptors")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();

		if (!descriptor) {
			return [];
		}

		const links = await ctx.db
			.query("rateYourMusicReleaseDescriptors")
			.withIndex("by_descriptorId", (q) => q.eq("descriptorId", descriptor._id))
			.collect();

		const scrapeIds = [...new Set(links.map((l) => l.scrapeId))];
		return scrapeIds;
	},
});

export const listRateYourMusicGenreKeys = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = Math.min(Math.max(args.limit ?? 3000, 1), 3000);

		const rows = await ctx.db
			.query("rateYourMusicGenres")
			.withIndex("by_label")
			.take(limit);

		return rows.map((r) => ({
			key: r.key,
			label: r.label,
			isTopLevel: r.isTopLevel === true,
		}));
	},
});

export const listRateYourMusicDescriptorKeys = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);

		const rows = await ctx.db
			.query("rateYourMusicDescriptors")
			.withIndex("by_createdAt")
			.order("desc")
			.take(limit);

		return rows.map((r) => ({
			key: r.key,
			label: r.label,
		}));
	},
});

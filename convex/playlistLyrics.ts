import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	isPublicPlaylistStatus,
	sortPlaylistItems,
} from "./_utils/playlistLyrics";
import { requireAuth } from "./auth";

const playlistStatusValidator = v.union(v.literal("draft"), v.literal("ready"));
const scrapeStatusValidator = v.union(v.literal("ready"), v.literal("failed"));
const itemScrapeStateValidator = v.union(
	v.literal("scraping"),
	v.literal("ready"),
	v.literal("failed"),
	v.literal("reused"),
);

const playlistValidator = v.object({
	_id: v.id("playlistLyrics"),
	_creationTime: v.number(),
	title: v.string(),
	slug: v.string(),
	theme: v.optional(v.string()),
	description: v.optional(v.string()),
	notes: v.optional(v.string()),
	status: playlistStatusValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
});

const publicPlaylistValidator = v.object({
	title: v.string(),
	slug: v.string(),
	theme: v.optional(v.string()),
	description: v.optional(v.string()),
});

const scrapeValidator = v.object({
	_id: v.id("geniusLyricScrapes"),
	_creationTime: v.number(),
	canonicalUrl: v.string(),
	songTitle: v.string(),
	artistName: v.string(),
	albumTitle: v.optional(v.string()),
	albumYear: v.optional(v.string()),
	albumArtUrl: v.optional(v.string()),
	lyrics: v.string(),
	about: v.optional(v.string()),
	scrapeStatus: scrapeStatusValidator,
	lastScrapedAt: v.number(),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const publicScrapeValidator = v.object({
	songTitle: v.string(),
	artistName: v.string(),
	albumTitle: v.optional(v.string()),
	albumYear: v.optional(v.string()),
	albumArtUrl: v.optional(v.string()),
	lyrics: v.string(),
	about: v.optional(v.string()),
});

const itemWithScrapeValidator = v.object({
	_id: v.id("playlistLyricsItems"),
	_creationTime: v.number(),
	playlistId: v.id("playlistLyrics"),
	lyricScrapeId: v.optional(v.id("geniusLyricScrapes")),
	position: v.number(),
	userNote: v.optional(v.string()),
	songTitleOverride: v.optional(v.string()),
	artistNameOverride: v.optional(v.string()),
	albumTitleOverride: v.optional(v.string()),
	albumArtUrlOverride: v.optional(v.string()),
	pendingUrl: v.optional(v.string()),
	scrapeState: itemScrapeStateValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
	scrape: v.optional(scrapeValidator),
});

const publicItemWithScrapeValidator = v.object({
	_id: v.id("playlistLyricsItems"),
	position: v.number(),
	userNote: v.optional(v.string()),
	songTitleOverride: v.optional(v.string()),
	artistNameOverride: v.optional(v.string()),
	albumTitleOverride: v.optional(v.string()),
	albumArtUrlOverride: v.optional(v.string()),
	scrape: v.optional(publicScrapeValidator),
});

const syncScrapeInputValidator = v.object({
	canonicalUrl: v.string(),
	songTitle: v.string(),
	artistName: v.string(),
	albumTitle: v.optional(v.string()),
	albumYear: v.optional(v.string()),
	albumArtUrl: v.optional(v.string()),
	lyrics: v.string(),
	about: v.optional(v.string()),
	lastScrapedAt: v.optional(v.number()),
	createdAt: v.optional(v.number()),
	updatedAt: v.optional(v.number()),
});

type ItemWithScrape = Doc<"playlistLyricsItems"> & {
	scrape?: Doc<"geniusLyricScrapes">;
};

type PlaylistPatch = {
	title?: string;
	theme?: string;
	description?: string;
	notes?: string;
	status?: "draft" | "ready";
	updatedAt: number;
};

type ScrapeUpsertInput = {
	canonicalUrl: string;
	songTitle: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	lyrics: string;
	about?: string;
	lastScrapedAt?: number;
	createdAt?: number;
	updatedAt?: number;
};

export const list = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(playlistValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		return await ctx.db
			.query("playlistLyrics")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(args.limit ?? 100);
	},
});

export const listPublic = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(publicPlaylistValidator),
	handler: async (ctx, args) => {
		const playlists = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_status", (q) => q.eq("status", "ready"))
			.collect();

		return playlists
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, args.limit ?? 100)
			.map(toPublicPlaylist);
	},
});

export const getBySlug = query({
	args: {
		slug: v.string(),
	},
	returns: v.union(
		v.object({
			playlist: playlistValidator,
			songs: v.array(itemWithScrapeValidator),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const playlist = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!playlist) return null;

		const items = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId_position", (q) =>
				q.eq("playlistId", playlist._id),
			)
			.collect();
		const songs = await attachScrapes(ctx, sortPlaylistItems(items));

		return { playlist, songs };
	},
});

export const getPublicBySlug = query({
	args: {
		slug: v.string(),
	},
	returns: v.union(
		v.object({
			playlist: publicPlaylistValidator,
			songs: v.array(publicItemWithScrapeValidator),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const playlist = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!playlist || !isPublicPlaylistStatus(playlist.status)) return null;

		const items = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId_position", (q) =>
				q.eq("playlistId", playlist._id),
			)
			.collect();
		const songs = await attachScrapes(ctx, sortPlaylistItems(items));

		return {
			playlist: toPublicPlaylist(playlist),
			songs: songs.map(toPublicItemWithScrape),
		};
	},
});

export const getScrapeByCanonicalUrl = query({
	args: {
		canonicalUrl: v.string(),
	},
	returns: v.union(scrapeValidator, v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		return await ctx.db
			.query("geniusLyricScrapes")
			.withIndex("by_canonicalUrl", (q) =>
				q.eq("canonicalUrl", args.canonicalUrl),
			)
			.first();
	},
});

export const getItemForRescrape = query({
	args: {
		itemId: v.id("playlistLyricsItems"),
	},
	returns: v.union(itemWithScrapeValidator, v.null()),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) return null;

		const scrape = item.lyricScrapeId
			? await ctx.db.get(item.lyricScrapeId)
			: undefined;

		return { ...item, scrape: scrape ?? undefined };
	},
});

export const createDraft = mutation({
	args: {},
	returns: v.object({ slug: v.string() }),
	handler: async (ctx) => {
		requireAuth(ctx);

		const now = Date.now();
		const slug = `untitled-playlist-${now}`;

		await ctx.db.insert("playlistLyrics", {
			title: "Untitled Playlist",
			slug,
			status: "draft",
			createdAt: now,
			updatedAt: now,
		});

		return { slug };
	},
});

export const updatePlaylist = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		title: v.optional(v.string()),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		status: v.optional(playlistStatusValidator),
	},
	returns: v.object({ slug: v.string() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const playlist = await ctx.db.get(args.playlistId);
		if (!playlist) {
			throw new Error("Playlist not found");
		}

		const now = Date.now();
		const updates: PlaylistPatch = { updatedAt: now };

		if (args.title !== undefined) {
			const title = args.title.trim();
			if (!title) {
				throw new Error("Playlist title is required");
			}

			updates.title = title;
		}

		if (args.theme !== undefined) {
			updates.theme = normalizeOptionalString(args.theme);
		}
		if (args.description !== undefined) {
			updates.description = normalizeOptionalString(args.description);
		}
		if (args.notes !== undefined) {
			updates.notes = normalizeOptionalString(args.notes);
		}
		if (args.status !== undefined) {
			updates.status = args.status;
		}

		await ctx.db.patch(args.playlistId, updates);

		return { slug: playlist.slug };
	},
});

export const createFailedItem = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		pendingUrl: v.string(),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const now = Date.now();
		const position = await getNextPosition(ctx, args.playlistId);

		return await ctx.db.insert("playlistLyricsItems", {
			playlistId: args.playlistId,
			position,
			pendingUrl: args.pendingUrl,
			scrapeState: "failed",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const upsertScrape = mutation({
	args: {
		canonicalUrl: v.string(),
		songTitle: v.string(),
		artistName: v.string(),
		albumTitle: v.optional(v.string()),
		albumYear: v.optional(v.string()),
		albumArtUrl: v.optional(v.string()),
		lyrics: v.string(),
		about: v.optional(v.string()),
	},
	returns: v.id("geniusLyricScrapes"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		return await upsertScrapeRow(ctx, args);
	},
});

export const addScrapeToPlaylist = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		lyricScrapeId: v.id("geniusLyricScrapes"),
		reused: v.optional(v.boolean()),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const scrape = await ctx.db.get(args.lyricScrapeId);
		if (!scrape) {
			throw new Error("Lyric scrape not found");
		}

		const existingItemsForScrape = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_lyricScrapeId", (q) =>
				q.eq("lyricScrapeId", args.lyricScrapeId),
			)
			.collect();
		const duplicate = existingItemsForScrape.some(
			(item) => item.playlistId === args.playlistId,
		);

		if (duplicate) {
			throw new Error("Song is already in this playlist");
		}

		const now = Date.now();
		const position = await getNextPosition(ctx, args.playlistId);

		return await ctx.db.insert("playlistLyricsItems", {
			playlistId: args.playlistId,
			lyricScrapeId: args.lyricScrapeId,
			position,
			scrapeState: args.reused ? "reused" : "ready",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateItem = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		userNote: v.optional(v.string()),
		songTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		albumTitleOverride: v.optional(v.string()),
		albumArtUrlOverride: v.optional(v.string()),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		const updates: {
			userNote?: string;
			songTitleOverride?: string;
			artistNameOverride?: string;
			albumTitleOverride?: string;
			albumArtUrlOverride?: string;
			updatedAt: number;
		} = {
			updatedAt: Date.now(),
		};

		if (args.userNote !== undefined) {
			updates.userNote = normalizeOptionalString(args.userNote);
		}
		if (args.songTitleOverride !== undefined) {
			updates.songTitleOverride = normalizeOptionalString(
				args.songTitleOverride,
			);
		}
		if (args.artistNameOverride !== undefined) {
			updates.artistNameOverride = normalizeOptionalString(
				args.artistNameOverride,
			);
		}
		if (args.albumTitleOverride !== undefined) {
			updates.albumTitleOverride = normalizeOptionalString(
				args.albumTitleOverride,
			);
		}
		if (args.albumArtUrlOverride !== undefined) {
			updates.albumArtUrlOverride = normalizeOptionalString(
				args.albumArtUrlOverride,
			);
		}

		await ctx.db.patch(args.itemId, updates);

		return args.itemId;
	},
});

export const markItemScrapeReady = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		lyricScrapeId: v.id("geniusLyricScrapes"),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		const scrape = await ctx.db.get(args.lyricScrapeId);
		if (!scrape) {
			throw new Error("Lyric scrape not found");
		}

		await ctx.db.patch(args.itemId, {
			lyricScrapeId: args.lyricScrapeId,
			pendingUrl: undefined,
			scrapeState: "ready",
			updatedAt: Date.now(),
		});

		return args.itemId;
	},
});

export const markItemScrapeFailed = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
		pendingUrl: v.string(),
	},
	returns: v.id("playlistLyricsItems"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		await ctx.db.patch(args.itemId, {
			pendingUrl: args.pendingUrl,
			scrapeState: "failed",
			updatedAt: Date.now(),
		});

		return args.itemId;
	},
});

export const deleteItem = mutation({
	args: {
		itemId: v.id("playlistLyricsItems"),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const item = await ctx.db.get(args.itemId);
		if (!item) {
			throw new Error("Playlist item not found");
		}

		await ctx.db.delete(args.itemId);

		return { success: true };
	},
});

export const reorderItems = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		itemIds: v.array(v.id("playlistLyricsItems")),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const uniqueItemIds = new Set(args.itemIds);
		if (uniqueItemIds.size !== args.itemIds.length) {
			throw new Error("Cannot reorder duplicate items");
		}

		const existingItems = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId", (q) => q.eq("playlistId", args.playlistId))
			.collect();
		if (uniqueItemIds.size !== existingItems.length) {
			throw new Error("Reorder must include every playlist item");
		}

		for (const item of existingItems) {
			if (!uniqueItemIds.has(item._id)) {
				throw new Error("Reorder must include every playlist item");
			}
		}

		for (let index = 0; index < args.itemIds.length; index++) {
			const itemId = args.itemIds[index];
			if (!itemId) continue;

			const item = await ctx.db.get(itemId);
			if (!item || item.playlistId !== args.playlistId) {
				throw new Error("All items must belong to the playlist");
			}

			await ctx.db.patch(itemId, {
				position: index + 1,
				updatedAt: Date.now(),
			});
		}

		return { success: true };
	},
});

export const listForSync = query({
	args: {},
	returns: v.array(
		v.object({
			playlist: playlistValidator,
			songs: v.array(itemWithScrapeValidator),
		}),
	),
	handler: async (ctx) => {
		requireAuth(ctx);

		const playlists = await ctx.db.query("playlistLyrics").collect();
		const result: Array<{
			playlist: Doc<"playlistLyrics">;
			songs: ItemWithScrape[];
		}> = [];

		for (const playlist of playlists) {
			const items = await ctx.db
				.query("playlistLyricsItems")
				.withIndex("by_playlistId_position", (q) =>
					q.eq("playlistId", playlist._id),
				)
				.collect();
			const songs = await attachScrapes(ctx, sortPlaylistItems(items));

			result.push({ playlist, songs });
		}

		return result.sort((a, b) => b.playlist.updatedAt - a.playlist.updatedAt);
	},
});

export const upsertPlaylistForSync = mutation({
	args: {
		title: v.string(),
		slug: v.string(),
		theme: v.optional(v.string()),
		description: v.optional(v.string()),
		notes: v.optional(v.string()),
		status: playlistStatusValidator,
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
	},
	returns: v.id("playlistLyrics"),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const now = Date.now();
		const existing = await ctx.db
			.query("playlistLyrics")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		const playlist = {
			title: args.title,
			slug: args.slug,
			theme: normalizeOptionalString(args.theme),
			description: normalizeOptionalString(args.description),
			notes: normalizeOptionalString(args.notes),
			status: args.status,
			updatedAt: args.updatedAt ?? now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, playlist);
			return existing._id;
		}

		return await ctx.db.insert("playlistLyrics", {
			...playlist,
			createdAt: args.createdAt ?? now,
		});
	},
});

export const replaceItemsForSync = mutation({
	args: {
		playlistId: v.id("playlistLyrics"),
		items: v.array(
			v.object({
				position: v.number(),
				userNote: v.optional(v.string()),
				songTitleOverride: v.optional(v.string()),
				artistNameOverride: v.optional(v.string()),
				albumTitleOverride: v.optional(v.string()),
				albumArtUrlOverride: v.optional(v.string()),
				pendingUrl: v.optional(v.string()),
				scrapeState: itemScrapeStateValidator,
				createdAt: v.optional(v.number()),
				updatedAt: v.optional(v.number()),
				scrape: v.optional(syncScrapeInputValidator),
			}),
		),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		await requirePlaylist(ctx, args.playlistId);

		const existingItems = await ctx.db
			.query("playlistLyricsItems")
			.withIndex("by_playlistId", (q) => q.eq("playlistId", args.playlistId))
			.collect();

		for (const item of existingItems) {
			await ctx.db.delete(item._id);
		}

		for (const item of sortPlaylistItems(args.items)) {
			const now = Date.now();
			const lyricScrapeId = item.scrape
				? await upsertScrapeRow(ctx, item.scrape)
				: undefined;

			await ctx.db.insert("playlistLyricsItems", {
				playlistId: args.playlistId,
				lyricScrapeId,
				position: item.position,
				userNote: normalizeOptionalString(item.userNote),
				songTitleOverride: normalizeOptionalString(item.songTitleOverride),
				artistNameOverride: normalizeOptionalString(item.artistNameOverride),
				albumTitleOverride: normalizeOptionalString(item.albumTitleOverride),
				albumArtUrlOverride: normalizeOptionalString(item.albumArtUrlOverride),
				pendingUrl: normalizeOptionalString(item.pendingUrl),
				scrapeState: item.scrapeState,
				createdAt: item.createdAt ?? now,
				updatedAt: item.updatedAt ?? now,
			});
		}

		return { success: true };
	},
});

async function attachScrapes(
	ctx: QueryCtx | MutationCtx,
	items: Doc<"playlistLyricsItems">[],
): Promise<ItemWithScrape[]> {
	const songs: ItemWithScrape[] = [];

	for (const item of items) {
		const scrape = item.lyricScrapeId
			? await ctx.db.get(item.lyricScrapeId)
			: undefined;

		songs.push({ ...item, scrape: scrape ?? undefined });
	}

	return songs;
}

function toPublicPlaylist(playlist: Doc<"playlistLyrics">) {
	return {
		title: playlist.title,
		slug: playlist.slug,
		theme: playlist.theme,
		description: playlist.description,
	};
}

function toPublicItemWithScrape(item: ItemWithScrape) {
	return {
		_id: item._id,
		position: item.position,
		userNote: item.userNote,
		songTitleOverride: item.songTitleOverride,
		artistNameOverride: item.artistNameOverride,
		albumTitleOverride: item.albumTitleOverride,
		albumArtUrlOverride: item.albumArtUrlOverride,
		scrape: item.scrape
			? {
					songTitle: item.scrape.songTitle,
					artistName: item.scrape.artistName,
					albumTitle: item.scrape.albumTitle,
					albumYear: item.scrape.albumYear,
					albumArtUrl: item.scrape.albumArtUrl,
					lyrics: item.scrape.lyrics,
					about: item.scrape.about,
				}
			: undefined,
	};
}

async function requirePlaylist(
	ctx: MutationCtx,
	playlistId: Id<"playlistLyrics">,
): Promise<Doc<"playlistLyrics">> {
	const playlist = await ctx.db.get(playlistId);
	if (!playlist) {
		throw new Error("Playlist not found");
	}

	return playlist;
}

async function getNextPosition(
	ctx: MutationCtx,
	playlistId: Id<"playlistLyrics">,
): Promise<number> {
	const lastItem = await ctx.db
		.query("playlistLyricsItems")
		.withIndex("by_playlistId_position", (q) => q.eq("playlistId", playlistId))
		.order("desc")
		.first();

	return (lastItem?.position ?? 0) + 1;
}

async function upsertScrapeRow(
	ctx: MutationCtx,
	input: ScrapeUpsertInput,
): Promise<Id<"geniusLyricScrapes">> {
	const now = Date.now();
	const existing = await ctx.db
		.query("geniusLyricScrapes")
		.withIndex("by_canonicalUrl", (q) =>
			q.eq("canonicalUrl", input.canonicalUrl),
		)
		.first();

	const scrape = {
		canonicalUrl: input.canonicalUrl,
		songTitle: input.songTitle,
		artistName: input.artistName,
		albumTitle: normalizeOptionalString(input.albumTitle),
		albumYear: normalizeOptionalString(input.albumYear),
		albumArtUrl: normalizeOptionalString(input.albumArtUrl),
		lyrics: input.lyrics,
		about: normalizeOptionalString(input.about),
		scrapeStatus: "ready" as const,
		lastScrapedAt: input.lastScrapedAt ?? now,
		updatedAt: input.updatedAt ?? now,
	};

	if (existing) {
		await ctx.db.patch(existing._id, scrape);
		return existing._id;
	}

	return await ctx.db.insert("geniusLyricScrapes", {
		...scrape,
		createdAt: input.createdAt ?? now,
	});
}

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

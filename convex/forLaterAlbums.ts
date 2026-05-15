import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	type RymMatchResult,
	buildArtistKeys,
	matchRymForForLaterAlbum,
	normalizeAlbumTitle,
} from "./_utils/albumMatching";

const syncSourceValidator = v.union(v.literal("manual"), v.literal("cron"));
const syncStatusValidator = v.union(v.literal("success"), v.literal("failed"));
const matchMethodValidator = v.union(
	v.literal("spotify_id"),
	v.literal("title_artist"),
	v.literal("manual"),
);

function spotifyAlbumArtistKeys(doc: Doc<"spotifyAlbums">): string[] {
	if (doc.rawData) {
		try {
			const parsed = JSON.parse(doc.rawData) as {
				artists?: Array<{ name?: string }>;
			};
			const names =
				parsed.artists
					?.map((a) => a.name)
					.filter((n): n is string => Boolean(n)) ?? [];
			if (names.length > 0) {
				return buildArtistKeys(names);
			}
		} catch {
			// fall through to artistName
		}
	}

	const segments = doc.artistName
		.split(", ")
		.map((s) => s.trim())
		.filter(Boolean);
	if (segments.length > 0) {
		return buildArtistKeys(segments);
	}

	return buildArtistKeys([doc.artistName]);
}

export const upsertForLaterAlbumItem = mutation({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		spotifyAlbumId: v.string(),
		albumTitleKey: v.string(),
		artistKeys: v.array(v.string()),
		sourceTrackIds: v.array(v.string()),
		playlistAddedAt: v.optional(v.number()),
		seenAt: v.number(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		itemId: Id<"forLaterAlbumItems">;
		isNew: boolean;
		rymMatch: RymMatchResult;
		rymMatchCreated: boolean;
	}> => {
		const sourceTrackIds = [...new Set(args.sourceTrackIds)].sort();
		const canonicalAlbum = await ctx.db.get(args.albumId);
		const albumTitleKey =
			canonicalAlbum !== null
				? normalizeAlbumTitle(canonicalAlbum.name)
				: args.albumTitleKey;
		const artistKeys =
			canonicalAlbum !== null
				? spotifyAlbumArtistKeys(canonicalAlbum)
				: args.artistKeys;

		const existing = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_spotifyAlbumId", (q) =>
				q.eq("userId", args.userId).eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.first();

		let itemId: Id<"forLaterAlbumItems">;
		let isNew: boolean;

		if (existing) {
			await ctx.db.patch(existing._id, {
				albumId: args.albumId,
				albumTitleKey,
				artistKeys,
				sourceTrackIds,
				playlistAddedAt: args.playlistAddedAt ?? existing.playlistAddedAt,
				lastSeenAt: args.seenAt,
				removedAt: undefined,
				isActive: true,
				updatedAt: args.seenAt,
			});

			itemId = existing._id;
			isNew = false;
		} else {
			itemId = await ctx.db.insert("forLaterAlbumItems", {
				userId: args.userId,
				albumId: args.albumId,
				spotifyAlbumId: args.spotifyAlbumId,
				albumTitleKey,
				artistKeys,
				sourceTrackIds,
				playlistAddedAt: args.playlistAddedAt,
				firstSeenAt: args.seenAt,
				lastSeenAt: args.seenAt,
				isActive: true,
				rymDiscoveryStatus: "not_started",
				createdAt: args.seenAt,
				updatedAt: args.seenAt,
			});

			isNew = true;
		}

		const rymMatch = await matchRymForForLaterAlbum(ctx, {
			userId: args.userId,
			forLaterAlbumItemId: itemId,
			spotifyAlbumId: args.spotifyAlbumId,
			albumTitleKey,
			artistKeys,
			now: args.seenAt,
		});

		return {
			itemId,
			isNew,
			rymMatch,
			rymMatchCreated: rymMatch.scrapeId !== undefined,
		};
	},
});

export const markForLaterAlbumsRemoved = mutation({
	args: {
		userId: v.string(),
		activeSpotifyAlbumIds: v.array(v.string()),
		removedAt: v.number(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ removedCount: number; removedSpotifyAlbumIds: string[] }> => {
		const activeItems = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
		const activeSpotifyAlbumIds = new Set(args.activeSpotifyAlbumIds);
		const removedSpotifyAlbumIds: string[] = [];

		for (const item of activeItems) {
			if (activeSpotifyAlbumIds.has(item.spotifyAlbumId)) {
				continue;
			}

			await ctx.db.patch(item._id, {
				isActive: false,
				removedAt: args.removedAt,
				updatedAt: args.removedAt,
			});
			removedSpotifyAlbumIds.push(item.spotifyAlbumId);
		}

		return {
			removedCount: removedSpotifyAlbumIds.length,
			removedSpotifyAlbumIds,
		};
	},
});

export const saveForLaterSyncRun = mutation({
	args: {
		userId: v.string(),
		spotifyPlaylistId: v.string(),
		source: syncSourceValidator,
		status: syncStatusValidator,
		startedAt: v.number(),
		completedAt: v.number(),
		durationMs: v.number(),
		spotifySnapshotId: v.optional(v.string()),
		tracksFromPlaylist: v.number(),
		uniqueAlbumsFromPlaylist: v.number(),
		newAlbumsAdded: v.number(),
		existingAlbumsSeen: v.number(),
		albumsMarkedRemoved: v.number(),
		rymMatchesCreated: v.number(),
		rymDiscoveryQueued: v.number(),
		error: v.optional(v.string()),
		playlistNewestAddedAtMs: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<Id<"forLaterSyncRuns">> => {
		return await ctx.db.insert("forLaterSyncRuns", args);
	},
});

export const getForLaterLastSync = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();
	},
});

/** Most recent successful run (skips newer failures). Used for incremental Spotify added_at watermark. */
export const getForLaterLastSuccessfulSync = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("forLaterSyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(100);

		for (const row of rows) {
			if (row.status === "success") {
				return row;
			}
		}

		return null;
	},
});

export const getForLaterAlbumItems = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;
		const items = await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_lastSeenAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();

		return items.slice(0, limit);
	},
});

export const getForLaterItemBySpotifyAlbumId = query({
	args: {
		userId: v.string(),
		spotifyAlbumId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("forLaterAlbumItems")
			.withIndex("by_userId_spotifyAlbumId", (q) =>
				q.eq("userId", args.userId).eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.first();
	},
});

export const patchForLaterRymMatch = mutation({
	args: {
		itemId: v.id("forLaterAlbumItems"),
		rymScrapeId: v.id("rateYourMusicScrapes"),
		rymMatchMethod: matchMethodValidator,
		rymMatchedAt: v.number(),
	},
	handler: async (ctx, args): Promise<void> => {
		await ctx.db.patch(args.itemId, {
			rymScrapeId: args.rymScrapeId,
			rymMatchMethod: args.rymMatchMethod,
			rymMatchedAt: args.rymMatchedAt,
			updatedAt: args.rymMatchedAt,
		});
	},
});

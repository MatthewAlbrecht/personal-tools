import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuth } from "./auth";

const HOME_LIMIT_MAX = 20;

const homeAlbumRowValidator = v.object({
	albumId: v.id("spotifyAlbums"),
	name: v.string(),
	artistName: v.string(),
	imageUrl: v.optional(v.string()),
	listenedAt: v.optional(v.number()),
	forLaterLastSeenAt: v.optional(v.number()),
});

function clampLimit(limit: number | undefined, fallback: number): number {
	const value = limit ?? fallback;
	if (value < 1) return 1;
	if (value > HOME_LIMIT_MAX) return HOME_LIMIT_MAX;
	return value;
}

export const listRecentListens = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(homeAlbumRowValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = clampLimit(args.limit, 8);

		const listens = await ctx.db
			.query("userAlbumListens")
			.withIndex("by_userId_listenedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(limit);

		const rows = [];
		for (const listen of listens) {
			const album = await ctx.db.get(listen.albumId);
			if (!album) continue;
			rows.push({
				albumId: listen.albumId,
				name: album.name,
				artistName: album.artistName,
				imageUrl: album.imageUrl,
				listenedAt: listen.listenedAt,
			});
		}
		return rows;
	},
});

export const listNeedsRating = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(homeAlbumRowValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = clampLimit(args.limit, 8);

		// Heuristic: scan a bounded recent-listen window and keep unrated albums.
		const listens = await ctx.db
			.query("userAlbumListens")
			.withIndex("by_userId_listenedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(40);

		const seen = new Set<string>();
		const rows = [];
		for (const listen of listens) {
			const albumKey = String(listen.albumId);
			if (seen.has(albumKey)) continue;
			seen.add(albumKey);

			const userAlbum = await ctx.db
				.query("userAlbums")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", listen.albumId),
				)
				.first();
			if (userAlbum?.rating !== undefined) continue;

			const album = await ctx.db.get(listen.albumId);
			if (!album) continue;
			rows.push({
				albumId: listen.albumId,
				name: album.name,
				artistName: album.artistName,
				imageUrl: album.imageUrl,
				listenedAt: listen.listenedAt,
			});
			if (rows.length >= limit) break;
		}
		return rows;
	},
});

export const listRecentlySavedForLater = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(homeAlbumRowValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = clampLimit(args.limit, 8);

		const items = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_isActiveForLater_forLaterLastSeenAt", (q) =>
				q.eq("userId", args.userId).eq("isActiveForLater", true),
			)
			.order("desc")
			.take(limit);

		return items.map((item) => ({
			albumId: item.albumId,
			name: item.name,
			artistName: item.artistName,
			imageUrl: item.imageUrl,
			forLaterLastSeenAt: item.forLaterLastSeenAt,
		}));
	},
});

// Phase 3: replace with playNextSnapshots read
export const listPlayNextPlaceholder = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(homeAlbumRowValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = clampLimit(args.limit, 12);

		const items = await ctx.db
			.query("albumLibraryItems")
			.withIndex("by_userId_isActiveForLater_forLaterLastSeenAt", (q) =>
				q.eq("userId", args.userId).eq("isActiveForLater", true),
			)
			.order("desc")
			.take(limit);

		return items.map((item) => ({
			albumId: item.albumId,
			name: item.name,
			artistName: item.artistName,
			imageUrl: item.imageUrl,
			forLaterLastSeenAt: item.forLaterLastSeenAt,
		}));
	},
});

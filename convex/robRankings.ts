import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get or create a year entry for Rob's rankings
export const getOrCreateYear = mutation({
	args: {
		userId: v.string(),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("robRankingYears")
			.withIndex("by_userId_year", (q) =>
				q.eq("userId", args.userId).eq("year", args.year),
			)
			.first();

		if (existing) {
			return existing._id;
		}

		const now = Date.now();
		return await ctx.db.insert("robRankingYears", {
			userId: args.userId,
			year: args.year,
			published: false,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const listYearSummariesForUser = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const years = await ctx.db
			.query("robRankingYears")
			.filter((q) => q.eq(q.field("userId"), args.userId))
			.collect();

		const summaries = await Promise.all(
			years.map(async (yearRow) => {
				const entries = await ctx.db
					.query("robRankingAlbums")
					.withIndex("by_yearId", (q) => q.eq("yearId", yearRow._id))
					.collect();
				return {
					yearId: yearRow._id,
					year: yearRow.year,
					published: yearRow.published ?? false,
					publishedAt: yearRow.publishedAt,
					entryCount: entries.length,
				};
			}),
		);

		return summaries.sort((a, b) => b.year - a.year);
	},
});

// Get all years that have rankings
export const getYearsForUser = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const years = await ctx.db
			.query("robRankingYears")
			.filter((q) => q.eq(q.field("userId"), args.userId))
			.collect();

		return years.map((y) => y.year).sort((a, b) => b - a);
	},
});

export const listPublishedYears = query({
	args: {},
	handler: async (ctx) => {
		const years = await ctx.db
			.query("robRankingYears")
			.withIndex("by_published", (q) => q.eq("published", true))
			.collect();

		return years
			.map((y) => ({ year: y.year, publishedAt: y.publishedAt }))
			.sort((a, b) => b.year - a.year);
	},
});

export const getPublishedAlbumsForYear = query({
	args: {
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const yearRow = await ctx.db
			.query("robRankingYears")
			.filter((q) =>
				q.and(
					q.eq(q.field("year"), args.year),
					q.eq(q.field("published"), true),
				),
			)
			.first();

		if (!yearRow) return [];

		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", yearRow._id))
			.collect();

		const albumsWithData = await Promise.all(
			rankings.map(async (ranking) => {
				const album = await ctx.db.get(ranking.albumId);
				return {
					position: ranking.position,
					album: album
						? {
								name: album.name,
								artistName: album.artistName,
								imageUrl: album.imageUrl,
								releaseDate: album.releaseDate,
							}
						: null,
				};
			}),
		);

		return albumsWithData.sort((a, b) => a.position - b.position);
	},
});

// Get albums for a specific year with joined album data
export const getAlbumsForYear = query({
	args: {
		yearId: v.id("robRankingYears"),
	},
	handler: async (ctx, args) => {
		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		const albumsWithData = await Promise.all(
			rankings.map(async (ranking) => {
				const album = await ctx.db.get(ranking.albumId);
				return {
					_id: ranking._id,
					albumId: ranking.albumId,
					position: ranking.position,
					album: album
						? {
								name: album.name,
								artistName: album.artistName,
								imageUrl: album.imageUrl,
								releaseDate: album.releaseDate,
							}
						: null,
				};
			}),
		);

		return albumsWithData.sort((a, b) => a.position - b.position);
	},
});

// Get all available albums (from spotifyAlbums) that aren't already in the year
export const getAvailableAlbums = query({
	args: {
		yearId: v.id("robRankingYears"),
	},
	handler: async (ctx, args) => {
		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		const usedAlbumIds = new Set(rankings.map((r) => r.albumId.toString()));

		const allAlbums = await ctx.db.query("spotifyAlbums").collect();

		return allAlbums
			.filter((a) => !usedAlbumIds.has(a._id.toString()))
			.map((a) => ({
				_id: a._id,
				spotifyAlbumId: a.spotifyAlbumId,
				name: a.name,
				artistName: a.artistName,
				imageUrl: a.imageUrl,
				releaseDate: a.releaseDate,
				totalTracks: a.totalTracks,
			}));
	},
});

export const setYearPublished = mutation({
	args: {
		yearId: v.id("robRankingYears"),
		published: v.boolean(),
	},
	handler: async (ctx, args) => {
		const yearRow = await ctx.db.get(args.yearId);
		if (!yearRow) throw new Error("Year not found");

		if (args.published) {
			const entries = await ctx.db
				.query("robRankingAlbums")
				.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
				.collect();
			if (entries.length === 0) {
				throw new Error("Cannot publish an empty list");
			}
		}

		const now = Date.now();
		await ctx.db.patch(args.yearId, {
			published: args.published,
			publishedAt: args.published ? now : yearRow.publishedAt,
			updatedAt: now,
		});
	},
});

export const replaceYearFromAlbums = mutation({
	args: {
		userId: v.string(),
		yearId: v.id("robRankingYears"),
		albumIds: v.array(v.id("spotifyAlbums")),
	},
	handler: async (ctx, args) => {
		const yearRow = await ctx.db.get(args.yearId);
		if (!yearRow) throw new Error("Year not found");
		if (yearRow.userId !== args.userId) {
			throw new Error("Not authorized for this year");
		}
		if (args.albumIds.length > 50) {
			throw new Error("Cannot import more than 50 albums");
		}

		const existing = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		for (const row of existing) {
			await ctx.db.delete(row._id);
		}

		const now = Date.now();
		for (let i = 0; i < args.albumIds.length; i++) {
			const albumId = args.albumIds[i];
			if (!albumId) continue;
			await ctx.db.insert("robRankingAlbums", {
				userId: args.userId,
				yearId: args.yearId,
				albumId,
				position: i + 1,
				status: "none",
				createdAt: now,
				updatedAt: now,
			});
		}

		await ctx.db.patch(args.yearId, { updatedAt: now });
		return { imported: args.albumIds.length };
	},
});

// Add an album to a year's rankings
export const addAlbumToYear = mutation({
	args: {
		userId: v.string(),
		yearId: v.id("robRankingYears"),
		albumId: v.id("spotifyAlbums"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		if (existing.length >= 50) {
			throw new Error("Cannot add more than 50 albums");
		}

		const alreadyAdded = existing.find(
			(e) => e.albumId.toString() === args.albumId.toString(),
		);
		if (alreadyAdded) {
			throw new Error("Album already in rankings");
		}

		const now = Date.now();
		return await ctx.db.insert("robRankingAlbums", {
			userId: args.userId,
			yearId: args.yearId,
			albumId: args.albumId,
			position: existing.length + 1,
			status: "none",
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Remove an album from a year's rankings
export const removeAlbumFromYear = mutation({
	args: {
		rankingAlbumId: v.id("robRankingAlbums"),
	},
	handler: async (ctx, args) => {
		const ranking = await ctx.db.get(args.rankingAlbumId);
		if (!ranking) return;

		const removedPosition = ranking.position;

		await ctx.db.delete(args.rankingAlbumId);

		const higherPositions = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", ranking.yearId))
			.filter((q) => q.gt(q.field("position"), removedPosition))
			.collect();

		for (const album of higherPositions) {
			await ctx.db.patch(album._id, {
				position: album.position - 1,
				updatedAt: Date.now(),
			});
		}
	},
});

// Update album position (swap with target position)
export const updateAlbumPosition = mutation({
	args: {
		rankingAlbumId: v.id("robRankingAlbums"),
		newPosition: v.number(),
	},
	handler: async (ctx, args) => {
		const album = await ctx.db.get(args.rankingAlbumId);
		if (!album) throw new Error("Album not found");

		const oldPosition = album.position;
		if (oldPosition === args.newPosition) return;

		const targetAlbum = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId_position", (q) =>
				q.eq("yearId", album.yearId).eq("position", args.newPosition),
			)
			.first();

		const now = Date.now();

		if (targetAlbum) {
			await ctx.db.patch(targetAlbum._id, {
				position: oldPosition,
				updatedAt: now,
			});
		}

		await ctx.db.patch(args.rankingAlbumId, {
			position: args.newPosition,
			updatedAt: now,
		});
	},
});

// Batch update album positions - applies all position changes atomically
export const batchUpdatePositions = mutation({
	args: {
		yearId: v.id("robRankingYears"),
		positions: v.array(
			v.object({
				rankingAlbumId: v.id("robRankingAlbums"),
				position: v.number(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		for (const { rankingAlbumId } of args.positions) {
			const album = await ctx.db.get(rankingAlbumId);
			if (!album) throw new Error(`Album ${rankingAlbumId} not found`);
			if (album.yearId !== args.yearId) {
				throw new Error(`Album ${rankingAlbumId} does not belong to this year`);
			}
		}

		for (const { rankingAlbumId, position } of args.positions) {
			await ctx.db.patch(rankingAlbumId, {
				position,
				updatedAt: now,
			});
		}
	},
});

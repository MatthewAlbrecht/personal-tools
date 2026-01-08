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
			createdAt: now,
			updatedAt: now,
		});
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
					status: ranking.status as "none" | "locked" | "confirmed",
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
		// Get albums already in this year's rankings
		const rankings = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		const usedAlbumIds = new Set(rankings.map((r) => r.albumId.toString()));

		// Get all spotify albums
		const allAlbums = await ctx.db.query("spotifyAlbums").collect();

		// Filter out already-used albums
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

// Add an album to a year's rankings
export const addAlbumToYear = mutation({
	args: {
		userId: v.string(),
		yearId: v.id("robRankingYears"),
		albumId: v.id("spotifyAlbums"),
	},
	handler: async (ctx, args) => {
		// Get current count to determine position
		const existing = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		if (existing.length >= 50) {
			throw new Error("Cannot add more than 50 albums");
		}

		// Check if album already exists in this year
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

		// Delete the album
		await ctx.db.delete(args.rankingAlbumId);

		// Shift down all albums with higher positions
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

		if (album.status === "confirmed") {
			throw new Error("Cannot move confirmed album");
		}

		const oldPosition = album.position;
		if (oldPosition === args.newPosition) return;

		// Check bucket constraints for locked albums
		if (album.status === "locked") {
			const oldBucket = Math.ceil(oldPosition / 10);
			const newBucket = Math.ceil(args.newPosition / 10);
			if (oldBucket !== newBucket) {
				throw new Error("Locked album cannot move outside its bucket");
			}
		}

		// Find album at target position
		const targetAlbum = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId_position", (q) =>
				q.eq("yearId", album.yearId).eq("position", args.newPosition),
			)
			.first();

		const now = Date.now();

		if (targetAlbum) {
			// Check if target is confirmed - if so, we need to find next available spot
			if (targetAlbum.status === "confirmed") {
				throw new Error("Cannot swap with confirmed album");
			}

			// Swap positions
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

// Update album status (none/locked/confirmed)
export const updateAlbumStatus = mutation({
	args: {
		rankingAlbumId: v.id("robRankingAlbums"),
		status: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.rankingAlbumId, {
			status: args.status,
			updatedAt: Date.now(),
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

		// Validate all albums belong to this year and collect current state
		const albumsToUpdate = await Promise.all(
			args.positions.map(async ({ rankingAlbumId }) => {
				const album = await ctx.db.get(rankingAlbumId);
				if (!album) throw new Error(`Album ${rankingAlbumId} not found`);
				if (album.yearId !== args.yearId) {
					throw new Error(
						`Album ${rankingAlbumId} does not belong to this year`,
					);
				}
				return album;
			}),
		);

		// Check for confirmed albums being moved
		for (let i = 0; i < albumsToUpdate.length; i++) {
			const album = albumsToUpdate[i];
			const update = args.positions[i];
			if (
				album &&
				update &&
				album.status === "confirmed" &&
				album.position !== update.position
			) {
				throw new Error("Cannot move confirmed album");
			}
		}

		// Apply all position updates atomically
		for (const { rankingAlbumId, position } of args.positions) {
			await ctx.db.patch(rankingAlbumId, {
				position,
				updatedAt: now,
			});
		}
	},
});

// Randomize order of unconfirmed albums
export const randomizeOrder = mutation({
	args: {
		yearId: v.id("robRankingYears"),
	},
	handler: async (ctx, args) => {
		const albums = await ctx.db
			.query("robRankingAlbums")
			.withIndex("by_yearId", (q) => q.eq("yearId", args.yearId))
			.collect();

		// Separate confirmed and non-confirmed albums
		const confirmed = albums.filter((a) => a.status === "confirmed");
		const nonConfirmed = albums.filter((a) => a.status !== "confirmed");

		// Get positions occupied by confirmed albums
		const confirmedPositions = new Set(confirmed.map((a) => a.position));

		// Get available positions (not occupied by confirmed albums)
		const availablePositions: number[] = [];
		for (let i = 1; i <= albums.length; i++) {
			if (!confirmedPositions.has(i)) {
				availablePositions.push(i);
			}
		}

		// Shuffle available positions
		for (let i = availablePositions.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const temp = availablePositions[i];
			const posJ = availablePositions[j];
			if (temp !== undefined && posJ !== undefined) {
				availablePositions[i] = posJ;
				availablePositions[j] = temp;
			}
		}

		// Assign shuffled positions to non-confirmed albums
		const now = Date.now();
		for (let i = 0; i < nonConfirmed.length; i++) {
			const album = nonConfirmed[i];
			const newPosition = availablePositions[i];
			if (album && newPosition !== undefined) {
				// Reset locked status when randomizing
				await ctx.db.patch(album._id, {
					position: newPosition,
					status: "none",
					updatedAt: now,
				});
			}
		}
	},
});

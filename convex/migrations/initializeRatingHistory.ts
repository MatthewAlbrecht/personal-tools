import { internalMutation, internalQuery, mutation } from "../_generated/server";

/**
 * Migration: Initialize rating history for existing rated albums
 *
 * For all userAlbums with a rating, create an initial history entry
 * with ratedAt = firstListenedAt (assume rating happened on first listen).
 */

/**
 * Step 1: Check current state before migration
 */
export const getRatingHistorySnapshot = internalQuery({
	handler: async (ctx) => {
		const userAlbums = await ctx.db.query("userAlbums").collect();
		const withRatings = userAlbums.filter((ua) => ua.rating !== undefined);

		const existingHistory = await ctx.db.query("ratingHistory").collect();

		return {
			totalAlbumsWithRatings: withRatings.length,
			existingHistoryEntries: existingHistory.length,
			sampleAlbums: withRatings.slice(0, 5).map((ua) => ({
				id: ua._id,
				albumId: ua.albumId,
				rating: ua.rating,
				firstListenedAt: ua.firstListenedAt,
			})),
		};
	},
});

/**
 * Step 2: Run the migration
 * Creates initial rating history entries for all rated albums
 * Uses firstListenedAt as the ratedAt timestamp
 */
export const initializeRatingHistory = internalMutation({
	handler: async (ctx) => {
		const userAlbums = await ctx.db.query("userAlbums").collect();
		let created = 0;
		let skipped = 0;

		for (const userAlbum of userAlbums) {
			if (userAlbum.rating !== undefined) {
				// Check if history already exists for this album
				const existingHistory = await ctx.db
					.query("ratingHistory")
					.withIndex("by_userAlbumId", (q) =>
						q.eq("userAlbumId", userAlbum._id),
					)
					.first();

				if (existingHistory) {
					skipped++;
					continue;
				}

				await ctx.db.insert("ratingHistory", {
					userId: userAlbum.userId,
					userAlbumId: userAlbum._id,
					albumId: userAlbum.albumId,
					rating: userAlbum.rating,
					previousRating: undefined,
					ratedAt: userAlbum.firstListenedAt,
				});
				created++;
			}
		}

		return { created, skipped };
	},
});

/**
 * Clear all rating history entries (use before re-running migration)
 */
export const clearRatingHistory = mutation({
	handler: async (ctx) => {
		const allHistory = await ctx.db.query("ratingHistory").collect();
		let deleted = 0;

		for (const entry of allHistory) {
			await ctx.db.delete(entry._id);
			deleted++;
		}

		return { deleted };
	},
});

import { mutation } from "../_generated/server";

/**
 * Migration: Backfill lastCategorizedAt on spotifyTracks
 *
 * This migration handles tracks that were categorized before the unified
 * spotifyTracks table existed or before lastCategorizedAt was added.
 *
 * Run this once from the Convex dashboard or CLI:
 *   npx convex run migrations/backfillCategorizedAt:run
 */
export const run = mutation({
	args: {},
	handler: async (ctx) => {
		// Get all categorizations
		const categorizations = await ctx.db
			.query("spotifySongCategorizations")
			.collect();

		let created = 0;
		let updated = 0;
		let skipped = 0;

		for (const cat of categorizations) {
			// Find existing spotifyTracks row for this user + track
			const existingTrack = await ctx.db
				.query("spotifyTracks")
				.withIndex("by_userId_trackId", (q) =>
					q.eq("userId", cat.userId).eq("trackId", cat.trackId),
				)
				.first();

			if (existingTrack) {
				// Track exists - update lastCategorizedAt if not already set or if older
				if (
					existingTrack.lastCategorizedAt === undefined ||
					existingTrack.lastCategorizedAt < cat.createdAt
				) {
					await ctx.db.patch(existingTrack._id, {
						lastCategorizedAt: cat.createdAt,
					});
					updated++;
				} else {
					skipped++;
				}
			} else {
				// Track doesn't exist - create it with categorization data
				const now = Date.now();
				await ctx.db.insert("spotifyTracks", {
					userId: cat.userId,
					trackId: cat.trackId,
					trackName: cat.trackName,
					artistName: cat.artistName,
					albumName: cat.albumName,
					albumImageUrl: cat.albumImageUrl,
					trackData: cat.trackData,
					firstSeenAt: cat.createdAt,
					lastSeenAt: cat.createdAt,
					lastCategorizedAt: cat.createdAt,
					// lastPlayedAt and lastLikedAt left undefined since we don't know
				});
				created++;
			}
		}

		return {
			total: categorizations.length,
			created,
			updated,
			skipped,
		};
	},
});








import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * Migration: Backfill source on spotifyAlbums
 *
 * Existing Spotify-imported rows have no `source`. Set them to "spotify"
 * so the schema can require the field.
 *
 * Run once from the Convex dashboard or CLI:
 *   npx convex run migrations/backfillSpotifyAlbumsSource:run
 */
export const run = mutation({
	args: {},
	returns: v.object({
		total: v.number(),
		updated: v.number(),
		skipped: v.number(),
	}),
	handler: async (ctx) => {
		const allAlbums = await ctx.db.query("spotifyAlbums").collect();

		let updated = 0;
		let skipped = 0;

		for (const album of allAlbums) {
			if (album.source === "spotify" || album.source === "manual") {
				skipped++;
				continue;
			}

			await ctx.db.patch(album._id, { source: "spotify" });
			updated++;
		}

		return {
			total: allAlbums.length,
			updated,
			skipped,
		};
	},
});

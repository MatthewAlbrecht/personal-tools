import { mutation } from "../_generated/server";

/**
 * Migration: Backfill spotifyAlbumId on spotifyTracks
 *
 * This migration extracts album.id from the trackData JSON field
 * and stores it in the new spotifyAlbumId field for efficient querying.
 *
 * Run this once from the Convex dashboard or CLI:
 *   npx convex run migrations/backfillSpotifyAlbumId:run
 */
export const run = mutation({
	args: {},
	handler: async (ctx) => {
		// Get all tracks that don't have spotifyAlbumId set
		const allTracks = await ctx.db.query("spotifyTracks").collect();

		let updated = 0;
		let skipped = 0;
		let noTrackData = 0;
		let parseErrors = 0;

		for (const track of allTracks) {
			// Skip if already has spotifyAlbumId
			if (track.spotifyAlbumId) {
				skipped++;
				continue;
			}

			// Skip if no trackData to parse
			if (!track.trackData) {
				noTrackData++;
				continue;
			}

			try {
				const trackData = JSON.parse(track.trackData) as {
					album?: { id?: string };
				};
				const albumId = trackData?.album?.id;

				if (albumId) {
					await ctx.db.patch(track._id, {
						spotifyAlbumId: albumId,
					});
					updated++;
				} else {
					noTrackData++;
				}
			} catch {
				parseErrors++;
			}
		}

		return {
			total: allTracks.length,
			updated,
			skipped,
			noTrackData,
			parseErrors,
		};
	},
});

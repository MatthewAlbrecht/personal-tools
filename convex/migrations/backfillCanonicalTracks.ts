import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Migration: Backfill spotifyTracksCanonical from spotifyTracks
 *
 * This migration reads all unique tracks from the spotifyTracks table
 * and creates canonical records in spotifyTracksCanonical.
 *
 * Run repeatedly until done: true
 *   npx convex run migrations/backfillCanonicalTracks:run --prod
 */

export const getStats = query({
	args: {},
	handler: async (ctx) => {
		const spotifyTracks = await ctx.db.query("spotifyTracks").collect();
		const canonicalTracks = await ctx.db
			.query("spotifyTracksCanonical")
			.collect();

		const uniqueTrackIds = new Set(spotifyTracks.map((t) => t.trackId));
		const canonicalTrackIds = new Set(
			canonicalTracks.map((t) => t.spotifyTrackId),
		);

		const needsMigration = [...uniqueTrackIds].filter(
			(id) => !canonicalTrackIds.has(id),
		);

		return {
			spotifyTracksCount: spotifyTracks.length,
			uniqueTrackIds: uniqueTrackIds.size,
			canonicalTracksCount: canonicalTracks.length,
			needsMigrationCount: needsMigration.length,
		};
	},
});

export const run = mutation({
	args: {
		batchSize: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 500;

		// Get existing canonical track IDs
		const existingCanonical = await ctx.db
			.query("spotifyTracksCanonical")
			.collect();
		const existingIds = new Set(existingCanonical.map((t) => t.spotifyTrackId));

		// Get spotifyTracks and find ones that need canonical records
		const allTracks = await ctx.db.query("spotifyTracks").collect();

		// Deduplicate and filter to only those needing migration
		const seenIds = new Set<string>();
		const needsMigration: typeof allTracks = [];

		for (const track of allTracks) {
			if (!seenIds.has(track.trackId) && !existingIds.has(track.trackId)) {
				seenIds.add(track.trackId);
				needsMigration.push(track);
			}
		}

		if (needsMigration.length === 0) {
			return {
				processed: 0,
				created: 0,
				done: true,
				message: "Migration complete!",
			};
		}

		const batch = needsMigration.slice(0, batchSize);
		const now = Date.now();
		let created = 0;
		let parseErrors = 0;

		for (const track of batch) {
			// Extract additional fields from trackData if available
			let durationMs: number | undefined;
			let trackNumber: number | undefined;
			let isExplicit: boolean | undefined;
			let previewUrl: string | undefined;

			if (track.trackData) {
				try {
					const trackData = JSON.parse(track.trackData) as {
						duration_ms?: number;
						track_number?: number;
						explicit?: boolean;
						preview_url?: string | null;
					};
					durationMs = trackData.duration_ms;
					trackNumber = trackData.track_number;
					isExplicit = trackData.explicit;
					previewUrl = trackData.preview_url ?? undefined;
				} catch {
					parseErrors++;
				}
			}

			// Create canonical record
			await ctx.db.insert("spotifyTracksCanonical", {
				spotifyTrackId: track.trackId,
				trackName: track.trackName,
				artistName: track.artistName,
				albumName: track.albumName,
				albumImageUrl: track.albumImageUrl,
				spotifyAlbumId: track.spotifyAlbumId,
				durationMs,
				trackNumber,
				isExplicit,
				previewUrl,
				rawData: track.trackData,
				createdAt: now,
				updatedAt: now,
			});
			created++;
		}

		return {
			processed: batch.length,
			created,
			parseErrors,
			remaining: needsMigration.length - batch.length,
			done: false,
			message: `Processed ${batch.length} tracks. ${needsMigration.length - batch.length} remaining.`,
		};
	},
});

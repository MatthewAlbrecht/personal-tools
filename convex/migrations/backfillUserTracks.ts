import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Migration to backfill userTracks from existing spotifyTracks data.
 * This creates normalized user track records that reference spotifyTracksCanonical.
 *
 * Run this after backfillCanonicalTracks has completed.
 * Usage: npx convex run migrations/backfillUserTracks:run
 */

// Query to get stats about the migration
export const getStats = query({
	args: {},
	handler: async (ctx) => {
		const spotifyTracks = await ctx.db.query("spotifyTracks").collect();
		const userTracks = await ctx.db.query("userTracks").collect();
		const canonicalTracks = await ctx.db
			.query("spotifyTracksCanonical")
			.collect();

		// Count how many spotifyTracks already have userTracks records
		const userTrackSpotifyIds = new Set(
			userTracks.map((ut) => `${ut.userId}:${ut.spotifyTrackId}`),
		);
		const needsMigration = spotifyTracks.filter(
			(st) => !userTrackSpotifyIds.has(`${st.userId}:${st.trackId}`),
		);

		return {
			spotifyTracksCount: spotifyTracks.length,
			userTracksCount: userTracks.length,
			canonicalTracksCount: canonicalTracks.length,
			needsMigrationCount: needsMigration.length,
		};
	},
});

// Process a batch of spotifyTracks and create userTracks records
export const processBatch = mutation({
	args: {
		batchSize: v.optional(v.number()),
		cursor: v.optional(v.string()), // Last processed trackId for pagination
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;

		// Get all spotifyTracks (we'll filter in memory)
		const allSpotifyTracks = await ctx.db.query("spotifyTracks").collect();

		// Get existing userTracks to know what's already migrated
		const existingUserTracks = await ctx.db.query("userTracks").collect();
		const userTrackKeys = new Set(
			existingUserTracks.map((ut) => `${ut.userId}:${ut.spotifyTrackId}`),
		);

		// Filter to tracks that need migration
		let needsMigration = allSpotifyTracks.filter(
			(st) => !userTrackKeys.has(`${st.userId}:${st.trackId}`),
		);

		// Apply cursor for pagination
		if (args.cursor) {
			const cursorIndex = needsMigration.findIndex(
				(st) => st._id.toString() === args.cursor,
			);
			if (cursorIndex >= 0) {
				needsMigration = needsMigration.slice(cursorIndex + 1);
			}
		}

		// Take a batch
		const batch = needsMigration.slice(0, batchSize);

		if (batch.length === 0) {
			return {
				processed: 0,
				remaining: 0,
				done: true,
				nextCursor: null,
			};
		}

		// Build a map of spotifyTrackId -> canonical record
		const canonicalTracks = await ctx.db
			.query("spotifyTracksCanonical")
			.collect();
		const canonicalMap = new Map(
			canonicalTracks.map((ct) => [ct.spotifyTrackId, ct]),
		);

		let processed = 0;
		let skipped = 0;
		let created = 0;

		for (const st of batch) {
			const canonical = canonicalMap.get(st.trackId);

			if (!canonical) {
				// Skip if no canonical record exists (shouldn't happen if backfill ran)
				console.warn(
					`No canonical track found for ${st.trackId}, skipping...`,
				);
				skipped++;
				continue;
			}

			// Create userTracks record
			await ctx.db.insert("userTracks", {
				userId: st.userId,
				trackId: canonical._id,
				spotifyTrackId: st.trackId,
				firstSeenAt: st.firstSeenAt,
				lastSeenAt: st.lastSeenAt,
				lastPlayedAt: st.lastPlayedAt,
				lastLikedAt: st.lastLikedAt,
				lastCategorizedAt: st.lastCategorizedAt,
			});
			created++;
			processed++;
		}

		const lastProcessed = batch[batch.length - 1];
		const remaining = needsMigration.length - batchSize;

		return {
			processed,
			skipped,
			created,
			remaining: Math.max(0, remaining),
			done: remaining <= 0,
			nextCursor: lastProcessed?._id.toString() ?? null,
		};
	},
});

// Run a single batch - call this repeatedly until done is true
export const runBatch = mutation({
	args: {
		batchSize: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 50;

		// Get a batch of spotifyTracks that don't have userTracks yet
		const spotifyTracks = await ctx.db.query("spotifyTracks").take(500);

		// Get existing userTracks keys for these tracks
		const existingUserTracks = await ctx.db.query("userTracks").take(10000);
		const userTrackKeys = new Set(
			existingUserTracks.map((ut) => `${ut.userId}:${ut.spotifyTrackId}`),
		);

		// Filter to tracks that need migration
		const needsMigration = spotifyTracks.filter(
			(st) => !userTrackKeys.has(`${st.userId}:${st.trackId}`),
		);

		const batch = needsMigration.slice(0, batchSize);

		if (batch.length === 0) {
			return {
				processed: 0,
				created: 0,
				done: true,
			};
		}

		// Get unique track IDs in this batch
		const trackIds = [...new Set(batch.map((st) => st.trackId))];

		// Fetch only the canonical tracks we need
		const canonicalTracks = await Promise.all(
			trackIds.map((id) =>
				ctx.db
					.query("spotifyTracksCanonical")
					.withIndex("by_spotifyTrackId", (q) => q.eq("spotifyTrackId", id))
					.first(),
			),
		);

		const canonicalMap = new Map(
			canonicalTracks
				.filter((ct) => ct !== null)
				.map((ct) => [ct.spotifyTrackId, ct]),
		);

		let created = 0;
		let skipped = 0;

		for (const st of batch) {
			const canonical = canonicalMap.get(st.trackId);

			if (!canonical) {
				skipped++;
				continue;
			}

			await ctx.db.insert("userTracks", {
				userId: st.userId,
				trackId: canonical._id,
				spotifyTrackId: st.trackId,
				firstSeenAt: st.firstSeenAt,
				lastSeenAt: st.lastSeenAt,
				lastPlayedAt: st.lastPlayedAt,
				lastLikedAt: st.lastLikedAt,
				lastCategorizedAt: st.lastCategorizedAt,
			});
			created++;
		}

		return {
			processed: batch.length,
			created,
			skipped,
			done: false,
		};
	},
});

// Helper to run all batches - run this in a loop from CLI
export const run = mutation({
	args: {
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const batchSize = 250;

		// Get all existing userTracks keys first
		const existingUserTracks = await ctx.db.query("userTracks").collect();
		const userTrackKeys = new Set(
			existingUserTracks.map((ut) => `${ut.userId}:${ut.spotifyTrackId}`),
		);

		// Get spotifyTracks, starting after cursor if provided
		let query = ctx.db.query("spotifyTracks");
		const allSpotifyTracks = await query.collect();

		// Find tracks that need migration
		const needsMigration = allSpotifyTracks.filter(
			(st) => !userTrackKeys.has(`${st.userId}:${st.trackId}`),
		);

		if (needsMigration.length === 0) {
			return {
				processed: 0,
				created: 0,
				done: true,
				message: "Migration complete!",
			};
		}

		// Take a batch
		const batch = needsMigration.slice(0, batchSize);

		const trackIds = [...new Set(batch.map((st) => st.trackId))];

		const canonicalTracks = await Promise.all(
			trackIds.map((id) =>
				ctx.db
					.query("spotifyTracksCanonical")
					.withIndex("by_spotifyTrackId", (q) => q.eq("spotifyTrackId", id))
					.first(),
			),
		);

		const canonicalMap = new Map(
			canonicalTracks
				.filter((ct) => ct !== null)
				.map((ct) => [ct.spotifyTrackId, ct]),
		);

		let created = 0;
		let skipped = 0;

		for (const st of batch) {
			const canonical = canonicalMap.get(st.trackId);
			if (!canonical) {
				skipped++;
				continue;
			}

			await ctx.db.insert("userTracks", {
				userId: st.userId,
				trackId: canonical._id,
				spotifyTrackId: st.trackId,
				firstSeenAt: st.firstSeenAt,
				lastSeenAt: st.lastSeenAt,
				lastPlayedAt: st.lastPlayedAt,
				lastLikedAt: st.lastLikedAt,
				lastCategorizedAt: st.lastCategorizedAt,
			});
			created++;
		}

		return {
			processed: batch.length,
			created,
			skipped,
			done: false,
			remaining: needsMigration.length - batch.length,
			message: `Processed ${batch.length} tracks. ${needsMigration.length - batch.length} remaining.`,
		};
	},
});

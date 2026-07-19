/**
 * Historical Spotify Album Listen Repair
 *
 * Convex-side readers + writer backing the `repair:spotify-album-listens`
 * CLI. All candidate-building logic lives in the pure
 * `src/lib/spotify-listen-repair.ts` module (rebuild candidates from
 * `spotifySyncLogs`, hash a candidate set); this file only exposes the data
 * those pure functions need and applies an already-previewed candidate set.
 *
 * `applyRepairCandidates` never mutates existing `userAlbumListens` rows -
 * it only inserts new listens that don't overlap an existing one for that
 * user+album, exactly like `recordAlbumListen` in `spotify.ts`.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { upsertAlbumLibraryProjection } from "./_utils/albumLibraryProjection";

export const listSyncLogsPage = internalQuery({
	args: {
		userId: v.string(),
		cursor: v.optional(v.string()),
		numItems: v.optional(v.number()),
	},
	returns: v.object({
		logs: v.array(
			v.object({
				id: v.string(),
				rawResponse: v.string(),
				createdAt: v.number(),
			}),
		),
		continueCursor: v.string(),
		isDone: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const numItems = Math.min(Math.max(args.numItems ?? 100, 1), 200);
		const page = await ctx.db
			.query("spotifySyncLogs")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.order("asc")
			.paginate({ numItems, cursor: args.cursor ?? null });

		return {
			logs: page.page.map((log) => ({
				id: log._id,
				rawResponse: log.rawResponse,
				createdAt: log.createdAt,
			})),
			continueCursor: page.continueCursor,
			isDone: page.isDone,
		};
	},
});

export const listExistingListensForUser = internalQuery({
	args: { userId: v.string() },
	returns: v.array(
		v.object({
			spotifyAlbumId: v.string(),
			earliestPlayedAt: v.number(),
			latestPlayedAt: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const listens = await ctx.db
			.query("userAlbumListens")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		const uniqueAlbumIds = [
			...new Set(listens.map((listen) => listen.albumId)),
		];
		const albums = await Promise.all(
			uniqueAlbumIds.map((id) => ctx.db.get(id)),
		);
		const spotifyAlbumIdByDbId = new Map<Id<"spotifyAlbums">, string>();
		for (const album of albums) {
			if (album) {
				spotifyAlbumIdByDbId.set(album._id, album.spotifyAlbumId);
			}
		}

		const intervals: Array<{
			spotifyAlbumId: string;
			earliestPlayedAt: number;
			latestPlayedAt: number;
		}> = [];
		for (const listen of listens) {
			const spotifyAlbumId = spotifyAlbumIdByDbId.get(listen.albumId);
			if (!spotifyAlbumId) continue;
			intervals.push({
				spotifyAlbumId,
				earliestPlayedAt: listen.earliestPlayedAt,
				latestPlayedAt: listen.latestPlayedAt,
			});
		}
		return intervals;
	},
});

export const resolveAlbumDbIds = internalQuery({
	args: { spotifyAlbumIds: v.array(v.string()) },
	returns: v.array(
		v.object({
			spotifyAlbumId: v.string(),
			dbId: v.id("spotifyAlbums"),
			totalTracks: v.number(),
			name: v.string(),
		}),
	),
	handler: async (ctx, args) => {
		const uniqueIds = [...new Set(args.spotifyAlbumIds)];
		const results: Array<{
			spotifyAlbumId: string;
			dbId: Id<"spotifyAlbums">;
			totalTracks: number;
			name: string;
		}> = [];

		for (const spotifyAlbumId of uniqueIds) {
			const album = await ctx.db
				.query("spotifyAlbums")
				.withIndex("by_spotifyAlbumId", (q) =>
					q.eq("spotifyAlbumId", spotifyAlbumId),
				)
				.first();

			if (album) {
				results.push({
					spotifyAlbumId,
					dbId: album._id,
					totalTracks: album.totalTracks,
					name: album.name,
				});
			}
		}

		return results;
	},
});

const repairCandidateValidator = v.object({
	id: v.string(),
	spotifyAlbumId: v.string(),
	trackIds: v.array(v.string()),
	earliestPlayedAt: v.number(),
	latestPlayedAt: v.number(),
});

/**
 * Inserts non-overlapping repair candidates as `userAlbumListens` rows.
 * `previewHash` is accepted for audit/logging only - the CLI is responsible
 * for recomputing and verifying the hash against the current candidate set
 * before calling this mutation (see `computePreviewHash` in
 * `src/lib/spotify-listen-repair.ts`, which relies on `node:crypto` and
 * can't run inside the Convex query/mutation isolate).
 */
export const applyRepairCandidates = internalMutation({
	args: {
		userId: v.string(),
		previewHash: v.string(),
		candidates: v.array(repairCandidateValidator),
	},
	returns: v.object({
		applied: v.number(),
		skipped: v.number(),
	}),
	handler: async (ctx, args) => {
		let applied = 0;
		let skipped = 0;

		for (const candidate of args.candidates) {
			const album = await ctx.db
				.query("spotifyAlbums")
				.withIndex("by_spotifyAlbumId", (q) =>
					q.eq("spotifyAlbumId", candidate.spotifyAlbumId),
				)
				.first();

			if (!album) {
				skipped += 1;
				continue;
			}

			const existingListens = await ctx.db
				.query("userAlbumListens")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", album._id),
				)
				.collect();

			const hasOverlap = existingListens.some(
				(listen) =>
					candidate.earliestPlayedAt <= listen.latestPlayedAt &&
					candidate.latestPlayedAt >= listen.earliestPlayedAt,
			);

			if (hasOverlap) {
				skipped += 1;
				continue;
			}

			await ctx.db.insert("userAlbumListens", {
				userId: args.userId,
				albumId: album._id,
				listenedAt: candidate.latestPlayedAt,
				earliestPlayedAt: candidate.earliestPlayedAt,
				latestPlayedAt: candidate.latestPlayedAt,
				trackIds: candidate.trackIds,
				source: "historical_repair",
			});

			const existingUserAlbum = await ctx.db
				.query("userAlbums")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", args.userId).eq("albumId", album._id),
				)
				.first();

			if (existingUserAlbum) {
				await ctx.db.patch(existingUserAlbum._id, {
					firstListenedAt: Math.min(
						existingUserAlbum.firstListenedAt,
						candidate.latestPlayedAt,
					),
					lastListenedAt: Math.max(
						existingUserAlbum.lastListenedAt,
						candidate.latestPlayedAt,
					),
					listenCount: existingUserAlbum.listenCount + 1,
				});
			} else {
				await ctx.db.insert("userAlbums", {
					userId: args.userId,
					albumId: album._id,
					firstListenedAt: candidate.latestPlayedAt,
					lastListenedAt: candidate.latestPlayedAt,
					listenCount: 1,
				});
			}

			await ctx.runMutation(
				internal.forLaterAlbums.refreshFilterProjectionsForUserAlbum,
				{ userId: args.userId, albumId: album._id },
			);
			await upsertAlbumLibraryProjection(ctx, {
				userId: args.userId,
				albumId: album._id,
			});

			applied += 1;
		}

		return { applied, skipped };
	},
});

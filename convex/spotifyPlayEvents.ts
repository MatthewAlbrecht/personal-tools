import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export function buildPlayEventKey(
	userId: string,
	spotifyTrackId: string,
	playedAt: number,
): string {
	return `${userId}:${spotifyTrackId}:${playedAt}`;
}

export const upsertPlayEvents = mutation({
	args: {
		userId: v.string(),
		syncRunId: v.optional(v.id("spotifySyncRuns")),
		events: v.array(
			v.object({
				spotifyTrackId: v.string(),
				spotifyAlbumId: v.string(),
				trackNumber: v.number(),
				discNumber: v.number(),
				playedAt: v.number(),
			}),
		),
	},
	returns: v.object({
		inserted: v.number(),
		duplicates: v.number(),
	}),
	handler: async (ctx, args) => {
		let inserted = 0;
		let duplicates = 0;
		const now = Date.now();
		for (const event of args.events) {
			const eventKey = buildPlayEventKey(
				args.userId,
				event.spotifyTrackId,
				event.playedAt,
			);
			const existing = await ctx.db
				.query("spotifyPlayEvents")
				.withIndex("by_userId_eventKey", (q) =>
					q.eq("userId", args.userId).eq("eventKey", eventKey),
				)
				.first();
			if (existing) {
				duplicates++;
				continue;
			}
			await ctx.db.insert("spotifyPlayEvents", {
				userId: args.userId,
				...event,
				eventKey,
				ingestedAt: now,
				syncRunId: args.syncRunId,
			});
			inserted++;
		}
		return { inserted, duplicates };
	},
});

export const hasAnyPlayEvents = query({
	args: { userId: v.string() },
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("spotifyPlayEvents")
			.withIndex("by_userId_playedAt", (q) => q.eq("userId", args.userId))
			.first();
		return !!row;
	},
});

export const listPlayEventsForAlbumsSince = query({
	args: {
		userId: v.string(),
		spotifyAlbumIds: v.array(v.string()),
		sinceMs: v.number(),
	},
	returns: v.array(
		v.object({
			spotifyTrackId: v.string(),
			spotifyAlbumId: v.string(),
			trackNumber: v.number(),
			discNumber: v.number(),
			playedAt: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const albumSet = new Set(args.spotifyAlbumIds);
		const out: Array<{
			spotifyTrackId: string;
			spotifyAlbumId: string;
			trackNumber: number;
			discNumber: number;
			playedAt: number;
		}> = [];
		for (const spotifyAlbumId of albumSet) {
			const rows = await ctx.db
				.query("spotifyPlayEvents")
				.withIndex("by_userId_albumId_playedAt", (q) =>
					q
						.eq("userId", args.userId)
						.eq("spotifyAlbumId", spotifyAlbumId)
						.gte("playedAt", args.sinceMs),
				)
				.collect();
			for (const row of rows) {
				out.push({
					spotifyTrackId: row.spotifyTrackId,
					spotifyAlbumId: row.spotifyAlbumId,
					trackNumber: row.trackNumber,
					discNumber: row.discNumber,
					playedAt: row.playedAt,
				});
			}
		}
		return out;
	},
});

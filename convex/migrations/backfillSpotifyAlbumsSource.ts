import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * Migration: Backfill source on spotifyAlbums
 *
 * Existing Spotify-imported rows have no `source`. Set them to "spotify"
 * so the schema can require the field.
 *
 * Run repeatedly until done:
 *   npx convex run migrations/backfillSpotifyAlbumsSource:runBatch --prod
 *   npx convex run migrations/backfillSpotifyAlbumsSource:runBatch --prod '{"cursor":"<continueCursor>"}'
 */
export const runBatch = mutation({
	args: {
		cursor: v.optional(v.string()),
		batchSize: v.optional(v.number()),
	},
	returns: v.object({
		processed: v.number(),
		updated: v.number(),
		skipped: v.number(),
		done: v.boolean(),
		cursor: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const batchSize = Math.min(Math.max(args.batchSize ?? 100, 1), 200);
		const page = await ctx.db
			.query("spotifyAlbums")
			.paginate({ numItems: batchSize, cursor: args.cursor ?? null });

		let updated = 0;
		let skipped = 0;

		for (const album of page.page) {
			if (
				album.source === "spotify" ||
				album.source === "manual" ||
				album.source === "bandcamp"
			) {
				skipped++;
				continue;
			}

			await ctx.db.patch(album._id, { source: "spotify" });
			updated++;
		}

		return {
			processed: page.page.length,
			updated,
			skipped,
			done: page.isDone,
			cursor: page.isDone ? undefined : page.continueCursor,
		};
	},
});

/**
 * @deprecated Prefer runBatch for production-sized tables.
 */
export const run = mutation({
	args: {},
	returns: v.object({
		total: v.number(),
		updated: v.number(),
		skipped: v.number(),
	}),
	handler: async (ctx) => {
		const page = await ctx.db
			.query("spotifyAlbums")
			.paginate({ numItems: 200, cursor: null });

		let updated = 0;
		let skipped = 0;

		for (const album of page.page) {
			if (
				album.source === "spotify" ||
				album.source === "manual" ||
				album.source === "bandcamp"
			) {
				skipped++;
				continue;
			}

			await ctx.db.patch(album._id, { source: "spotify" });
			updated++;
		}

		if (!page.isDone) {
			throw new Error(
				"Too many albums for single-shot run; use runBatch until done:true",
			);
		}

		return {
			total: page.page.length,
			updated,
			skipped,
		};
	},
});

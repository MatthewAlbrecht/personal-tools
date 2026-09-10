import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import {
	computeListenFilterFields,
	listenFilterFieldsNeedPatch,
} from "../_utils/albumListenDenormalized";

/**
 * Backfill denormalized Listens filter fields on userAlbumListens.
 *
 * Run repeatedly until done:
 *   npx convex run migrations/backfillListenFilterFields:runBatch
 *   npx convex run migrations/backfillListenFilterFields:runBatch '{"cursor":"<continueCursor>"}'
 */
export const runBatch = mutation({
	args: {
		cursor: v.optional(v.string()),
		batchSize: v.optional(v.number()),
	},
	returns: v.object({
		processed: v.number(),
		patched: v.number(),
		done: v.boolean(),
		cursor: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const batchSize = Math.min(Math.max(args.batchSize ?? 100, 1), 200);
		const page = await ctx.db
			.query("userAlbumListens")
			.paginate({ numItems: batchSize, cursor: args.cursor ?? null });

		const userAlbumByKey = new Map<string, Doc<"userAlbums"> | null>();
		const albumById = new Map<
			Id<"spotifyAlbums">,
			Doc<"spotifyAlbums"> | null
		>();

		async function loadUserAlbum(
			userId: string,
			albumId: Id<"spotifyAlbums">,
		): Promise<Doc<"userAlbums"> | null> {
			const key = `${userId}:${albumId}`;
			if (userAlbumByKey.has(key)) {
				return userAlbumByKey.get(key) ?? null;
			}
			const userAlbum = await ctx.db
				.query("userAlbums")
				.withIndex("by_userId_albumId", (q) =>
					q.eq("userId", userId).eq("albumId", albumId),
				)
				.first();
			userAlbumByKey.set(key, userAlbum);
			return userAlbum;
		}

		async function loadAlbum(
			albumId: Id<"spotifyAlbums">,
		): Promise<Doc<"spotifyAlbums"> | null> {
			if (albumById.has(albumId)) {
				return albumById.get(albumId) ?? null;
			}
			const album = await ctx.db.get(albumId);
			albumById.set(albumId, album);
			return album;
		}

		let patched = 0;
		for (const listen of page.page) {
			const userAlbum = await loadUserAlbum(listen.userId, listen.albumId);
			const album = await loadAlbum(listen.albumId);
			const fields = computeListenFilterFields({
				listenedAt: listen.listenedAt,
				firstListenedAt: userAlbum?.firstListenedAt,
				rating: userAlbum?.rating,
				releaseDate: album?.releaseDate,
			});
			if (!listenFilterFieldsNeedPatch(listen, fields)) {
				continue;
			}
			await ctx.db.patch(listen._id, fields);
			patched += 1;
		}

		return {
			processed: page.page.length,
			patched,
			done: page.isDone,
			...(page.isDone ? {} : { cursor: page.continueCursor }),
		};
	},
});

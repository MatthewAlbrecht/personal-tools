import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { upsertAlbumLibraryProjection } from "./albumLibraryProjection";
import { syncListenFilterFieldsForUserAlbum } from "./albumListenDenormalized";
import { normalizeAlbumTitle, normalizeArtistName } from "./albumMatching";

export async function findAlbumByNormalizedTitleArtist(
	ctx: MutationCtx,
	args: { name: string; artistName: string },
): Promise<Doc<"spotifyAlbums"> | null> {
	const albumTitleKey = normalizeAlbumTitle(args.name);
	const targetArtistKey = normalizeArtistName(args.artistName);

	const candidates = await ctx.db
		.query("spotifyAlbums")
		.withIndex("by_albumTitleKey", (q) => q.eq("albumTitleKey", albumTitleKey))
		.collect();

	return (
		candidates.find(
			(candidate) =>
				normalizeArtistName(candidate.artistName) === targetArtistKey,
		) ?? null
	);
}

export async function insertManualAlbum(
	ctx: MutationCtx,
	args: {
		name: string;
		artistName: string;
		releaseYear: number;
		imageUrl?: string;
	},
): Promise<Id<"spotifyAlbums">> {
	const now = Date.now();
	const albumTitleKey = normalizeAlbumTitle(args.name);

	return await ctx.db.insert("spotifyAlbums", {
		source: "manual",
		name: args.name,
		artistName: args.artistName,
		albumTitleKey,
		imageUrl: args.imageUrl,
		releaseDate: String(args.releaseYear),
		totalTracks: 0,
		createdAt: now,
		updatedAt: now,
	});
}

export async function recordManualListenForAlbum(
	ctx: MutationCtx,
	args: { userId: string; albumId: Id<"spotifyAlbums">; listenedAt: number },
): Promise<{ recorded: boolean; reason?: string }> {
	const existingListens = await ctx.db
		.query("userAlbumListens")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.collect();

	const isDuplicate = existingListens.some(
		(listen) => listen.listenedAt === args.listenedAt,
	);
	if (isDuplicate) {
		return { recorded: false, reason: "duplicate_listen" };
	}

	await ctx.db.insert("userAlbumListens", {
		userId: args.userId,
		albumId: args.albumId,
		listenedAt: args.listenedAt,
		earliestPlayedAt: args.listenedAt,
		latestPlayedAt: args.listenedAt,
		trackIds: [],
		source: "manual",
	});

	const existingUserAlbum = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", args.userId).eq("albumId", args.albumId),
		)
		.first();

	if (existingUserAlbum) {
		await ctx.db.patch(existingUserAlbum._id, {
			firstListenedAt: Math.min(
				existingUserAlbum.firstListenedAt,
				args.listenedAt,
			),
			lastListenedAt: Math.max(
				existingUserAlbum.lastListenedAt,
				args.listenedAt,
			),
			listenCount: existingUserAlbum.listenCount + 1,
		});
	} else {
		await ctx.db.insert("userAlbums", {
			userId: args.userId,
			albumId: args.albumId,
			firstListenedAt: args.listenedAt,
			lastListenedAt: args.listenedAt,
			listenCount: 1,
		});
	}

	await syncListenFilterFieldsForUserAlbum(ctx, args.userId, args.albumId);

	await ctx.runMutation(
		internal.forLaterAlbums.refreshFilterProjectionsForUserAlbum,
		{ userId: args.userId, albumId: args.albumId },
	);
	await upsertAlbumLibraryProjection(ctx, {
		userId: args.userId,
		albumId: args.albumId,
	});

	return { recorded: true };
}

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeAlbumTitle } from "./albumMatching";
import { refreshAlbumLibraryProjectionsForAlbum } from "./albumLibraryProjection";

export type UpsertSpotifyAlbumRecordArgs = {
	spotifyAlbumId: string;
	name: string;
	artistName: string;
	imageUrl?: string;
	releaseDate?: string;
	totalTracks: number;
	genres?: string[];
	rawData?: string;
};

export async function upsertSpotifyAlbumRecord(
	ctx: MutationCtx,
	args: UpsertSpotifyAlbumRecordArgs,
): Promise<Id<"spotifyAlbums">> {
	const now = Date.now();
	const albumTitleKey = normalizeAlbumTitle(args.name);

	const existing = await ctx.db
		.query("spotifyAlbums")
		.withIndex("by_spotifyAlbumId", (q) =>
			q.eq("spotifyAlbumId", args.spotifyAlbumId),
		)
		.first();

	if (existing) {
		await ctx.db.patch(existing._id, {
			name: args.name,
			albumTitleKey,
			artistName: args.artistName,
			imageUrl: args.imageUrl,
			releaseDate: args.releaseDate,
			totalTracks: args.totalTracks,
			genres: args.genres,
			...(args.rawData !== undefined ? { rawData: args.rawData } : {}),
			updatedAt: now,
		});
		await refreshAlbumLibraryProjectionsForAlbum(ctx, existing._id);
		return existing._id;
	}

	const albumId = await ctx.db.insert("spotifyAlbums", {
		spotifyAlbumId: args.spotifyAlbumId,
		name: args.name,
		albumTitleKey,
		artistName: args.artistName,
		imageUrl: args.imageUrl,
		releaseDate: args.releaseDate,
		totalTracks: args.totalTracks,
		genres: args.genres,
		...(args.rawData !== undefined ? { rawData: args.rawData } : {}),
		createdAt: now,
		updatedAt: now,
	});
	await refreshAlbumLibraryProjectionsForAlbum(ctx, albumId);
	return albumId;
}

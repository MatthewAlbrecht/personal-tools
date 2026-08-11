import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeAlbumTitle } from "./albumMatching";
import { normalizeBandcampAlbumUrl } from "./bandcampAlbumUrl";

export async function upsertBandcampAlbumRecord(
	ctx: MutationCtx,
	args: {
		bandcampUrl: string;
		name: string;
		artistName: string;
		imageUrl?: string;
		releaseDate?: string;
	},
): Promise<{ albumId: Id<"spotifyAlbums">; alreadyExists: boolean }> {
	const bandcampUrl = normalizeBandcampAlbumUrl(args.bandcampUrl);
	const name = args.name.replace(/\s+/g, " ").trim();
	const artistName = args.artistName.replace(/\s+/g, " ").trim();
	if (!name) throw new Error("Album title is required");
	if (!artistName) throw new Error("Artist name is required");

	const albumTitleKey = normalizeAlbumTitle(name);
	const now = Date.now();

	const existing = await ctx.db
		.query("spotifyAlbums")
		.withIndex("by_bandcampUrl", (q) => q.eq("bandcampUrl", bandcampUrl))
		.first();

	if (existing) {
		if (existing.source !== "bandcamp") {
			throw new Error("bandcampUrl collides with a non-bandcamp album");
		}
		await ctx.db.patch(existing._id, {
			name,
			artistName,
			albumTitleKey,
			...(args.imageUrl !== undefined ? { imageUrl: args.imageUrl } : {}),
			...(args.releaseDate !== undefined
				? { releaseDate: args.releaseDate }
				: {}),
			updatedAt: now,
		});
		return { albumId: existing._id, alreadyExists: true };
	}

	const albumId = await ctx.db.insert("spotifyAlbums", {
		source: "bandcamp",
		bandcampUrl,
		name,
		artistName,
		albumTitleKey,
		imageUrl: args.imageUrl,
		releaseDate: args.releaseDate,
		totalTracks: 0,
		createdAt: now,
		updatedAt: now,
	});
	return { albumId, alreadyExists: false };
}

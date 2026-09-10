import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { parseListenReleaseYear } from "./albumListenFilters";

export type ListenFilterDenormalizedFields = {
	isFirstListen: boolean;
	hasRating: boolean;
	releaseYear?: number;
};

export function computeListenFilterFields(args: {
	listenedAt: number;
	firstListenedAt: number | undefined;
	rating: number | undefined;
	releaseDate: string | undefined;
}): ListenFilterDenormalizedFields {
	const releaseYear = parseListenReleaseYear(args.releaseDate);
	return {
		isFirstListen:
			args.firstListenedAt !== undefined &&
			args.listenedAt === args.firstListenedAt,
		hasRating: args.rating !== undefined,
		...(releaseYear !== undefined ? { releaseYear } : {}),
	};
}

export function listenFilterFieldsNeedPatch(
	listen: {
		isFirstListen?: boolean;
		hasRating?: boolean;
		releaseYear?: number;
	},
	fields: ListenFilterDenormalizedFields,
): boolean {
	if (listen.isFirstListen !== fields.isFirstListen) {
		return true;
	}
	if (listen.hasRating !== fields.hasRating) {
		return true;
	}
	if (listen.releaseYear !== fields.releaseYear) {
		return true;
	}
	return false;
}

/**
 * Keep denormalized listen filter fields in sync for one user+album.
 * Call after listen create/delete/convert and after rating changes.
 */
export async function syncListenFilterFieldsForUserAlbum(
	ctx: MutationCtx,
	userId: string,
	albumId: Id<"spotifyAlbums">,
): Promise<number> {
	const listens = await ctx.db
		.query("userAlbumListens")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", userId).eq("albumId", albumId),
		)
		.collect();

	if (listens.length === 0) {
		return 0;
	}

	const userAlbum = await ctx.db
		.query("userAlbums")
		.withIndex("by_userId_albumId", (q) =>
			q.eq("userId", userId).eq("albumId", albumId),
		)
		.first();
	const album = await ctx.db.get(albumId);

	let patched = 0;
	for (const listen of listens) {
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
	return patched;
}

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
	artistKeysIntersect,
	buildArtistKeys,
	findTitleArtistMatch,
	normalizeAlbumTitle,
	normalizeArtistName,
} from "./albumMatchingCore";

export {
	buildArtistKeys,
	findTitleArtistMatch,
	normalizeAlbumTitle,
	normalizeArtistName,
	artistKeysIntersect,
} from "./albumMatchingCore";

export type RymMatchMethod = "spotify_id" | "title_artist";

export type RymMatchResult = {
	scrapeId?: Id<"rateYourMusicScrapes">;
	method?: RymMatchMethod;
	matchedArtistKey?: string;
};

function getRymArtistNames(scrape: Doc<"rateYourMusicScrapes">): string[] {
	return scrape.artists.map((artist) => artist.name);
}

async function upsertRymSpotifyAlbumLink(
	ctx: MutationCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		albumId: Id<"spotifyAlbums">;
		spotifyAlbumId?: string;
		method: RymMatchMethod;
		matchedArtistKey?: string;
		now: number;
	},
): Promise<void> {
	const existing = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_scrapeId_albumId", (q) =>
			q.eq("scrapeId", args.scrapeId).eq("albumId", args.albumId),
		)
		.first();

	const patch = {
		spotifyAlbumId: args.spotifyAlbumId,
		method: args.method,
		matchedArtistKey: args.matchedArtistKey,
		updatedAt: args.now,
	};

	if (existing) {
		await ctx.db.patch(existing._id, patch);
		return;
	}

	await ctx.db.insert("rateYourMusicSpotifyAlbumLinks", {
		scrapeId: args.scrapeId,
		albumId: args.albumId,
		...patch,
		createdAt: args.now,
	});
}

async function patchForLaterItemMatch(
	ctx: MutationCtx,
	args: {
		forLaterAlbumItemId: Id<"forLaterAlbumItems">;
		scrapeId: Id<"rateYourMusicScrapes">;
		method: RymMatchMethod;
		now: number;
	},
): Promise<void> {
	await ctx.db.patch(args.forLaterAlbumItemId, {
		rymScrapeId: args.scrapeId,
		rymMatchMethod: args.method,
		rymMatchedAt: args.now,
		updatedAt: args.now,
	});
}

async function patchScrapeAlbumConvexId(
	ctx: MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
	albumId: Id<"spotifyAlbums">,
): Promise<void> {
	await ctx.db.patch(scrapeId, { spotifyAlbumConvexId: albumId });
}

export async function matchRymForForLaterAlbum(
	ctx: MutationCtx,
	args: {
		userId: string;
		forLaterAlbumItemId: Id<"forLaterAlbumItems">;
		spotifyAlbumId: string;
		albumTitleKey: string;
		artistKeys: string[];
		now: number;
	},
): Promise<RymMatchResult> {
	const item = await ctx.db.get(args.forLaterAlbumItemId);
	if (
		!item ||
		item.userId !== args.userId ||
		item.spotifyAlbumId !== args.spotifyAlbumId
	) {
		return {};
	}

	const exactScrape = await ctx.db
		.query("rateYourMusicScrapes")
		.withIndex("by_spotifyAlbumId", (q) =>
			q.eq("spotifyAlbumId", args.spotifyAlbumId),
		)
		.first();

	if (exactScrape) {
		await upsertRymSpotifyAlbumLink(ctx, {
			scrapeId: exactScrape._id,
			albumId: item.albumId,
			spotifyAlbumId: args.spotifyAlbumId,
			method: "spotify_id",
			now: args.now,
		});
		await patchForLaterItemMatch(ctx, {
			forLaterAlbumItemId: item._id,
			scrapeId: exactScrape._id,
			method: "spotify_id",
			now: args.now,
		});
		await patchScrapeAlbumConvexId(ctx, exactScrape._id, item.albumId);
		return { scrapeId: exactScrape._id, method: "spotify_id" };
	}

	const scrapes = await ctx.db
		.query("rateYourMusicScrapes")
		.withIndex("by_updatedAt")
		.order("desc")
		.collect();
	const titleArtistMatch = findTitleArtistMatch(
		{ albumTitleKey: args.albumTitleKey, artistKeys: args.artistKeys },
		scrapes.map((scrape) => ({
			...scrape,
			artistNames: getRymArtistNames(scrape),
		})),
	);

	if (!titleArtistMatch) {
		return {};
	}

	await upsertRymSpotifyAlbumLink(ctx, {
		scrapeId: titleArtistMatch.candidate._id,
		albumId: item.albumId,
		spotifyAlbumId: args.spotifyAlbumId,
		method: "title_artist",
		matchedArtistKey: titleArtistMatch.matchedArtistKey,
		now: args.now,
	});
	await patchForLaterItemMatch(ctx, {
		forLaterAlbumItemId: item._id,
		scrapeId: titleArtistMatch.candidate._id,
		method: "title_artist",
		now: args.now,
	});
	await patchScrapeAlbumConvexId(
		ctx,
		titleArtistMatch.candidate._id,
		item.albumId,
	);

	return {
		scrapeId: titleArtistMatch.candidate._id,
		method: "title_artist",
		matchedArtistKey: titleArtistMatch.matchedArtistKey,
	};
}

export async function matchForLaterAlbumsForRymScrape(
	ctx: MutationCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		spotifyAlbumId?: string;
		albumTitle: string;
		artists: Array<{ name: string }>;
		now: number;
	},
): Promise<number> {
	const userId = process.env.SPOTIFY_SYNC_USER_ID;
	if (!userId) {
		throw new Error("SPOTIFY_SYNC_USER_ID not configured");
	}

	const matchedAlbumIds = new Set<Id<"spotifyAlbums">>();
	let matchesCreated = 0;

	if (args.spotifyAlbumId) {
		const spotifyAlbumId = args.spotifyAlbumId;
		const album = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", spotifyAlbumId),
			)
			.first();

		if (album) {
			const items = await ctx.db
				.query("forLaterAlbumItems")
				.withIndex("by_userId_spotifyAlbumId", (q) =>
					q.eq("userId", userId).eq("spotifyAlbumId", spotifyAlbumId),
				)
				.collect();

			for (const item of items) {
				await upsertRymSpotifyAlbumLink(ctx, {
					scrapeId: args.scrapeId,
					albumId: item.albumId,
					spotifyAlbumId: spotifyAlbumId,
					method: "spotify_id",
					now: args.now,
				});
				await patchForLaterItemMatch(ctx, {
					forLaterAlbumItemId: item._id,
					scrapeId: args.scrapeId,
					method: "spotify_id",
					now: args.now,
				});
				matchedAlbumIds.add(item.albumId);
				matchesCreated += 1;
			}

			if (matchedAlbumIds.size === 1) {
				await patchScrapeAlbumConvexId(ctx, args.scrapeId, album._id);
			}

			return matchesCreated;
		}
	}

	const albumTitleKey = normalizeAlbumTitle(args.albumTitle);
	const rymArtistKeys = buildArtistKeys(
		args.artists.map((artist) => artist.name),
	);
	const candidates = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_userId_albumTitleKey", (q) =>
			q.eq("userId", userId).eq("albumTitleKey", albumTitleKey),
		)
		.collect();

	for (const item of candidates) {
		const matchedArtistKey = artistKeysIntersect(
			item.artistKeys,
			rymArtistKeys,
		);
		if (!matchedArtistKey) {
			continue;
		}

		await upsertRymSpotifyAlbumLink(ctx, {
			scrapeId: args.scrapeId,
			albumId: item.albumId,
			spotifyAlbumId: item.spotifyAlbumId,
			method: "title_artist",
			matchedArtistKey,
			now: args.now,
		});
		await patchForLaterItemMatch(ctx, {
			forLaterAlbumItemId: item._id,
			scrapeId: args.scrapeId,
			method: "title_artist",
			now: args.now,
		});
		matchedAlbumIds.add(item.albumId);
		matchesCreated += 1;
	}

	if (matchedAlbumIds.size === 1) {
		const [albumId] = [...matchedAlbumIds];
		if (albumId) {
			await patchScrapeAlbumConvexId(ctx, args.scrapeId, albumId);
		}
	}

	return matchesCreated;
}

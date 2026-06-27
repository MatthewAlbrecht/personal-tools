import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
	artistKeysIntersect,
	buildArtistKeys,
	findTitleArtistMatch,
	normalizeAlbumTitle,
} from "./albumMatchingCore";

export {
	buildArtistKeys,
	findTitleArtistMatch,
	normalizeAlbumTitle,
	normalizeArtistName,
	artistKeysIntersect,
} from "./albumMatchingCore";

export type RymMatchMethod = "spotify_id" | "title_artist" | "manual";

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

async function patchScrapeAlbumConvexId(
	ctx: MutationCtx,
	scrapeId: Id<"rateYourMusicScrapes">,
	albumId: Id<"spotifyAlbums">,
): Promise<void> {
	await ctx.db.patch(scrapeId, { spotifyAlbumConvexId: albumId });
}

export type SpotifyAlbumRymMatchArgs = {
	albumId: Id<"spotifyAlbums">;
	spotifyAlbumId: string;
	albumTitleKey: string;
	artistKeys: string[];
};

/** Artist keys for a canonical album row (raw JSON artists when present, else comma-split artistName). */
function canonicalAlbumArtistKeys(doc: Doc<"spotifyAlbums">): string[] {
	if (doc.rawData) {
		try {
			const parsed = JSON.parse(doc.rawData) as {
				artists?: Array<{ name?: string }>;
			};
			const names =
				parsed.artists
					?.map((a) => a.name)
					.filter((n): n is string => Boolean(n)) ?? [];
			if (names.length > 0) {
				return buildArtistKeys(names);
			}
		} catch {
			// fall through to artistName
		}
	}

	const segments = doc.artistName
		.split(", ")
		.map((s) => s.trim())
		.filter(Boolean);
	if (segments.length > 0) {
		return buildArtistKeys(segments);
	}

	return buildArtistKeys([doc.artistName]);
}

export function buildSpotifyAlbumRymMatchArgs(
	album: Doc<"spotifyAlbums">,
): SpotifyAlbumRymMatchArgs {
	return {
		albumId: album._id,
		spotifyAlbumId: album.spotifyAlbumId,
		albumTitleKey: normalizeAlbumTitle(album.name),
		artistKeys: canonicalAlbumArtistKeys(album),
	};
}

export async function matchRymForSpotifyAlbum(
	ctx: MutationCtx,
	args: SpotifyAlbumRymMatchArgs & { now: number },
): Promise<RymMatchResult> {
	const exactScrape = await ctx.db
		.query("rateYourMusicScrapes")
		.withIndex("by_spotifyAlbumId", (q) =>
			q.eq("spotifyAlbumId", args.spotifyAlbumId),
		)
		.first();

	if (exactScrape) {
		await upsertRymSpotifyAlbumLink(ctx, {
			scrapeId: exactScrape._id,
			albumId: args.albumId,
			spotifyAlbumId: args.spotifyAlbumId,
			method: "spotify_id",
			now: args.now,
		});
		await patchScrapeAlbumConvexId(ctx, exactScrape._id, args.albumId);
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
		albumId: args.albumId,
		spotifyAlbumId: args.spotifyAlbumId,
		method: "title_artist",
		matchedArtistKey: titleArtistMatch.matchedArtistKey,
		now: args.now,
	});
	await patchScrapeAlbumConvexId(
		ctx,
		titleArtistMatch.candidate._id,
		args.albumId,
	);

	return {
		scrapeId: titleArtistMatch.candidate._id,
		method: "title_artist",
		matchedArtistKey: titleArtistMatch.matchedArtistKey,
	};
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

	return matchRymForSpotifyAlbum(ctx, {
		albumId: item.albumId,
		spotifyAlbumId: args.spotifyAlbumId,
		albumTitleKey: args.albumTitleKey,
		artistKeys: args.artistKeys,
		now: args.now,
	});
}

/**
 * After a RYM scrape is saved: link scrape ↔ canonical `spotifyAlbums` via Spotify id or unique title+artist.
 * For Later rows are not updated; resolve RYM via `albumId` → link table / `spotifyAlbumConvexId`.
 */
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
	if (args.spotifyAlbumId) {
		const spotifyAlbumId = args.spotifyAlbumId;
		const album = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", spotifyAlbumId),
			)
			.first();

		if (album) {
			await upsertRymSpotifyAlbumLink(ctx, {
				scrapeId: args.scrapeId,
				albumId: album._id,
				spotifyAlbumId,
				method: "spotify_id",
				now: args.now,
			});
			await patchScrapeAlbumConvexId(ctx, args.scrapeId, album._id);
			return 1;
		}
	}

	const albumTitleKey = normalizeAlbumTitle(args.albumTitle);
	const rymArtistKeys = buildArtistKeys(
		args.artists.map((artist) => artist.name),
	);

	/** Bounded read: full-table `.collect()` exceeds Convex limits at scale. */
	const albums = await ctx.db
		.query("spotifyAlbums")
		.withIndex("by_createdAt")
		.order("desc")
		.take(1024);

	const matchedCanonical: Doc<"spotifyAlbums">[] = [];
	for (const album of albums) {
		if (normalizeAlbumTitle(album.name) !== albumTitleKey) {
			continue;
		}
		const albumArtistKeys = canonicalAlbumArtistKeys(album);
		if (artistKeysIntersect(albumArtistKeys, rymArtistKeys)) {
			matchedCanonical.push(album);
		}
	}

	if (matchedCanonical.length !== 1) {
		return 0;
	}

	const album = matchedCanonical[0];
	if (!album) {
		return 0;
	}

	const matchedArtistKey = artistKeysIntersect(
		canonicalAlbumArtistKeys(album),
		rymArtistKeys,
	);
	if (!matchedArtistKey) {
		return 0;
	}

	await upsertRymSpotifyAlbumLink(ctx, {
		scrapeId: args.scrapeId,
		albumId: album._id,
		spotifyAlbumId: album.spotifyAlbumId,
		method: "title_artist",
		matchedArtistKey,
		now: args.now,
	});
	await patchScrapeAlbumConvexId(ctx, args.scrapeId, album._id);

	return 1;
}

export async function linkRymScrapeToSpotifyAlbum(
	ctx: MutationCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		albumId: Id<"spotifyAlbums">;
		spotifyAlbumId?: string;
		method: RymMatchMethod;
		now: number;
	},
): Promise<void> {
	await upsertRymSpotifyAlbumLink(ctx, {
		scrapeId: args.scrapeId,
		albumId: args.albumId,
		spotifyAlbumId: args.spotifyAlbumId,
		method: args.method,
		now: args.now,
	});
	await patchScrapeAlbumConvexId(ctx, args.scrapeId, args.albumId);
}

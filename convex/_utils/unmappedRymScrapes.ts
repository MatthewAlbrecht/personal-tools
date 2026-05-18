import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Scrape ids already linked on a for-later row or Spotify album junction. */
export async function collectMappedRymScrapeIds(
	ctx: QueryCtx,
): Promise<Set<Id<"rateYourMusicScrapes">>> {
	const mapped = new Set<Id<"rateYourMusicScrapes">>();

	const links = await ctx.db.query("rateYourMusicSpotifyAlbumLinks").collect();
	for (const link of links) {
		mapped.add(link.scrapeId);
	}

	const items = await ctx.db.query("forLaterAlbumItems").collect();
	for (const item of items) {
		if (item.rymScrapeId) {
			mapped.add(item.rymScrapeId);
		}
	}

	return mapped;
}

export function scrapeMatchesSearch(
	scrape: Doc<"rateYourMusicScrapes">,
	searchTerm: string,
): boolean {
	const term = searchTerm.trim().toLowerCase();
	if (!term) {
		return true;
	}

	const haystack = [
		scrape.albumTitle,
		...scrape.artists.map((artist) => artist.name),
	]
		.join(" ")
		.toLowerCase();

	return haystack.includes(term);
}

/**
 * True when the scrape is linked to a different for-later row or canonical album.
 * Links on `allowedAlbumId` and `rymScrapeId` on `allowedItemId` are ignored.
 */
export async function isRymScrapeMappedElsewhere(
	ctx: QueryCtx,
	args: {
		scrapeId: Id<"rateYourMusicScrapes">;
		allowedItemId: Id<"forLaterAlbumItems">;
		allowedAlbumId: Id<"spotifyAlbums">;
	},
): Promise<boolean> {
	const items = await ctx.db
		.query("forLaterAlbumItems")
		.withIndex("by_rymScrapeId", (q) => q.eq("rymScrapeId", args.scrapeId))
		.collect();

	for (const item of items) {
		if (item._id !== args.allowedItemId) {
			return true;
		}
	}

	const albumLinks = await ctx.db
		.query("rateYourMusicSpotifyAlbumLinks")
		.withIndex("by_scrapeId", (q) => q.eq("scrapeId", args.scrapeId))
		.collect();

	for (const link of albumLinks) {
		if (link.albumId !== args.allowedAlbumId) {
			return true;
		}
	}

	return false;
}

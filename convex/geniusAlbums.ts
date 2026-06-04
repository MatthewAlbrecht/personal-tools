import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	extractAbout,
	extractAlbumMetadata,
	extractAlbumTracklist,
	extractLyrics,
	extractSongTitle,
	slugify,
} from "./_utils/geniusParser";
import { requireAuth } from "./auth";

/**
 * List recent albums ordered by most recently updated
 */
export const listRecent = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const limit = args.limit ?? 50;
		return await ctx.db
			.query("geniusAlbums")
			.withIndex("by_updatedAt")
			.order("desc")
			.take(limit);
	},
});

/**
 * Get album by slug including all songs
 */
export const getAlbumBySlug = query({
	args: {
		slug: v.string(),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);

		// Find album by slug
		const album = await ctx.db
			.query("geniusAlbums")
			.withIndex("by_albumSlug", (q) => q.eq("albumSlug", args.slug))
			.first();

		if (!album) return null;

		// Get all songs for this album, ordered by track number
		const songs = await ctx.db
			.query("geniusSongs")
			.withIndex("by_albumId", (q) => q.eq("albumId", album._id))
			.collect();

		// Sort by track number
		songs.sort((a, b) => a.trackNumber - b.trackNumber);

		return {
			album: {
				...album,
				zineCoverImageUrl: await resolveAlbumCoverImageUrl(ctx, album),
			},
			songs,
		};
	},
});

/**
 * Get album by ID
 */
export const getAlbumById = query({
	args: {
		id: v.id("geniusAlbums"),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db.get(args.id);
	},
});

/**
 * Create a new album record
 */
export const createAlbum = mutation({
	args: {
		albumTitle: v.string(),
		artistName: v.string(),
		albumSlug: v.string(),
		geniusAlbumUrl: v.string(),
		totalSongs: v.number(),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();

		// Check if album with this slug already exists
		const existing = await ctx.db
			.query("geniusAlbums")
			.withIndex("by_albumSlug", (q) => q.eq("albumSlug", args.albumSlug))
			.first();

		if (existing) {
			// Update existing album
			await ctx.db.patch(existing._id, {
				albumTitle: args.albumTitle,
				artistName: args.artistName,
				geniusAlbumUrl: args.geniusAlbumUrl,
				totalSongs: args.totalSongs,
				updatedAt: now,
			});
			return existing._id;
		}

		// Create new album
		return await ctx.db.insert("geniusAlbums", {
			albumTitle: args.albumTitle,
			artistName: args.artistName,
			albumSlug: args.albumSlug,
			geniusAlbumUrl: args.geniusAlbumUrl,
			totalSongs: args.totalSongs,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Create a new song record
 */
export const createSong = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		songTitle: v.string(),
		geniusSongUrl: v.string(),
		trackNumber: v.number(),
		lyrics: v.string(),
		about: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();

		return await ctx.db.insert("geniusSongs", {
			albumId: args.albumId,
			songTitle: args.songTitle,
			geniusSongUrl: args.geniusSongUrl,
			trackNumber: args.trackNumber,
			lyrics: args.lyrics,
			about: args.about,
			createdAt: now,
		});
	},
});

/**
 * Delete album and all associated songs
 */
export const deleteAlbum = mutation({
	args: {
		id: v.id("geniusAlbums"),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);

		// Delete all songs for this album
		const songs = await ctx.db
			.query("geniusSongs")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.id))
			.collect();

		for (const song of songs) {
			await ctx.db.delete(song._id);
		}

		// Delete the album
		await ctx.db.delete(args.id);

		return { success: true };
	},
});

/**
 * Scrape and store album from Genius URL
 * This is an action that fetches external data and stores it via mutations
 */
export const scrapeAndStoreAlbum = action({
	args: {
		geniusSongUrl: v.string(),
	},
	handler: async (ctx, args) => {
		// Validate URL is from Genius
		if (!args.geniusSongUrl.includes("genius.com")) {
			throw new Error("URL must be from genius.com");
		}

		console.log("Fetching initial song page:", args.geniusSongUrl);

		// Headers to make the request look like a legitimate browser
		const headers = {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			"Accept-Language": "en-US,en;q=0.9",
			"Accept-Encoding": "gzip, deflate, br",
			Referer: "https://www.google.com/",
			DNT: "1",
			Connection: "keep-alive",
			"Upgrade-Insecure-Requests": "1",
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "cross-site",
			"Sec-Fetch-User": "?1",
			"Sec-Ch-Ua":
				'"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
			"Sec-Ch-Ua-Mobile": "?0",
			"Sec-Ch-Ua-Platform": '"macOS"',
			"Cache-Control": "max-age=0",
		};

		// Fetch the initial song page
		const initialResponse = await fetch(args.geniusSongUrl, { headers });
		if (!initialResponse.ok) {
			console.error("Failed to fetch song page");
			console.error("Status:", initialResponse.status);
			console.error("Status Text:", initialResponse.statusText);
			console.error("URL:", args.geniusSongUrl);

			// Try to get response body for more details
			try {
				const errorBody = await initialResponse.text();
				console.error(
					"Response body (first 500 chars):",
					errorBody.substring(0, 500),
				);
			} catch (e) {
				console.error("Could not read error response body");
			}

			throw new Error(
				`Failed to fetch song page: ${initialResponse.status} ${initialResponse.statusText}`,
			);
		}

		const initialHtml = await initialResponse.text();

		// Extract album metadata
		const metadata = extractAlbumMetadata(initialHtml);
		if (!metadata) {
			throw new Error("Could not extract album metadata from page");
		}

		console.log("Found album:", metadata.albumTitle, "by", metadata.artistName);

		// Fetch the album page to get full tracklist
		let albumHtml = initialHtml;
		let tracklistUrls = extractAlbumTracklist(initialHtml);

		// If no tracklist found on song page, fetch album page
		if (tracklistUrls.length === 0 && metadata.albumUrl) {
			console.log("Fetching album page for tracklist:", metadata.albumUrl);
			const albumResponse = await fetch(metadata.albumUrl, { headers });
			if (albumResponse.ok) {
				albumHtml = await albumResponse.text();
				tracklistUrls = extractAlbumTracklist(albumHtml);
			}
		}

		if (tracklistUrls.length === 0) {
			throw new Error("Could not find any songs in album tracklist");
		}

		console.log(`Found ${tracklistUrls.length} songs in tracklist`);

		// Generate album slug
		const albumSlug = slugify(`${metadata.artistName} ${metadata.albumTitle}`);

		// Create or update album record
		const albumId = await ctx.runMutation(api.geniusAlbums.createAlbum, {
			albumTitle: metadata.albumTitle,
			artistName: metadata.artistName,
			albumSlug,
			geniusAlbumUrl: metadata.albumUrl,
			totalSongs: tracklistUrls.length,
		});

		// Delete existing songs for this album (if updating)
		const existingSongs = await ctx.runQuery(
			api.geniusAlbums.getSongsByAlbumId,
			{
				albumId,
			},
		);

		for (const song of existingSongs) {
			await ctx.runMutation(api.geniusAlbums.deleteSong, {
				id: song._id,
			});
		}

		// Fetch and process each song
		for (let i = 0; i < tracklistUrls.length; i++) {
			const songUrl = tracklistUrls[i];
			if (!songUrl) continue;

			const trackNumber = i + 1;

			console.log(
				`Fetching song ${trackNumber}/${tracklistUrls.length}:`,
				songUrl,
			);

			try {
				// Add small delay to be respectful to Genius servers
				if (i > 0) {
					await new Promise((resolve) => setTimeout(resolve, 500));
				}

				const songResponse = await fetch(songUrl, { headers });
				if (!songResponse.ok) {
					console.warn(
						`Failed to fetch song ${trackNumber}: ${songResponse.status}`,
					);
					continue;
				}

				const songHtml = await songResponse.text();

				// Extract song data
				const songTitle = extractSongTitle(songHtml);
				const lyrics = extractLyrics(songHtml);
				const about = extractAbout(songHtml);

				if (!songTitle) {
					console.warn(`Could not extract title for song ${trackNumber}`);
					continue;
				}

				// Store song (instrumentals / unavailable lyrics still get a page)
				await ctx.runMutation(api.geniusAlbums.createSong, {
					albumId,
					songTitle,
					geniusSongUrl: songUrl || "",
					trackNumber,
					lyrics: lyrics ?? "",
					about,
				});

				console.log(`Stored song ${trackNumber}: ${songTitle}`);
			} catch (error) {
				console.error(`Error processing song ${trackNumber}:`, error);
				// Continue with next song
			}
		}

		console.log("Album scraping complete!");

		return {
			success: true,
			albumSlug,
			totalSongs: tracklistUrls.length,
		};
	},
});

/**
 * Get songs by album ID (helper for deletion)
 */
export const getSongsByAlbumId = query({
	args: {
		albumId: v.id("geniusAlbums"),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db
			.query("geniusSongs")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
			.collect();
	},
});

/**
 * Delete a single song
 */
export const deleteSong = mutation({
	args: {
		id: v.id("geniusSongs"),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		await ctx.db.delete(args.id);
		return { success: true };
	},
});

async function resolveAlbumCoverImageUrl(
	ctx: Pick<QueryCtx | MutationCtx, "storage">,
	album: {
		zineCoverImageStorageId?: Id<"_storage">;
		zineCoverImageUrl?: string;
	},
): Promise<string | undefined> {
	if (album.zineCoverImageStorageId) {
		return (
			(await ctx.storage.getUrl(album.zineCoverImageStorageId)) ?? undefined
		);
	}

	return album.zineCoverImageUrl;
}

export const generateZineCoverUploadUrl = mutation({
	args: {},
	returns: v.string(),
	handler: async (ctx) => {
		requireAuth(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

export const updateZineCoverImage = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		coverImageUrl: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
	},
	returns: v.object({ coverImageUrl: v.optional(v.string()) }),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");
		const now = Date.now();

		if (args.storageId !== undefined) {
			if (
				album.zineCoverImageStorageId &&
				album.zineCoverImageStorageId !== args.storageId
			) {
				await ctx.storage.delete(album.zineCoverImageStorageId);
			}
			await ctx.db.patch(args.albumId, {
				zineCoverImageStorageId: args.storageId,
				zineCoverImageUrl: undefined,
				updatedAt: now,
			});
			return {
				coverImageUrl: (await ctx.storage.getUrl(args.storageId)) ?? undefined,
			};
		}

		if (args.coverImageUrl !== undefined) {
			if (album.zineCoverImageStorageId) {
				await ctx.storage.delete(album.zineCoverImageStorageId);
			}
			const trimmed = args.coverImageUrl.trim();
			const normalized = trimmed.length > 0 ? trimmed : undefined;
			await ctx.db.patch(args.albumId, {
				zineCoverImageUrl: normalized,
				zineCoverImageStorageId: undefined,
				updatedAt: now,
			});
			return { coverImageUrl: normalized };
		}

		throw new Error("No cover image provided");
	},
});

export const updateZineCoverGreyscale = mutation({
	args: { albumId: v.id("geniusAlbums"), greyscale: v.boolean() },
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");
		await ctx.db.patch(args.albumId, {
			zineCoverGreyscale: args.greyscale ? true : undefined,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const updateZineSongSettings = mutation({
	args: {
		songId: v.id("geniusSongs"),
		zineLyricsColumnCount: v.optional(v.union(v.literal(1), v.literal(2))),
		zineLyricsFontSizePt: v.optional(v.number()),
		zineTitleCondenseScale: v.optional(v.number()),
		zineShowCredits: v.optional(v.boolean()),
	},
	returns: v.id("geniusSongs"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		if (
			args.zineLyricsColumnCount === undefined &&
			args.zineLyricsFontSizePt === undefined &&
			args.zineTitleCondenseScale === undefined &&
			args.zineShowCredits === undefined
		) {
			throw new Error("No zine settings provided");
		}
		const song = await ctx.db.get(args.songId);
		if (!song) throw new Error("Song not found");

		const patch: {
			zineLyricsColumnCount?: 1 | 2 | undefined;
			zineLyricsFontSizePt?: number | undefined;
			zineTitleCondenseScale?: number | undefined;
			zineShowCredits?: boolean | undefined;
		} = {};

		if (args.zineLyricsColumnCount !== undefined) {
			patch.zineLyricsColumnCount =
				args.zineLyricsColumnCount === 2 ? undefined : 1;
		}
		if (args.zineLyricsFontSizePt !== undefined) {
			const rounded = Math.round(args.zineLyricsFontSizePt * 2) / 2;
			patch.zineLyricsFontSizePt = rounded === 9 ? undefined : rounded;
		}
		if (args.zineTitleCondenseScale !== undefined) {
			const rounded = Math.round(args.zineTitleCondenseScale * 100) / 100;
			patch.zineTitleCondenseScale = rounded === 1 ? undefined : rounded;
		}
		if (args.zineShowCredits !== undefined) {
			patch.zineShowCredits = args.zineShowCredits ? undefined : false;
		}

		await ctx.db.patch(args.songId, patch);
		return args.songId;
	},
});

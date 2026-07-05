import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	artistKeysIntersect,
	buildArtistKeys,
	normalizeAlbumTitle,
} from "./_utils/albumMatchingCore";
import { buildAlbumSongRecordInput } from "./_utils/geniusAlbumLyrics";
import {
	syncGeniusAlbumTrackDurationsFromSpotify,
	type SyncTrackDurationsResult,
} from "./_utils/geniusSpotifyTrackDurations";
import { zineCoverTextLayoutMutationValidator } from "./_utils/zineCoverTextLayout";
import {
	applyHideCreditLabel,
	applyShowCreditLabel,
	normalizeCreditLabelList,
} from "./_utils/geniusCreditVisibility";
import {
	extractAbout,
	extractAlbumMetadata,
	extractAlbumTracklistItems,
	extractCredits,
	extractLyrics,
	extractSongTitle,
	slugify,
} from "./_utils/geniusParser";
import { getSiteWideHiddenCreditLabelKeys, getIgnoredCreditLabelKeys } from "./geniusCreditLabels";
import { requireAuth } from "./auth";

const geniusCreditValidator = v.object({
	label: v.string(),
	contributors: v.array(
		v.object({
			name: v.string(),
			url: v.optional(v.string()),
		}),
	),
});

const spotifyAlbumMatchMethodValidator = v.union(
	v.literal("spotify_id"),
	v.literal("title_artist"),
	v.literal("manual"),
);

const spotifyAlbumMappingResultValidator = v.object({
	matched: v.boolean(),
	reason: v.string(),
	spotifyAlbumId: v.optional(v.string()),
	spotifyAlbumConvexId: v.optional(v.id("spotifyAlbums")),
	durationsUpdatedCount: v.optional(v.number()),
	matchedSongs: v.optional(
		v.array(
			v.object({
				songId: v.id("geniusSongs"),
				durationSeconds: v.number(),
			}),
		),
	),
});

const syncTrackDurationsResultValidator = v.object({
	updatedCount: v.number(),
	skippedCount: v.number(),
	unmatchedCount: v.number(),
	reason: v.string(),
	updatedSongs: v.array(
		v.object({
			songId: v.id("geniusSongs"),
			durationSeconds: v.number(),
		}),
	),
	matchedSongs: v.array(
		v.object({
			songId: v.id("geniusSongs"),
			durationSeconds: v.number(),
		}),
	),
});

type SpotifyAlbumMatchMethod = "spotify_id" | "title_artist" | "manual";

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

export const listPublicRecent = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
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
		return await getAlbumBySlugWithSongs(ctx, args.slug);
	},
});

export const getPublicAlbumBySlug = query({
	args: {
		slug: v.string(),
	},
	handler: async (ctx, args) => {
		return await getAlbumBySlugWithSongs(ctx, args.slug);
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
		credits: v.optional(v.array(geniusCreditValidator)),
		scrapeState: v.optional(v.union(v.literal("ready"), v.literal("failed"))),
		scrapeError: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const now = Date.now();

		const existingSongs = await ctx.db
			.query("geniusSongs")
			.withIndex("by_albumId", (q) => q.eq("albumId", args.albumId))
			.collect();
		const existingSong = existingSongs.find(
			(song) => song.trackNumber === args.trackNumber,
		);

		if (existingSong) {
			await ctx.db.patch(existingSong._id, {
				songTitle: args.songTitle,
				geniusSongUrl: args.geniusSongUrl,
				trackNumber: args.trackNumber,
				lyrics: args.lyrics,
				about: args.about,
				credits: args.credits,
				scrapeState: args.scrapeState,
				scrapeError: args.scrapeError,
			});
			return existingSong._id;
		}

		return await ctx.db.insert("geniusSongs", {
			albumId: args.albumId,
			songTitle: args.songTitle,
			geniusSongUrl: args.geniusSongUrl,
			trackNumber: args.trackNumber,
			lyrics: args.lyrics,
			about: args.about,
			credits: args.credits,
			scrapeState: args.scrapeState,
			scrapeError: args.scrapeError,
			createdAt: now,
		});
	},
});

export const updateAlbumOverrides = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		albumTitleOverride: v.optional(v.string()),
		artistNameOverride: v.optional(v.string()),
		summaryOverride: v.optional(v.string()),
		frontPageImageUrlOverride: v.optional(v.string()),
		introPageContent: v.optional(v.string()),
	},
	returns: v.id("geniusAlbums"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		await ctx.db.patch(args.albumId, {
			albumTitleOverride: normalizeOptionalString(args.albumTitleOverride),
			artistNameOverride: normalizeOptionalString(args.artistNameOverride),
			summaryOverride: normalizeOptionalString(args.summaryOverride),
			frontPageImageUrlOverride: normalizeOptionalString(
				args.frontPageImageUrlOverride,
			),
			introPageContent: normalizeOptionalString(args.introPageContent),
			updatedAt: Date.now(),
		});

		return args.albumId;
	},
});

export const updateZineIntroSettings = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		zineIntroParagraphSpacingPt: v.optional(v.number()),
		zineIntroMarginPt: v.optional(v.number()),
		zineIntroVerticalAlign: v.optional(
			v.union(v.literal("top"), v.literal("center")),
		),
		zineIntroFontSizePt: v.optional(v.number()),
	},
	returns: v.id("geniusAlbums"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		await ctx.db.patch(args.albumId, {
			zineIntroParagraphSpacingPt: args.zineIntroParagraphSpacingPt,
			zineIntroMarginPt: args.zineIntroMarginPt,
			zineIntroVerticalAlign: args.zineIntroVerticalAlign,
			zineIntroFontSizePt: args.zineIntroFontSizePt,
			updatedAt: Date.now(),
		});

		return args.albumId;
	},
});

export const updateZineCoverTextLayout = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		layout: zineCoverTextLayoutMutationValidator,
	},
	returns: v.id("geniusAlbums"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		await ctx.db.patch(args.albumId, {
			zineCoverTextAnchor: args.layout.anchor,
			zineCoverTextAlign: args.layout.textAlign,
			zineCoverTextOffsetXIn: args.layout.offsetXIn,
			zineCoverTextOffsetYIn: args.layout.offsetYIn,
			updatedAt: Date.now(),
		});

		return args.albumId;
	},
});

const zineDisplaySettingsMutationValidator = v.object({
	showArtist: v.boolean(),
	showAlbum: v.boolean(),
	showYear: v.boolean(),
	showAlbumArt: v.boolean(),
	showIntro: v.boolean(),
	showGeniusInfo: v.boolean(),
	showSectionLabels: v.boolean(),
	showUserNote: v.boolean(),
});

export const updateZineDisplaySettings = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		settings: zineDisplaySettingsMutationValidator,
	},
	returns: v.id("geniusAlbums"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		await ctx.db.patch(args.albumId, {
			zineDisplaySettings: args.settings,
			updatedAt: Date.now(),
		});

		return args.albumId;
	},
});

export const updateSongOverrides = mutation({
	args: {
		songId: v.id("geniusSongs"),
		songTitleOverride: v.optional(v.string()),
		lyricsOverride: v.optional(v.string()),
		aboutOverride: v.optional(v.string()),
		durationSecondsOverride: v.optional(v.union(v.number(), v.null())),
		hiddenCreditLabels: v.optional(v.array(v.string())),
		shownCreditLabels: v.optional(v.array(v.string())),
	},
	returns: v.id("geniusSongs"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const song = await ctx.db.get(args.songId);
		if (!song) throw new Error("Song not found");

		await ctx.db.patch(args.songId, {
			songTitleOverride: normalizeOptionalString(args.songTitleOverride),
			lyricsOverride: normalizeOptionalString(args.lyricsOverride),
			aboutOverride: normalizeOptionalString(args.aboutOverride),
			durationSecondsOverride:
				args.durationSecondsOverride === null
					? undefined
					: args.durationSecondsOverride,
			hiddenCreditLabels: normalizeCreditLabelList(args.hiddenCreditLabels),
			shownCreditLabels: normalizeCreditLabelList(args.shownCreditLabels),
		});

		return args.songId;
	},
});

export const hideSongCreditLabel = mutation({
	args: {
		songId: v.id("geniusSongs"),
		label: v.string(),
	},
	returns: v.id("geniusSongs"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const song = await ctx.db.get(args.songId);
		if (!song) throw new Error("Song not found");

		const siteWideHiddenLabelKeys = await getSiteWideHiddenCreditLabelKeys(ctx);
		const next = applyHideCreditLabel(
			{
				hiddenCreditLabels: song.hiddenCreditLabels,
				shownCreditLabels: song.shownCreditLabels,
				siteWideHiddenLabelKeys,
			},
			args.label,
		);

		await ctx.db.patch(args.songId, next);
		return args.songId;
	},
});

export const showSongCreditLabel = mutation({
	args: {
		songId: v.id("geniusSongs"),
		label: v.string(),
	},
	returns: v.id("geniusSongs"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const song = await ctx.db.get(args.songId);
		if (!song) throw new Error("Song not found");

		const siteWideHiddenLabelKeys = await getSiteWideHiddenCreditLabelKeys(ctx);
		const next = applyShowCreditLabel(
			{
				hiddenCreditLabels: song.hiddenCreditLabels,
				shownCreditLabels: song.shownCreditLabels,
				siteWideHiddenLabelKeys,
			},
			args.label,
		);

		await ctx.db.patch(args.songId, next);
		return args.songId;
	},
});

const spotifyAlbumSearchRowValidator = v.object({
	albumId: v.id("spotifyAlbums"),
	spotifyAlbumId: v.string(),
	name: v.string(),
	artistName: v.string(),
	imageUrl: v.optional(v.string()),
	releaseDate: v.optional(v.string()),
});

export const searchSpotifyAlbumsForMapping = query({
	args: {
		search: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	returns: v.array(spotifyAlbumSearchRowValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);

		const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
		const searchTerm = args.search?.trim() ?? "";

		const albums = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_createdAt")
			.order("desc")
			.take(500);

		const results: Array<{
			albumId: Id<"spotifyAlbums">;
			spotifyAlbumId: string;
			name: string;
			artistName: string;
			imageUrl?: string;
			releaseDate?: string;
		}> = [];

		for (const album of albums) {
			if (!spotifyAlbumMatchesSearch(album, searchTerm)) {
				continue;
			}
			results.push({
				albumId: album._id,
				spotifyAlbumId: album.spotifyAlbumId,
				name: album.name,
				artistName: album.artistName,
				...(album.imageUrl ? { imageUrl: album.imageUrl } : {}),
				...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
			});
			if (results.length >= limit) {
				break;
			}
		}

		return results;
	},
});

export const autoMatchSpotifyAlbum = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
	},
	returns: spotifyAlbumMappingResultValidator,
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		const albumTitle =
			normalizeOptionalString(album.albumTitleOverride) ?? album.albumTitle;
		const artistName =
			normalizeOptionalString(album.artistNameOverride) ?? album.artistName;
		const albumTitleKey = normalizeAlbumTitle(albumTitle);
		const artistKeys = buildArtistKeys(splitArtistNames(artistName));

		const candidates = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_albumTitleKey", (q) =>
				q.eq("albumTitleKey", albumTitleKey),
			)
			.collect();
		const matches = candidates.filter((candidate) =>
			artistKeysIntersect(artistKeys, buildSpotifyAlbumArtistKeys(candidate)),
		);

		if (matches.length === 0) {
			return {
				matched: false,
				reason: "No Spotify album matched this album title and artist.",
			};
		}

		if (matches.length > 1) {
			return {
				matched: false,
				reason: "Multiple Spotify albums matched this album title and artist.",
			};
		}

		const match = matches[0];
		if (!match) {
			return {
				matched: false,
				reason: "No Spotify album matched this album title and artist.",
			};
		}

		await patchSpotifyAlbumMapping(ctx, {
			albumId: args.albumId,
			spotifyAlbumConvexId: match._id,
			spotifyAlbumId: match.spotifyAlbumId,
			method: "title_artist",
			now: Date.now(),
		});

		const durationSync = await syncGeniusAlbumTrackDurationsFromSpotify(ctx, {
			albumId: args.albumId,
		});

		return {
			matched: true,
			reason: appendDurationSyncToMappingReason(
				"Matched Spotify album by title and artist.",
				durationSync,
			),
			spotifyAlbumId: match.spotifyAlbumId,
			spotifyAlbumConvexId: match._id,
			durationsUpdatedCount: durationSync.updatedCount,
			matchedSongs: durationSync.matchedSongs,
		};
	},
});

export const setSpotifyAlbumMapping = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
		spotifyAlbumId: v.string(),
	},
	returns: spotifyAlbumMappingResultValidator,
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		const spotifyAlbumId = args.spotifyAlbumId.trim();
		const spotifyAlbum = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", spotifyAlbumId),
			)
			.first();

		if (!spotifyAlbum) {
			return {
				matched: false,
				reason: "No local Spotify album found for this Spotify album ID.",
			};
		}

		await patchSpotifyAlbumMapping(ctx, {
			albumId: args.albumId,
			spotifyAlbumConvexId: spotifyAlbum._id,
			spotifyAlbumId: spotifyAlbum.spotifyAlbumId,
			method: "manual",
			now: Date.now(),
		});

		const durationSync = await syncGeniusAlbumTrackDurationsFromSpotify(ctx, {
			albumId: args.albumId,
		});

		return {
			matched: true,
			reason: appendDurationSyncToMappingReason(
				`Mapped to ${spotifyAlbum.name} by ${spotifyAlbum.artistName}.`,
				durationSync,
			),
			spotifyAlbumId: spotifyAlbum.spotifyAlbumId,
			spotifyAlbumConvexId: spotifyAlbum._id,
			durationsUpdatedCount: durationSync.updatedCount,
			matchedSongs: durationSync.matchedSongs,
		};
	},
});

export const syncTrackDurationsFromSpotify = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
	},
	returns: syncTrackDurationsResultValidator,
	handler: async (ctx, args): Promise<SyncTrackDurationsResult> => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		return await syncGeniusAlbumTrackDurationsFromSpotify(ctx, {
			albumId: args.albumId,
		});
	},
});

export const clearSpotifyAlbumMapping = mutation({
	args: {
		albumId: v.id("geniusAlbums"),
	},
	returns: v.id("geniusAlbums"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const album = await ctx.db.get(args.albumId);
		if (!album) throw new Error("Album not found");

		await ctx.db.patch(args.albumId, {
			spotifyAlbumId: undefined,
			spotifyAlbumConvexId: undefined,
			spotifyAlbumMatchMethod: undefined,
			spotifyAlbumMatchedAt: undefined,
			updatedAt: Date.now(),
		});

		return args.albumId;
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
		let tracklistItems = extractAlbumTracklistItems(initialHtml);

		// If no tracklist found on song page, fetch album page
		if (tracklistItems.length === 0 && metadata.albumUrl) {
			console.log("Fetching album page for tracklist:", metadata.albumUrl);
			const albumResponse = await fetch(metadata.albumUrl, { headers });
			if (albumResponse.ok) {
				const albumHtml = await albumResponse.text();
				tracklistItems = extractAlbumTracklistItems(albumHtml);
			}
		}

		if (tracklistItems.length === 0) {
			throw new Error("Could not find any songs in album tracklist");
		}

		console.log(`Found ${tracklistItems.length} songs in tracklist`);

		// Generate album slug
		const albumSlug = slugify(`${metadata.artistName} ${metadata.albumTitle}`);

		// Create or update album record
		const albumId = await ctx.runMutation(api.geniusAlbums.createAlbum, {
			albumTitle: metadata.albumTitle,
			artistName: metadata.artistName,
			albumSlug,
			geniusAlbumUrl: metadata.albumUrl,
			totalSongs: tracklistItems.length,
		});

		// Fetch and process each song
		for (let i = 0; i < tracklistItems.length; i++) {
			const track = tracklistItems[i];
			if (!track) continue;

			console.log(
				`Fetching song ${track.trackNumber}/${tracklistItems.length}:`,
				track.url,
			);

			let songInput = buildAlbumSongRecordInput({ track });

			try {
				// Add small delay to be respectful to Genius servers
				if (i > 0) {
					await new Promise((resolve) => setTimeout(resolve, 500));
				}

				const songResponse = await fetch(track.url, { headers });
				if (!songResponse.ok) {
					throw new Error(
						`Failed to fetch song page: ${songResponse.status} ${songResponse.statusText}`,
					);
				}

				const songHtml = await songResponse.text();

				// Extract song data
				const songTitle = extractSongTitle(songHtml);
				const lyrics = extractLyrics(songHtml);
				const about = extractAbout(songHtml);
				const credits = extractCredits(songHtml);

				if (!songTitle) {
					throw new Error("Could not extract song title");
				}

				songInput = buildAlbumSongRecordInput({
					track,
					scrape: {
						songTitle,
						lyrics,
						about,
						credits,
					},
				});

				console.log(`Prepared song ${track.trackNumber}: ${songTitle}`);
			} catch (error) {
				console.error(`Error processing song ${track.trackNumber}:`, error);
				songInput = buildAlbumSongRecordInput({
					track,
					errorMessage:
						error instanceof Error
							? error.message
							: "Failed to scrape song page",
				});
			}

			await ctx.runMutation(api.geniusAlbums.createSong, {
				albumId,
				...songInput,
			});

			console.log(`Stored song ${track.trackNumber}: ${songInput.songTitle}`);
		}

		console.log("Album scraping complete!");

		return {
			success: true,
			albumSlug,
			totalSongs: tracklistItems.length,
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

async function getAlbumBySlugWithSongs(
	ctx: QueryCtx,
	slug: string,
): Promise<{
	album: Doc<"geniusAlbums"> & { zineCoverImageUrl?: string };
	songs: Doc<"geniusSongs">[];
	siteWideHiddenCreditLabelKeys: string[];
	ignoredCreditLabelKeys: string[];
} | null> {
	const album = await ctx.db
		.query("geniusAlbums")
		.withIndex("by_albumSlug", (q) => q.eq("albumSlug", slug))
		.first();

	if (!album) return null;

	const songs = await ctx.db
		.query("geniusSongs")
		.withIndex("by_albumId", (q) => q.eq("albumId", album._id))
		.collect();

	songs.sort((a, b) => a.trackNumber - b.trackNumber);
	const siteWideHiddenCreditLabelKeys =
		await getSiteWideHiddenCreditLabelKeys(ctx);
	const ignoredCreditLabelKeys = await getIgnoredCreditLabelKeys(ctx);

	return {
		album: {
			...album,
			zineCoverImageUrl: await resolveAlbumCoverImageUrl(ctx, album),
		},
		songs,
		siteWideHiddenCreditLabelKeys,
		ignoredCreditLabelKeys,
	};
}

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

function normalizeOptionalString(
	value: string | undefined,
): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function splitArtistNames(value: string): string[] {
	return value
		.split(/[,&]/)
		.map((artistName) => artistName.trim())
		.filter(Boolean);
}

function spotifyAlbumMatchesSearch(
	album: Doc<"spotifyAlbums">,
	searchTerm: string,
): boolean {
	const term = searchTerm.trim().toLowerCase();
	if (!term) {
		return true;
	}

	const name = album.name.toLowerCase();
	const artistName = album.artistName.toLowerCase();
	return name.includes(term) || artistName.includes(term);
}

function buildSpotifyAlbumArtistKeys(album: Doc<"spotifyAlbums">): string[] {
	const parsedArtistNames = parseSpotifyAlbumArtistNames(album.rawData);
	if (parsedArtistNames.length > 0) {
		return buildArtistKeys(parsedArtistNames);
	}

	return buildArtistKeys(splitArtistNames(album.artistName));
}

function parseSpotifyAlbumArtistNames(rawData: string | undefined): string[] {
	if (!rawData) return [];

	try {
		const parsed = JSON.parse(rawData) as {
			artists?: Array<{ name?: unknown }>;
		};
		return (
			parsed.artists
				?.map((artist) => artist.name)
				.filter((name): name is string => typeof name === "string") ?? []
		);
	} catch {
		return [];
	}
}

async function patchSpotifyAlbumMapping(
	ctx: MutationCtx,
	args: {
		albumId: Id<"geniusAlbums">;
		spotifyAlbumConvexId: Id<"spotifyAlbums">;
		spotifyAlbumId: string;
		method: SpotifyAlbumMatchMethod;
		now: number;
	},
): Promise<void> {
	await ctx.db.patch(args.albumId, {
		spotifyAlbumConvexId: args.spotifyAlbumConvexId,
		spotifyAlbumId: args.spotifyAlbumId,
		spotifyAlbumMatchMethod: args.method,
		spotifyAlbumMatchedAt: args.now,
		updatedAt: args.now,
	});
}

function appendDurationSyncToMappingReason(
	baseReason: string,
	durationSync: SyncTrackDurationsResult,
): string {
	if (durationSync.updatedCount === 0) {
		return baseReason;
	}

	const trackLabel = durationSync.updatedCount === 1 ? "track" : "tracks";
	return `${baseReason} Updated track times for ${durationSync.updatedCount} ${trackLabel}.`;
}

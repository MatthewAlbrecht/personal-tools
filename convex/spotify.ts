import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// Connection Management
// ============================================================================

export const upsertConnection = mutation({
	args: {
		userId: v.string(),
		accessToken: v.string(),
		refreshToken: v.string(),
		expiresIn: v.number(),
		spotifyUserId: v.string(),
		displayName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const expiresAt = now + args.expiresIn * 1000;

		const existing = await ctx.db
			.query("spotifyConnections")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				accessToken: args.accessToken,
				refreshToken: args.refreshToken,
				expiresAt,
				spotifyUserId: args.spotifyUserId,
				displayName: args.displayName,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("spotifyConnections", {
			userId: args.userId,
			accessToken: args.accessToken,
			refreshToken: args.refreshToken,
			expiresAt,
			spotifyUserId: args.spotifyUserId,
			displayName: args.displayName,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const getConnection = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyConnections")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();
	},
});

export const updateTokens = mutation({
	args: {
		userId: v.string(),
		accessToken: v.string(),
		expiresIn: v.number(),
		refreshToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const connection = await ctx.db
			.query("spotifyConnections")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();

		if (!connection) {
			throw new Error("No Spotify connection found");
		}

		const now = Date.now();
		const expiresAt = now + args.expiresIn * 1000;

		await ctx.db.patch(connection._id, {
			accessToken: args.accessToken,
			expiresAt,
			...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
			updatedAt: now,
		});
	},
});

export const deleteConnection = mutation({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const connection = await ctx.db
			.query("spotifyConnections")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();

		if (connection) {
			await ctx.db.delete(connection._id);
		}
	},
});

// ============================================================================
// Playlist Management
// ============================================================================

export const upsertPlaylist = mutation({
	args: {
		userId: v.string(),
		spotifyPlaylistId: v.string(),
		name: v.string(),
		description: v.string(),
		userNotes: v.optional(v.string()),
		imageUrl: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const existing = await ctx.db
			.query("spotifyPlaylists")
			.withIndex("by_spotifyPlaylistId", (q) =>
				q.eq("spotifyPlaylistId", args.spotifyPlaylistId),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: args.name,
				description: args.description,
				userNotes: args.userNotes,
				imageUrl: args.imageUrl,
				isActive: args.isActive ?? existing.isActive,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("spotifyPlaylists", {
			userId: args.userId,
			spotifyPlaylistId: args.spotifyPlaylistId,
			name: args.name,
			description: args.description,
			userNotes: args.userNotes,
			imageUrl: args.imageUrl,
			isActive: args.isActive ?? true,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const getPlaylists = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyPlaylists")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();
	},
});

export const getActivePlaylists = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyPlaylists")
			.withIndex("by_userId_active", (q) =>
				q.eq("userId", args.userId).eq("isActive", true),
			)
			.collect();
	},
});

export const updatePlaylistDescription = mutation({
	args: {
		playlistId: v.id("spotifyPlaylists"),
		description: v.string(),
		userNotes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.playlistId, {
			description: args.description,
			...(args.userNotes !== undefined ? { userNotes: args.userNotes } : {}),
			updatedAt: Date.now(),
		});
	},
});

export const togglePlaylistActive = mutation({
	args: {
		playlistId: v.id("spotifyPlaylists"),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.playlistId, {
			isActive: args.isActive,
			updatedAt: Date.now(),
		});
	},
});

export const deletePlaylist = mutation({
	args: { playlistId: v.id("spotifyPlaylists") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.playlistId);
	},
});

// ============================================================================
// Song Categorization
// ============================================================================

export const saveCategorization = mutation({
	args: {
		userId: v.string(),
		trackId: v.string(),
		trackName: v.string(),
		artistName: v.string(),
		albumName: v.optional(v.string()),
		albumImageUrl: v.optional(v.string()),
		trackData: v.optional(v.string()), // JSON stringified SpotifyTrack
		userInput: v.string(),
		aiSuggestions: v.array(
			v.object({
				playlistId: v.string(),
				playlistName: v.string(),
				confidence: v.string(),
				reason: v.string(),
			}),
		),
		finalSelections: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Check if this track was already categorized (for re-categorization)
		const existing = await ctx.db
			.query("spotifySongCategorizations")
			.withIndex("by_trackId", (q) => q.eq("trackId", args.trackId))
			.first();

		let categorizationId;
		if (existing) {
			// Update existing categorization
			await ctx.db.patch(existing._id, {
				userInput: args.userInput,
				aiSuggestions: args.aiSuggestions,
				finalSelections: args.finalSelections,
				trackData: args.trackData,
			});
			categorizationId = existing._id;
		} else {
			categorizationId = await ctx.db.insert("spotifySongCategorizations", {
				userId: args.userId,
				trackId: args.trackId,
				trackName: args.trackName,
				artistName: args.artistName,
				albumName: args.albumName,
				albumImageUrl: args.albumImageUrl,
				trackData: args.trackData,
				userInput: args.userInput,
				aiSuggestions: args.aiSuggestions,
				finalSelections: args.finalSelections,
				createdAt: now,
			});
		}

		// Also update lastCategorizedAt on the spotifyTracks row
		const existingTrack = await ctx.db
			.query("spotifyTracks")
			.withIndex("by_userId_trackId", (q) =>
				q.eq("userId", args.userId).eq("trackId", args.trackId),
			)
			.first();

		if (existingTrack) {
			await ctx.db.patch(existingTrack._id, {
				lastCategorizedAt: now,
			});
		} else {
			// Create a new spotifyTracks row if it doesn't exist
			await ctx.db.insert("spotifyTracks", {
				userId: args.userId,
				trackId: args.trackId,
				trackName: args.trackName,
				artistName: args.artistName,
				albumName: args.albumName,
				albumImageUrl: args.albumImageUrl,
				trackData: args.trackData,
				firstSeenAt: now,
				lastSeenAt: now,
				lastCategorizedAt: now,
			});
		}

		return categorizationId;
	},
});

export const getCategorizations = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const baseQuery = ctx.db
			.query("spotifySongCategorizations")
			.withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
			.order("desc");

		if (args.limit) {
			return await baseQuery.take(args.limit);
		}

		return await baseQuery.collect();
	},
});

export const getCategorizationByTrack = query({
	args: {
		trackId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifySongCategorizations")
			.withIndex("by_trackId", (q) => q.eq("trackId", args.trackId))
			.first();
	},
});

export const searchCategorizations = query({
	args: {
		userId: v.string(),
		searchTerm: v.string(),
	},
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("spotifySongCategorizations")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		const term = args.searchTerm.toLowerCase();
		return all.filter(
			(cat) =>
				cat.userInput.toLowerCase().includes(term) ||
				cat.trackName.toLowerCase().includes(term) ||
				cat.artistName.toLowerCase().includes(term),
		);
	},
});

// ============================================================================
// Spotify Tracks (Unified track storage)
// ============================================================================

export const upsertTracksFromRecentlyPlayed = mutation({
	args: {
		userId: v.string(),
		items: v.array(
			v.object({
				trackId: v.string(),
				trackName: v.string(),
				artistName: v.string(),
				albumName: v.optional(v.string()),
				albumImageUrl: v.optional(v.string()),
				spotifyAlbumId: v.optional(v.string()),
				trackData: v.optional(v.string()),
				playedAt: v.number(), // Unix timestamp from Spotify played_at
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		for (const item of args.items) {
			const existing = await ctx.db
				.query("spotifyTracks")
				.withIndex("by_userId_trackId", (q) =>
					q.eq("userId", args.userId).eq("trackId", item.trackId),
				)
				.first();

			if (existing) {
				// Update timestamps - only advance if newer
				const newLastPlayedAt = Math.max(
					existing.lastPlayedAt ?? 0,
					item.playedAt,
				);
				const newLastSeenAt = Math.max(
					existing.lastSeenAt,
					newLastPlayedAt,
					existing.lastLikedAt ?? 0,
				);

				await ctx.db.patch(existing._id, {
					trackName: item.trackName,
					artistName: item.artistName,
					albumName: item.albumName,
					albumImageUrl: item.albumImageUrl,
					spotifyAlbumId: item.spotifyAlbumId,
					trackData: item.trackData,
					lastPlayedAt: newLastPlayedAt,
					lastSeenAt: newLastSeenAt,
				});
			} else {
				// Insert new track
				await ctx.db.insert("spotifyTracks", {
					userId: args.userId,
					trackId: item.trackId,
					trackName: item.trackName,
					artistName: item.artistName,
					albumName: item.albumName,
					albumImageUrl: item.albumImageUrl,
					spotifyAlbumId: item.spotifyAlbumId,
					trackData: item.trackData,
					firstSeenAt: now,
					lastSeenAt: item.playedAt,
					lastPlayedAt: item.playedAt,
				});
			}
		}
	},
});

export const upsertTracksFromLiked = mutation({
	args: {
		userId: v.string(),
		items: v.array(
			v.object({
				trackId: v.string(),
				trackName: v.string(),
				artistName: v.string(),
				albumName: v.optional(v.string()),
				albumImageUrl: v.optional(v.string()),
				spotifyAlbumId: v.optional(v.string()),
				trackData: v.optional(v.string()),
				addedAt: v.number(), // Unix timestamp from Spotify added_at
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		for (const item of args.items) {
			const existing = await ctx.db
				.query("spotifyTracks")
				.withIndex("by_userId_trackId", (q) =>
					q.eq("userId", args.userId).eq("trackId", item.trackId),
				)
				.first();

			if (existing) {
				// Update timestamps - only advance if newer
				const newLastLikedAt = Math.max(
					existing.lastLikedAt ?? 0,
					item.addedAt,
				);
				const newLastSeenAt = Math.max(
					existing.lastSeenAt,
					newLastLikedAt,
					existing.lastPlayedAt ?? 0,
				);

				await ctx.db.patch(existing._id, {
					trackName: item.trackName,
					artistName: item.artistName,
					albumName: item.albumName,
					albumImageUrl: item.albumImageUrl,
					spotifyAlbumId: item.spotifyAlbumId,
					trackData: item.trackData,
					lastLikedAt: newLastLikedAt,
					lastSeenAt: newLastSeenAt,
				});
			} else {
				// Insert new track
				await ctx.db.insert("spotifyTracks", {
					userId: args.userId,
					trackId: item.trackId,
					trackName: item.trackName,
					artistName: item.artistName,
					albumName: item.albumName,
					albumImageUrl: item.albumImageUrl,
					spotifyAlbumId: item.spotifyAlbumId,
					trackData: item.trackData,
					firstSeenAt: now,
					lastSeenAt: item.addedAt,
					lastLikedAt: item.addedAt,
				});
			}
		}
	},
});

export const getRecentlyPlayedTracks = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 200;

		// Query tracks with lastPlayedAt, ordered by most recent using the index
		const tracks = await ctx.db
			.query("spotifyTracks")
			.withIndex("by_userId_lastPlayedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();

		// Filter out tracks without lastPlayedAt and apply limit
		const filteredTracks = tracks
			.filter((track) => track.lastPlayedAt !== undefined)
			.slice(0, limit);

		// Get unique album IDs to batch fetch release dates
		const albumIds = [
			...new Set(
				filteredTracks
					.map((t) => t.spotifyAlbumId)
					.filter((id): id is string => !!id),
			),
		];

		// Batch fetch albums
		const albums = await Promise.all(
			albumIds.map((id) =>
				ctx.db
					.query("spotifyAlbums")
					.withIndex("by_spotifyAlbumId", (q) => q.eq("spotifyAlbumId", id))
					.first(),
			),
		);

		// Create a map of albumId -> releaseDate
		const albumReleaseDates = new Map<string, string | undefined>();
		for (const album of albums) {
			if (album) {
				albumReleaseDates.set(album.spotifyAlbumId, album.releaseDate);
			}
		}

		// Enrich tracks with releaseDate
		return filteredTracks.map((track) => ({
			...track,
			releaseDate: track.spotifyAlbumId
				? albumReleaseDates.get(track.spotifyAlbumId)
				: undefined,
		}));
	},
});

export const getLikedTracksHistory = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Get all tracks for user with lastLikedAt, then sort client-side
		const tracks = await ctx.db
			.query("spotifyTracks")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		// Filter to only tracks with lastLikedAt and sort by it descending
		const filtered = tracks
			.filter((t) => t.lastLikedAt !== undefined)
			.sort((a, b) => (b.lastLikedAt ?? 0) - (a.lastLikedAt ?? 0));

		if (args.limit) {
			return filtered.slice(0, args.limit);
		}
		return filtered;
	},
});

export const getTrackByUserAndTrackId = query({
	args: {
		userId: v.string(),
		trackId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyTracks")
			.withIndex("by_userId_trackId", (q) =>
				q.eq("userId", args.userId).eq("trackId", args.trackId),
			)
			.first();
	},
});

// ============================================================================
// Pending Suggestions (saved before confirmation)
// ============================================================================

export const savePendingSuggestions = mutation({
	args: {
		userId: v.string(),
		trackId: v.string(),
		userInput: v.string(),
		suggestions: v.array(
			v.object({
				playlistId: v.string(),
				playlistName: v.string(),
				confidence: v.string(),
				reason: v.string(),
			}),
		),
	},
	handler: async (ctx, args) => {
		// Check if pending suggestions already exist for this track
		const existing = await ctx.db
			.query("spotifyPendingSuggestions")
			.withIndex("by_trackId", (q) => q.eq("trackId", args.trackId))
			.first();

		if (existing) {
			// Update existing record
			await ctx.db.patch(existing._id, {
				userId: args.userId,
				userInput: args.userInput,
				suggestions: args.suggestions,
				createdAt: Date.now(),
			});
			return existing._id;
		}

		// Create new record
		return await ctx.db.insert("spotifyPendingSuggestions", {
			userId: args.userId,
			trackId: args.trackId,
			userInput: args.userInput,
			suggestions: args.suggestions,
			createdAt: Date.now(),
		});
	},
});

export const getPendingSuggestions = query({
	args: {
		trackId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyPendingSuggestions")
			.withIndex("by_trackId", (q) => q.eq("trackId", args.trackId))
			.first();
	},
});

export const clearPendingSuggestions = mutation({
	args: {
		trackId: v.string(),
	},
	handler: async (ctx, args) => {
		const pending = await ctx.db
			.query("spotifyPendingSuggestions")
			.withIndex("by_trackId", (q) => q.eq("trackId", args.trackId))
			.first();

		if (pending) {
			await ctx.db.delete(pending._id);
		}
	},
});

// ============================================================================
// Sync Logs (for replay/debugging)
// ============================================================================

export const createSyncLog = mutation({
	args: {
		userId: v.string(),
		syncType: v.string(),
		rawResponse: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("spotifySyncLogs", {
			userId: args.userId,
			syncType: args.syncType,
			rawResponse: args.rawResponse,
			status: "pending",
			createdAt: Date.now(),
		});
	},
});

export const updateSyncLogStatus = mutation({
	args: {
		syncLogId: v.id("spotifySyncLogs"),
		status: v.string(),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.syncLogId, {
			status: args.status,
			processedAt: Date.now(),
			...(args.error ? { error: args.error } : {}),
		});
	},
});

export const getPendingSyncLogs = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("spotifySyncLogs")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect();
	},
});

// ============================================================================
// Sync Runs (detailed stats for each sync)
// ============================================================================

export const saveSyncRun = mutation({
	args: {
		userId: v.string(),
		source: v.string(),
		status: v.string(),
		startedAt: v.number(),
		completedAt: v.number(),
		durationMs: v.number(),
		error: v.optional(v.string()),
		tracksFromApi: v.number(),
		uniqueTracksFromApi: v.number(),
		newTracksAdded: v.number(),
		existingTracksUpdated: v.number(),
		uniqueAlbumsFromApi: v.number(),
		albumsAlreadyInDb: v.number(),
		newAlbumsDiscovered: v.number(),
		albumsFetchFailed: v.number(),
		albumsCheckedForListens: v.number(),
		albumListensRecorded: v.number(),
		tracksBackfilledFromAlbums: v.number(),
		newAlbumNames: v.optional(v.array(v.string())),
		recordedListenAlbumNames: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("spotifySyncRuns", args);
	},
});

export const getRecentSyncRuns = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const runs = await ctx.db
			.query("spotifySyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();

		if (args.limit) {
			return runs.slice(0, args.limit);
		}
		return runs;
	},
});

export const getAllConnections = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("spotifyConnections").collect();
	},
});

// ============================================================================
// Album Management
// ============================================================================

export const upsertAlbum = mutation({
	args: {
		spotifyAlbumId: v.string(),
		name: v.string(),
		artistName: v.string(),
		imageUrl: v.optional(v.string()),
		releaseDate: v.optional(v.string()),
		totalTracks: v.number(),
		genres: v.optional(v.array(v.string())),
		rawData: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const existing = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: args.name,
				artistName: args.artistName,
				imageUrl: args.imageUrl,
				releaseDate: args.releaseDate,
				totalTracks: args.totalTracks,
				genres: args.genres,
				rawData: args.rawData,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("spotifyAlbums", {
			spotifyAlbumId: args.spotifyAlbumId,
			name: args.name,
			artistName: args.artistName,
			imageUrl: args.imageUrl,
			releaseDate: args.releaseDate,
			totalTracks: args.totalTracks,
			genres: args.genres,
			rawData: args.rawData,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const getAlbumBySpotifyId = query({
	args: { spotifyAlbumId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.first();
	},
});

export const getAllAlbums = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const query = ctx.db.query("spotifyAlbums").withIndex("by_createdAt");

		const albums = await query.collect();

		// Sort descending (most recent first) and apply limit
		const sorted = albums.sort((a, b) => b.createdAt - a.createdAt);

		if (args.limit) {
			return sorted.slice(0, args.limit);
		}

		return sorted;
	},
});

export const recordAlbumListen = mutation({
	args: {
		userId: v.string(),
		albumId: v.id("spotifyAlbums"),
		trackIds: v.array(v.string()),
		earliestPlayedAt: v.number(),
		latestPlayedAt: v.number(),
		source: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Check for overlapping listens (dedup)
		// Get all listens for this user+album and check for time overlap
		const existingListens = await ctx.db
			.query("userAlbumListens")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("albumId", args.albumId),
			)
			.collect();

		// Check if any existing listen overlaps with the new one
		const hasOverlap = existingListens.some((listen) => {
			// Overlap check: newEarliest <= existingLatest AND newLatest >= existingEarliest
			return (
				args.earliestPlayedAt <= listen.latestPlayedAt &&
				args.latestPlayedAt >= listen.earliestPlayedAt
			);
		});

		if (hasOverlap) {
			return { recorded: false, reason: "overlapping_listen" };
		}

		// Create the listen event
		await ctx.db.insert("userAlbumListens", {
			userId: args.userId,
			albumId: args.albumId,
			listenedAt: now,
			earliestPlayedAt: args.earliestPlayedAt,
			latestPlayedAt: args.latestPlayedAt,
			trackIds: args.trackIds,
			source: args.source,
		});

		// Upsert userAlbums record
		const existingUserAlbum = await ctx.db
			.query("userAlbums")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("albumId", args.albumId),
			)
			.first();

		if (existingUserAlbum) {
			await ctx.db.patch(existingUserAlbum._id, {
				lastListenedAt: now,
				listenCount: existingUserAlbum.listenCount + 1,
			});
		} else {
			await ctx.db.insert("userAlbums", {
				userId: args.userId,
				albumId: args.albumId,
				firstListenedAt: now,
				lastListenedAt: now,
				listenCount: 1,
			});
		}

		return { recorded: true };
	},
});

// Add a manual album listen (from tracks view)
export const addManualAlbumListen = mutation({
	args: {
		userId: v.string(),
		spotifyAlbumId: v.string(),
		listenedAt: v.number(),
	},
	handler: async (ctx, args) => {
		// 1. Find the album in spotifyAlbums by Spotify's album ID
		const album = await ctx.db
			.query("spotifyAlbums")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.first();

		if (!album) {
			throw new Error(
				`Album not found in database: ${args.spotifyAlbumId}. Please ensure album is fetched first.`,
			);
		}

		// 2. Check for duplicate listens at the same timestamp
		const existingListens = await ctx.db
			.query("userAlbumListens")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("albumId", album._id),
			)
			.collect();

		const isDuplicate = existingListens.some(
			(listen) => listen.listenedAt === args.listenedAt,
		);

		if (isDuplicate) {
			return { recorded: false, reason: "duplicate_listen" };
		}

		// 3. Create the listen event
		await ctx.db.insert("userAlbumListens", {
			userId: args.userId,
			albumId: album._id,
			listenedAt: args.listenedAt,
			earliestPlayedAt: args.listenedAt,
			latestPlayedAt: args.listenedAt,
			trackIds: [],
			source: "manual",
		});

		// 4. Upsert userAlbums record
		const existingUserAlbum = await ctx.db
			.query("userAlbums")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("albumId", album._id),
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
				albumId: album._id,
				firstListenedAt: args.listenedAt,
				lastListenedAt: args.listenedAt,
				listenCount: 1,
			});
		}

		return { recorded: true, albumName: album.name };
	},
});

export const getUserAlbums = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userAlbums = await ctx.db
			.query("userAlbums")
			.withIndex("by_userId_lastListenedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();

		// Fetch album details for each userAlbum
		const albumsWithDetails = await Promise.all(
			userAlbums.map(async (ua) => {
				const album = await ctx.db.get(ua.albumId);
				return { ...ua, album };
			}),
		);

		if (args.limit) {
			return albumsWithDetails.slice(0, args.limit);
		}
		return albumsWithDetails;
	},
});

export const getUserAlbumListens = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const listens = await ctx.db
			.query("userAlbumListens")
			.withIndex("by_userId_listenedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();

		// Fetch album details for each listen
		const listensWithDetails = await Promise.all(
			listens.map(async (listen) => {
				const album = await ctx.db.get(listen.albumId);
				return { ...listen, album };
			}),
		);

		if (args.limit) {
			return listensWithDetails.slice(0, args.limit);
		}
		return listensWithDetails;
	},
});

export const deleteAlbumListen = mutation({
	args: {
		listenId: v.id("userAlbumListens"),
	},
	handler: async (ctx, args) => {
		// Get the listen to find the associated userAlbum
		const listen = await ctx.db.get(args.listenId);
		if (!listen) return;

		// Delete the listen
		await ctx.db.delete(args.listenId);

		// Update the userAlbums count
		const userAlbum = await ctx.db
			.query("userAlbums")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", listen.userId).eq("albumId", listen.albumId),
			)
			.first();

		if (userAlbum) {
			const newCount = userAlbum.listenCount - 1;
			if (newCount <= 0) {
				// Delete the userAlbum record if no listens remain
				await ctx.db.delete(userAlbum._id);
			} else {
				// Recalculate first/last listened dates
				const remainingListens = await ctx.db
					.query("userAlbumListens")
					.withIndex("by_userId_albumId", (q) =>
						q.eq("userId", listen.userId).eq("albumId", listen.albumId),
					)
					.collect();

				const timestamps = remainingListens.map((l) => l.listenedAt);
				await ctx.db.patch(userAlbum._id, {
					listenCount: newCount,
					firstListenedAt: Math.min(...timestamps),
					lastListenedAt: Math.max(...timestamps),
				});
			}
		}
	},
});

// Get tracks by album for a user (used for album detection)
export const getTracksByAlbumId = query({
	args: {
		userId: v.string(),
		spotifyAlbumId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyTracks")
			.withIndex("by_userId_albumId", (q) =>
				q.eq("userId", args.userId).eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.collect();
	},
});

// Backfill tracks with album data (used when an album is discovered)
export const backfillTracksFromAlbum = mutation({
	args: {
		userId: v.string(),
		spotifyAlbumId: v.string(),
		albumName: v.string(),
		albumImageUrl: v.optional(v.string()),
		tracks: v.array(
			v.object({
				trackId: v.string(),
				trackName: v.string(),
				artistName: v.string(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		let addedCount = 0;

		for (const track of args.tracks) {
			// Check if track already exists for this user
			const existing = await ctx.db
				.query("spotifyTracks")
				.withIndex("by_userId_trackId", (q) =>
					q.eq("userId", args.userId).eq("trackId", track.trackId),
				)
				.first();

			if (!existing) {
				// Add track without play timestamps (album-sourced)
				await ctx.db.insert("spotifyTracks", {
					userId: args.userId,
					trackId: track.trackId,
					trackName: track.trackName,
					artistName: track.artistName,
					albumName: args.albumName,
					albumImageUrl: args.albumImageUrl,
					spotifyAlbumId: args.spotifyAlbumId,
					firstSeenAt: now,
					lastSeenAt: now,
					// No lastPlayedAt - these are album-sourced, not user-played
				});
				addedCount++;
			} else if (!existing.spotifyAlbumId) {
				// Update existing track with albumId if missing
				await ctx.db.patch(existing._id, {
					spotifyAlbumId: args.spotifyAlbumId,
				});
			}
		}

		return { addedCount };
	},
});

// ============================================================================
// Album Rating
// ============================================================================

export const updateAlbumRating = mutation({
	args: {
		userAlbumId: v.id("userAlbums"),
		rating: v.number(), // 1-10
		position: v.number(), // Float for ordering
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.userAlbumId, {
			rating: args.rating,
			position: args.position,
		});
	},
});

export const getRatedAlbumsForYear = query({
	args: {
		userId: v.string(),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		// Get all user albums with ratings
		const userAlbums = await ctx.db
			.query("userAlbums")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		// Filter to rated albums and fetch album details
		const ratedWithDetails = await Promise.all(
			userAlbums
				.filter((ua) => ua.rating !== undefined)
				.map(async (ua) => {
					const album = await ctx.db.get(ua.albumId);
					return { ...ua, album };
				}),
		);

		// Filter by year (from album releaseDate)
		const filtered = ratedWithDetails.filter((ua) => {
			if (!ua.album?.releaseDate) return false;
			const albumYear = Number.parseInt(
				ua.album.releaseDate.substring(0, 4),
				10,
			);
			return albumYear === args.year;
		});

		// Sort by position (nulls at end), then by rating desc
		return filtered.sort((a, b) => {
			// Both have positions - sort by position
			if (a.position !== undefined && b.position !== undefined) {
				return a.position - b.position;
			}
			// One has position, one doesn't - position first
			if (a.position !== undefined) return -1;
			if (b.position !== undefined) return 1;
			// Neither has position - sort by rating desc
			return (b.rating ?? 0) - (a.rating ?? 0);
		});
	},
});

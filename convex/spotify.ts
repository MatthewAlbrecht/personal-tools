import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

// ============================================================================
// Internal Helpers
// ============================================================================

type CanonicalTrackData = {
	spotifyTrackId: string;
	trackName: string;
	artistName: string;
	albumName?: string;
	albumImageUrl?: string;
	spotifyAlbumId?: string;
	durationMs?: number;
	trackNumber?: number;
	isExplicit?: boolean;
	previewUrl?: string;
	rawData?: string;
};

/**
 * Helper to upsert a canonical track record (internal use only).
 * This creates or updates the global track record in spotifyTracksCanonical.
 * Returns the _id of the canonical track record.
 */
async function upsertCanonicalTrackInternal(
	ctx: MutationCtx,
	data: CanonicalTrackData,
) {
	const now = Date.now();

	const existing = await ctx.db
		.query("spotifyTracksCanonical")
		.withIndex("by_spotifyTrackId", (q) =>
			q.eq("spotifyTrackId", data.spotifyTrackId),
		)
		.first();

	if (existing) {
		await ctx.db.patch(existing._id, {
			trackName: data.trackName,
			artistName: data.artistName,
			albumName: data.albumName,
			albumImageUrl: data.albumImageUrl,
			spotifyAlbumId: data.spotifyAlbumId,
			durationMs: data.durationMs,
			trackNumber: data.trackNumber,
			isExplicit: data.isExplicit,
			previewUrl: data.previewUrl,
			rawData: data.rawData,
			updatedAt: now,
		});
		return existing._id;
	}

	return await ctx.db.insert("spotifyTracksCanonical", {
		spotifyTrackId: data.spotifyTrackId,
		trackName: data.trackName,
		artistName: data.artistName,
		albumName: data.albumName,
		albumImageUrl: data.albumImageUrl,
		spotifyAlbumId: data.spotifyAlbumId,
		durationMs: data.durationMs,
		trackNumber: data.trackNumber,
		isExplicit: data.isExplicit,
		previewUrl: data.previewUrl,
		rawData: data.rawData,
		createdAt: now,
		updatedAt: now,
	});
}

/**
 * Helper to extract additional fields from trackData JSON.
 */
function parseTrackDataFields(trackDataJson?: string) {
	if (!trackDataJson) return {};

	try {
		const trackData = JSON.parse(trackDataJson) as {
			duration_ms?: number;
			track_number?: number;
			explicit?: boolean;
			preview_url?: string | null;
		};
		return {
			durationMs: trackData.duration_ms,
			trackNumber: trackData.track_number,
			isExplicit: trackData.explicit,
			previewUrl: trackData.preview_url ?? undefined,
		};
	} catch {
		return {};
	}
}

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

		// Dual-write: Upsert to canonical table first
		const extraFields = parseTrackDataFields(args.trackData);
		const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
			spotifyTrackId: args.trackId,
			trackName: args.trackName,
			artistName: args.artistName,
			albumName: args.albumName,
			albumImageUrl: args.albumImageUrl,
			rawData: args.trackData,
			...extraFields,
		});

		// Check if this track was already categorized (for re-categorization)
		const existing = await ctx.db
			.query("spotifySongCategorizations")
			.withIndex("by_trackId", (q) => q.eq("trackId", args.trackId))
			.first();

		let categorizationId;
		if (existing) {
			// Update existing categorization
			await ctx.db.patch(existing._id, {
				canonicalTrackId,
				spotifyTrackId: args.trackId,
				userInput: args.userInput,
				aiSuggestions: args.aiSuggestions,
				finalSelections: args.finalSelections,
				trackData: args.trackData,
			});
			categorizationId = existing._id;
		} else {
			categorizationId = await ctx.db.insert("spotifySongCategorizations", {
				userId: args.userId,
				canonicalTrackId,
				spotifyTrackId: args.trackId,
				trackId: args.trackId, // Legacy field
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

		// Write to new userTracks table (normalized)
		const existingUserTrack = await ctx.db
			.query("userTracks")
			.withIndex("by_userId_spotifyTrackId", (q) =>
				q.eq("userId", args.userId).eq("spotifyTrackId", args.trackId),
			)
			.first();

		if (existingUserTrack) {
			await ctx.db.patch(existingUserTrack._id, {
				lastCategorizedAt: now,
				lastSeenAt: Math.max(existingUserTrack.lastSeenAt, now),
			});
		} else {
			await ctx.db.insert("userTracks", {
				userId: args.userId,
				trackId: canonicalTrackId,
				spotifyTrackId: args.trackId,
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

		const categorizations = args.limit
			? await baseQuery.take(args.limit)
			: await baseQuery.collect();

		// Get unique Spotify track IDs for batch fetch (use new field with legacy fallback)
		const spotifyTrackIds = [
			...new Set(
				categorizations
					.map((c) => c.spotifyTrackId ?? c.trackId)
					.filter((id): id is string => id !== undefined),
			),
		];

		// Batch fetch canonical tracks
		const canonicalTracks = await Promise.all(
			spotifyTrackIds.map((id) =>
				ctx.db
					.query("spotifyTracksCanonical")
					.withIndex("by_spotifyTrackId", (q) => q.eq("spotifyTrackId", id))
					.first(),
			),
		);

		// Create a map of spotifyTrackId -> canonical track
		const canonicalTrackMap = new Map<
			string,
			(typeof canonicalTracks)[number]
		>();
		for (const track of canonicalTracks) {
			if (track) {
				canonicalTrackMap.set(track.spotifyTrackId, track);
			}
		}

		// Return categorizations with nested canonical track data
		return categorizations.map((cat) => {
			const trackId = cat.spotifyTrackId ?? cat.trackId ?? "";
			return {
				_id: cat._id,
				userId: cat.userId,
				spotifyTrackId: trackId,
				userInput: cat.userInput,
				aiSuggestions: cat.aiSuggestions,
				finalSelections: cat.finalSelections,
				createdAt: cat.createdAt,
				track: canonicalTrackMap.get(trackId) ?? {
					// Fallback to categorization data if canonical doesn't exist yet
					spotifyTrackId: trackId,
					trackName: cat.trackName ?? "Unknown Track",
					artistName: cat.artistName ?? "Unknown Artist",
					albumName: cat.albumName,
					albumImageUrl: cat.albumImageUrl,
					rawData: cat.trackData,
				},
			};
		});
	},
});

export const getCategorizationByTrack = query({
	args: {
		trackId: v.string(),
	},
	handler: async (ctx, args) => {
		const categorization = await ctx.db
			.query("spotifySongCategorizations")
			.withIndex("by_trackId", (q) => q.eq("trackId", args.trackId))
			.first();

		if (!categorization) return null;

		// Fetch canonical track
		const canonicalTrack = await ctx.db
			.query("spotifyTracksCanonical")
			.withIndex("by_spotifyTrackId", (q) =>
				q.eq("spotifyTrackId", args.trackId),
			)
			.first();

		return {
			_id: categorization._id,
			userId: categorization.userId,
			spotifyTrackId: categorization.trackId,
			userInput: categorization.userInput,
			aiSuggestions: categorization.aiSuggestions,
			finalSelections: categorization.finalSelections,
			createdAt: categorization.createdAt,
			track: canonicalTrack ?? {
				spotifyTrackId: categorization.trackId,
				trackName: categorization.trackName,
				artistName: categorization.artistName,
				albumName: categorization.albumName,
				albumImageUrl: categorization.albumImageUrl,
				rawData: categorization.trackData,
			},
		};
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
		const filtered = all.filter(
			(cat) =>
				cat.userInput.toLowerCase().includes(term) ||
				(cat.trackName ?? "").toLowerCase().includes(term) ||
				(cat.artistName ?? "").toLowerCase().includes(term),
		);

		// Get unique Spotify track IDs for batch fetch (use new field with legacy fallback)
		const spotifyTrackIds = [
			...new Set(
				filtered
					.map((c) => c.spotifyTrackId ?? c.trackId)
					.filter((id): id is string => id !== undefined),
			),
		];

		// Batch fetch canonical tracks
		const canonicalTracks = await Promise.all(
			spotifyTrackIds.map((id) =>
				ctx.db
					.query("spotifyTracksCanonical")
					.withIndex("by_spotifyTrackId", (q) => q.eq("spotifyTrackId", id))
					.first(),
			),
		);

		// Create a map of spotifyTrackId -> canonical track
		const canonicalTrackMap = new Map<
			string,
			(typeof canonicalTracks)[number]
		>();
		for (const track of canonicalTracks) {
			if (track) {
				canonicalTrackMap.set(track.spotifyTrackId, track);
			}
		}

		// Return categorizations with nested canonical track data
		return filtered.map((cat) => {
			const trackId = cat.spotifyTrackId ?? cat.trackId ?? "";
			return {
				_id: cat._id,
				userId: cat.userId,
				spotifyTrackId: trackId,
				userInput: cat.userInput,
				aiSuggestions: cat.aiSuggestions,
				finalSelections: cat.finalSelections,
				createdAt: cat.createdAt,
				track: canonicalTrackMap.get(trackId) ?? {
					spotifyTrackId: trackId,
					trackName: cat.trackName ?? "Unknown Track",
					artistName: cat.artistName ?? "Unknown Artist",
					albumName: cat.albumName,
					albumImageUrl: cat.albumImageUrl,
					rawData: cat.trackData,
				},
			};
		});
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
			// Dual-write: Upsert to canonical table first
			const extraFields = parseTrackDataFields(item.trackData);
			const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
				spotifyTrackId: item.trackId,
				trackName: item.trackName,
				artistName: item.artistName,
				albumName: item.albumName,
				albumImageUrl: item.albumImageUrl,
				spotifyAlbumId: item.spotifyAlbumId,
				rawData: item.trackData,
				...extraFields,
			});

			// Write to new userTracks table (normalized)
			const existingUserTrack = await ctx.db
				.query("userTracks")
				.withIndex("by_userId_spotifyTrackId", (q) =>
					q.eq("userId", args.userId).eq("spotifyTrackId", item.trackId),
				)
				.first();

			if (existingUserTrack) {
				const newLastPlayedAt = Math.max(
					existingUserTrack.lastPlayedAt ?? 0,
					item.playedAt,
				);
				const newLastSeenAt = Math.max(
					existingUserTrack.lastSeenAt,
					newLastPlayedAt,
					existingUserTrack.lastLikedAt ?? 0,
				);
				await ctx.db.patch(existingUserTrack._id, {
					lastPlayedAt: newLastPlayedAt,
					lastSeenAt: newLastSeenAt,
				});
			} else {
				await ctx.db.insert("userTracks", {
					userId: args.userId,
					trackId: canonicalTrackId,
					spotifyTrackId: item.trackId,
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
			// Dual-write: Upsert to canonical table first
			const extraFields = parseTrackDataFields(item.trackData);
			const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
				spotifyTrackId: item.trackId,
				trackName: item.trackName,
				artistName: item.artistName,
				albumName: item.albumName,
				albumImageUrl: item.albumImageUrl,
				spotifyAlbumId: item.spotifyAlbumId,
				rawData: item.trackData,
				...extraFields,
			});

			// Write to new userTracks table (normalized)
			const existingUserTrack = await ctx.db
				.query("userTracks")
				.withIndex("by_userId_spotifyTrackId", (q) =>
					q.eq("userId", args.userId).eq("spotifyTrackId", item.trackId),
				)
				.first();

			if (existingUserTrack) {
				const newLastLikedAt = Math.max(
					existingUserTrack.lastLikedAt ?? 0,
					item.addedAt,
				);
				const newLastSeenAt = Math.max(
					existingUserTrack.lastSeenAt,
					newLastLikedAt,
					existingUserTrack.lastPlayedAt ?? 0,
				);
				await ctx.db.patch(existingUserTrack._id, {
					lastLikedAt: newLastLikedAt,
					lastSeenAt: newLastSeenAt,
				});
			} else {
				await ctx.db.insert("userTracks", {
					userId: args.userId,
					trackId: canonicalTrackId,
					spotifyTrackId: item.trackId,
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

		// Query user tracks with lastPlayedAt, ordered by most recent using the index
		const userTracks = await ctx.db
			.query("userTracks")
			.withIndex("by_userId_lastPlayedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.collect();

		// Filter out tracks without lastPlayedAt and apply limit
		const filteredTracks = userTracks
			.filter((track) => track.lastPlayedAt !== undefined)
			.slice(0, limit);

		// Batch fetch canonical tracks using the trackId reference
		const canonicalTracks = await Promise.all(
			filteredTracks.map((t) => ctx.db.get(t.trackId)),
		);

		// Create a map of spotifyTrackId -> canonical track
		const canonicalTrackMap = new Map<
			string,
			(typeof canonicalTracks)[number]
		>();
		for (const track of canonicalTracks) {
			if (track) {
				canonicalTrackMap.set(track.spotifyTrackId, track);
			}
		}

		// Get unique album IDs to batch fetch release dates
		const albumIds = [
			...new Set(
				canonicalTracks
					.map((t) => t?.spotifyAlbumId)
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

		// Return user tracks with nested canonical track data
		return filteredTracks.map((userTrack) => {
			const canonical = canonicalTrackMap.get(userTrack.spotifyTrackId);
			return {
				_id: userTrack._id,
				userId: userTrack.userId,
				spotifyTrackId: userTrack.spotifyTrackId,
				firstSeenAt: userTrack.firstSeenAt,
				lastSeenAt: userTrack.lastSeenAt,
				lastPlayedAt: userTrack.lastPlayedAt,
				lastLikedAt: userTrack.lastLikedAt,
				lastCategorizedAt: userTrack.lastCategorizedAt,
				track: canonical ?? {
					spotifyTrackId: userTrack.spotifyTrackId,
					trackName: "Unknown Track",
					artistName: "Unknown Artist",
				},
				releaseDate: canonical?.spotifyAlbumId
					? albumReleaseDates.get(canonical.spotifyAlbumId)
					: undefined,
			};
		});
	},
});

export const getLikedTracksHistory = query({
	args: {
		userId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Get all user tracks with lastLikedAt, then sort
		const userTracks = await ctx.db
			.query("userTracks")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		// Filter to only tracks with lastLikedAt and sort by it descending
		const filtered = userTracks
			.filter((t) => t.lastLikedAt !== undefined)
			.sort((a, b) => (b.lastLikedAt ?? 0) - (a.lastLikedAt ?? 0));

		const limitedTracks = args.limit ? filtered.slice(0, args.limit) : filtered;

		// Batch fetch canonical tracks using the trackId reference
		const canonicalTracks = await Promise.all(
			limitedTracks.map((t) => ctx.db.get(t.trackId)),
		);

		// Create a map of spotifyTrackId -> canonical track
		const canonicalTrackMap = new Map<
			string,
			(typeof canonicalTracks)[number]
		>();
		for (const track of canonicalTracks) {
			if (track) {
				canonicalTrackMap.set(track.spotifyTrackId, track);
			}
		}

		// Return user tracks with nested canonical track data
		return limitedTracks.map((userTrack) => ({
			_id: userTrack._id,
			userId: userTrack.userId,
			spotifyTrackId: userTrack.spotifyTrackId,
			firstSeenAt: userTrack.firstSeenAt,
			lastSeenAt: userTrack.lastSeenAt,
			lastPlayedAt: userTrack.lastPlayedAt,
			lastLikedAt: userTrack.lastLikedAt,
			lastCategorizedAt: userTrack.lastCategorizedAt,
			track: canonicalTrackMap.get(userTrack.spotifyTrackId) ?? {
				spotifyTrackId: userTrack.spotifyTrackId,
				trackName: "Unknown Track",
				artistName: "Unknown Artist",
			},
		}));
	},
});

export const getTrackByUserAndTrackId = query({
	args: {
		userId: v.string(),
		trackId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("userTracks")
			.withIndex("by_userId_spotifyTrackId", (q) =>
				q.eq("userId", args.userId).eq("spotifyTrackId", args.trackId),
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

export const getLastSyncRun = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifySyncRuns")
			.withIndex("by_userId_startedAt", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();
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

// Upsert canonical track data (global, shared across users)
export const upsertCanonicalTrack = mutation({
	args: {
		spotifyTrackId: v.string(),
		trackName: v.string(),
		artistName: v.string(),
		albumName: v.optional(v.string()),
		albumImageUrl: v.optional(v.string()),
		spotifyAlbumId: v.optional(v.string()),
		durationMs: v.optional(v.number()),
		trackNumber: v.optional(v.number()),
		isExplicit: v.optional(v.boolean()),
		previewUrl: v.optional(v.string()),
		rawData: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const existing = await ctx.db
			.query("spotifyTracksCanonical")
			.withIndex("by_spotifyTrackId", (q) =>
				q.eq("spotifyTrackId", args.spotifyTrackId),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				trackName: args.trackName,
				artistName: args.artistName,
				albumName: args.albumName,
				albumImageUrl: args.albumImageUrl,
				spotifyAlbumId: args.spotifyAlbumId,
				durationMs: args.durationMs,
				trackNumber: args.trackNumber,
				isExplicit: args.isExplicit,
				previewUrl: args.previewUrl,
				rawData: args.rawData,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("spotifyTracksCanonical", {
			spotifyTrackId: args.spotifyTrackId,
			trackName: args.trackName,
			artistName: args.artistName,
			albumName: args.albumName,
			albumImageUrl: args.albumImageUrl,
			spotifyAlbumId: args.spotifyAlbumId,
			durationMs: args.durationMs,
			trackNumber: args.trackNumber,
			isExplicit: args.isExplicit,
			previewUrl: args.previewUrl,
			rawData: args.rawData,
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Get canonical track by Spotify ID
export const getCanonicalTrackBySpotifyId = query({
	args: { spotifyTrackId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyTracksCanonical")
			.withIndex("by_spotifyTrackId", (q) =>
				q.eq("spotifyTrackId", args.spotifyTrackId),
			)
			.first();
	},
});

// Get all canonical tracks (for backfill scripts)
export const getAllCanonicalTracks = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("spotifyTracksCanonical").collect();
	},
});

// Get canonical tracks missing rawData - uses index
export const getCanonicalTracksMissingRawData = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;

		const tracks = await ctx.db
			.query("spotifyTracksCanonical")
			.withIndex("by_hasRawData", (q) => q.eq("hasRawData", false))
			.take(limit);

		return tracks.map((t) => ({
			_id: t._id,
			spotifyTrackId: t.spotifyTrackId,
		}));
	},
});

// Mark tracks that need rawData backfill - just marks ALL as false, backfill will check
export const markTracksNeedingRawDataBatch = mutation({
	args: { afterId: v.optional(v.id("spotifyTracksCanonical")) },
	handler: async (ctx, args) => {
		const batchSize = 200;

		// Get tracks after cursor, oldest first
		let tracks = await ctx.db
			.query("spotifyTracksCanonical")
			.order("asc")
			.take(batchSize);

		if (args.afterId) {
			const afterDoc = await ctx.db.get(args.afterId);
			if (afterDoc) {
				tracks = await ctx.db
					.query("spotifyTracksCanonical")
					.order("asc")
					.filter((q) => q.gt(q.field("_creationTime"), afterDoc._creationTime))
					.take(batchSize);
			} else {
				tracks = [];
			}
		}

		let marked = 0;
		let lastId: string | null = null;

		for (const track of tracks) {
			if (track.hasRawData === undefined) {
				// Just mark as false - backfill will check actual rawData
				await ctx.db.patch(track._id, { hasRawData: false });
				marked++;
			}
			lastId = track._id;
		}

		return {
			marked,
			lastId,
			hasMore: tracks.length === batchSize,
		};
	},
});

// Action that loops until all tracks are marked
export const markAllTracksNeedingRawData = action({
	args: {},
	handler: async (ctx): Promise<{
		totalMarked: number;
		iterations: number;
	}> => {
		let totalMarked = 0;
		let iterations = 0;
		let lastId: string | undefined;

		console.log("🏷️ Marking tracks as needing rawData check...");

		while (true) {
			iterations++;
			const result = await ctx.runMutation(
				api.spotify.markTracksNeedingRawDataBatch,
				lastId ? { afterId: lastId as any } : {},
			);

			totalMarked += result.marked;
			lastId = result.lastId ?? undefined;

			if (iterations % 20 === 0) {
				console.log(`   Iteration ${iterations}: ${totalMarked} marked so far`);
			}

			if (!result.hasMore) {
				break;
			}
		}

		console.log(`✅ Done! Marked ${totalMarked} tracks (${iterations} iterations)`);
		return { totalMarked, iterations };
	},
});

// Update canonical track rawData
export const updateCanonicalTrackRawData = mutation({
	args: {
		trackId: v.id("spotifyTracksCanonical"),
		rawData: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.trackId, {
			rawData: args.rawData,
			hasRawData: true,
			updatedAt: Date.now(),
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
		// First get canonical tracks for this album
		const canonicalTracks = await ctx.db
			.query("spotifyTracksCanonical")
			.withIndex("by_spotifyAlbumId", (q) =>
				q.eq("spotifyAlbumId", args.spotifyAlbumId),
			)
			.collect();

		if (canonicalTracks.length === 0) {
			return [];
		}

		// Get the user's tracks that match these canonical tracks
		const userTracks = await Promise.all(
			canonicalTracks.map((ct) =>
				ctx.db
					.query("userTracks")
					.withIndex("by_userId_spotifyTrackId", (q) =>
						q.eq("userId", args.userId).eq("spotifyTrackId", ct.spotifyTrackId),
					)
					.first(),
			),
		);

		// Create a map of spotifyTrackId -> canonical track
		const canonicalTrackMap = new Map(
			canonicalTracks.map((ct) => [ct.spotifyTrackId, ct]),
		);

		// Return user tracks with nested canonical track data
		return userTracks
			.filter((ut) => ut !== null)
			.map((userTrack) => ({
				_id: userTrack._id,
				userId: userTrack.userId,
				spotifyTrackId: userTrack.spotifyTrackId,
				firstSeenAt: userTrack.firstSeenAt,
				lastSeenAt: userTrack.lastSeenAt,
				lastPlayedAt: userTrack.lastPlayedAt,
				lastLikedAt: userTrack.lastLikedAt,
				lastCategorizedAt: userTrack.lastCategorizedAt,
				track: canonicalTrackMap.get(userTrack.spotifyTrackId) ?? {
					spotifyTrackId: userTrack.spotifyTrackId,
					trackName: "Unknown Track",
					artistName: "Unknown Artist",
				},
			}));
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
			// Dual-write: Upsert to canonical table first
			const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
				spotifyTrackId: track.trackId,
				trackName: track.trackName,
				artistName: track.artistName,
				albumName: args.albumName,
				albumImageUrl: args.albumImageUrl,
				spotifyAlbumId: args.spotifyAlbumId,
			});

			// Write to new userTracks table (normalized)
			const existingUserTrack = await ctx.db
				.query("userTracks")
				.withIndex("by_userId_spotifyTrackId", (q) =>
					q.eq("userId", args.userId).eq("spotifyTrackId", track.trackId),
				)
				.first();

			if (!existingUserTrack) {
				await ctx.db.insert("userTracks", {
					userId: args.userId,
					trackId: canonicalTrackId,
					spotifyTrackId: track.trackId,
					firstSeenAt: now,
					lastSeenAt: now,
					// No lastPlayedAt - these are album-sourced, not user-played
				});
				addedCount++;
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
		rating: v.number(), // 1-15
		position: v.number(), // Float for ordering
	},
	handler: async (ctx, args) => {
		// Get current album to capture previous rating
		const userAlbum = await ctx.db.get(args.userAlbumId);
		if (!userAlbum) throw new Error("Album not found");

		// Only record history if the rating actually changed
		if (userAlbum.rating !== args.rating) {
			const historyId = await ctx.db.insert("ratingHistory", {
				userId: userAlbum.userId,
				userAlbumId: args.userAlbumId,
				albumId: userAlbum.albumId,
				rating: args.rating,
				previousRating: userAlbum.rating,
				ratedAt: Date.now(),
			});
			console.log("Created rating history:", historyId, {
				from: userAlbum.rating,
				to: args.rating,
			});
		} else {
			console.log("Rating unchanged, skipping history:", args.rating);
		}

		// Update the rating (always update position even if rating unchanged)
		await ctx.db.patch(args.userAlbumId, {
			rating: args.rating,
			position: args.position,
		});
	},
});

export const getLatestRatingTimestamps = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		// Get all rating history for user
		const history = await ctx.db
			.query("ratingHistory")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		console.log("Rating history entries:", history.length);

		// Build map of albumId → latest ratedAt
		// Use string keys to ensure consistent lookup from frontend
		const latestByAlbum: Record<string, number> = {};
		for (const entry of history) {
			const albumId = String(entry.albumId);
			const existing = latestByAlbum[albumId];
			if (!existing || entry.ratedAt > existing) {
				latestByAlbum[albumId] = entry.ratedAt;
			}
		}
		console.log("Returning timestamps for albums:", Object.keys(latestByAlbum).length);
		return latestByAlbum;
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

// Debug query to check userId distribution in userTracks
export const debugTrackUserIds = query({
	args: {},
	handler: async (ctx) => {
		const tracks = await ctx.db.query("userTracks").collect();
		const userIdCounts: Record<string, number> = {};
		for (const track of tracks) {
			userIdCounts[track.userId] = (userIdCounts[track.userId] ?? 0) + 1;
		}
		// Get sample canonical tracks for display
		const sampleTracks = await Promise.all(
			tracks.slice(0, 5).map(async (t) => {
				const canonical = await ctx.db.get(t.trackId);
				return {
					userId: t.userId,
					trackName: canonical?.trackName ?? "Unknown",
					artistName: canonical?.artistName ?? "Unknown",
				};
			}),
		);
		return {
			totalTracks: tracks.length,
			userIdCounts,
			sampleTracks,
		};
	},
});

// ============================================================================
// Backfill Actions
// ============================================================================

// Count tracks marked as needing rawData (uses index)
export const countTracksMissingRawData = query({
	args: {},
	handler: async (ctx) => {
		const tracks = await ctx.db
			.query("spotifyTracksCanonical")
			.withIndex("by_hasRawData", (q) => q.eq("hasRawData", false))
			.take(10000);
		return tracks.length;
	},
});

// Count tracks that still haven't been marked
export const countUnmarkedTracks = query({
	args: {},
	handler: async (ctx) => {
		// Check how many still have hasRawData undefined
		const sample = await ctx.db
			.query("spotifyTracksCanonical")
			.take(500);
		
		const unmarked = sample.filter((t) => t.hasRawData === undefined);
		const needsRawData = sample.filter((t) => !t.rawData);
		
		return {
			sampleSize: sample.length,
			unmarkedInSample: unmarked.length,
			needsRawDataInSample: needsRawData.length,
		};
	},
});

// Get a batch of track IDs only (minimal data) - uses hasRawData boolean field
export const getTrackIdsBatch = query({
	args: { afterTime: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const tracks = await ctx.db
			.query("spotifyTracksCanonical")
			.order("asc")
			.filter((q) =>
				args.afterTime
					? q.gt(q.field("_creationTime"), args.afterTime)
					: true,
			)
			.take(25);

		// Use the hasRawData FIELD (not !!t.rawData) to avoid loading rawData into memory
		return tracks.map((t) => ({
			_id: t._id,
			spotifyTrackId: t.spotifyTrackId,
			hasRawData: t.hasRawData === true, // Only true if explicitly set
			creationTime: t._creationTime,
		}));
	},
});

// Simple backfill - iterates through ALL tracks
export const backfillCanonicalTrackRawData = action({
	args: {
		continueFrom: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<{
		totalScanned: number;
		totalUpdated: number;
		totalSkipped: number;
		totalErrors: number;
		done: boolean;
		continueFrom: number | null;
	}> => {
		const userId = process.env.SPOTIFY_SYNC_USER_ID;
		if (!userId) throw new Error("SPOTIFY_SYNC_USER_ID not configured");

		console.log("🔄 Backfilling rawData on ALL canonical tracks...");

		// Get Spotify connection and refresh token if needed
		const connection = await ctx.runQuery(api.spotify.getConnection, {
			userId,
		});

		if (!connection) {
			throw new Error(`No Spotify connection found for user: ${userId}`);
		}

		let accessToken = connection.accessToken;
		const now = Date.now();
		const isExpired = connection.expiresAt < now + 5 * 60 * 1000;

		if (isExpired) {
			console.log("🔑 Refreshing access token...");
			const clientId = process.env.SPOTIFY_CLIENT_ID;
			const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

			if (!clientId || !clientSecret) {
				throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
			}

			const tokenResponse = await fetch(
				"https://accounts.spotify.com/api/token",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
					},
					body: new URLSearchParams({
						grant_type: "refresh_token",
						refresh_token: connection.refreshToken,
					}),
				},
			);

			if (!tokenResponse.ok) {
				throw new Error(`Failed to refresh token: ${await tokenResponse.text()}`);
			}

			const tokens = await tokenResponse.json();
			accessToken = tokens.access_token;

			await ctx.runMutation(api.spotify.updateTokens, {
				userId,
				accessToken: tokens.access_token,
				expiresIn: tokens.expires_in,
				refreshToken: tokens.refresh_token,
			});
		}

		// Spotify track type
		type SpotifyTrack = {
			id: string;
			name: string;
			artists: Array<{ id: string; name: string }>;
			album: { id: string; name: string; images: Array<{ url: string }> };
			duration_ms: number;
			track_number: number;
			explicit: boolean;
			preview_url: string | null;
		};

		let totalScanned = 0;
		let totalUpdated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;
		let iteration = 0;
		let lastCreationTime: number | undefined = args.continueFrom;
		const maxIterations = 30; // Stop before hitting byte limit

		if (args.continueFrom) {
			console.log(`📍 Continuing from timestamp ${args.continueFrom}`);
		}

		// Iterate through tracks using pagination
		while (iteration < maxIterations) {
			iteration++;

			// Get next batch of tracks (just IDs)
			const batch = await ctx.runQuery(api.spotify.getTrackIdsBatch, {
				afterTime: lastCreationTime,
			});

			if (batch.length === 0) {
				console.log("✅ Reached end of all tracks!");
				return {
					totalScanned,
					totalUpdated,
					totalSkipped,
					totalErrors,
					done: true,
					continueFrom: null,
				};
			}

			// Filter to only tracks missing rawData
			const needsUpdate = batch.filter((t) => !t.hasRawData);
			totalSkipped += batch.length - needsUpdate.length;

			if (needsUpdate.length > 0) {
				// Fetch from Spotify
				const spotifyTrackIds = needsUpdate.map((t) => t.spotifyTrackId);

				try {
					const response = await fetch(
						`https://api.spotify.com/v1/tracks?ids=${spotifyTrackIds.join(",")}`,
						{ headers: { Authorization: `Bearer ${accessToken}` } },
					);

					if (response.ok) {
						const data = await response.json();
						const trackDataMap = new Map<string, SpotifyTrack>();
						for (const track of data.tracks) {
							if (track) trackDataMap.set(track.id, track);
						}

						// Update each track
						for (const track of needsUpdate) {
							const spotifyData = trackDataMap.get(track.spotifyTrackId);
							if (spotifyData) {
								await ctx.runMutation(api.spotify.updateCanonicalTrackRawData, {
									trackId: track._id,
									rawData: JSON.stringify(spotifyData),
								});
								totalUpdated++;
							}
						}
					} else {
						console.error(`Spotify API error: ${await response.text()}`);
						totalErrors++;
					}
				} catch (error) {
					console.error(`Error: ${error}`);
					totalErrors++;
				}
			}

			totalScanned += batch.length;
			lastCreationTime = batch[batch.length - 1]?.creationTime;

			if (iteration % 20 === 0) {
				console.log(
					`📊 Progress: ${totalScanned} scanned, ${totalUpdated} updated, ${totalSkipped} skipped`,
				);
			}
		}

		console.log(
			`\n⏸️ Pausing to avoid limits. ${totalScanned} scanned, ${totalUpdated} updated. Run again to continue.`,
		);

		return {
			totalScanned,
			totalUpdated,
			totalSkipped,
			totalErrors,
			done: false,
			continueFrom: lastCreationTime ?? null,
		};
	},
});

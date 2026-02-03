import { v } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import { action, mutation, query } from './_generated/server';
import { api } from './_generated/api';

// ============================================================================
// Internal Helpers
// ============================================================================

type CanonicalTrackData = {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  artistIds?: string[]; // Spotify artist IDs
  albumName?: string;
  albumImageUrl?: string;
  spotifyAlbumId?: string;
  durationMs?: number;
  trackNumber?: number;
  isExplicit?: boolean;
  previewUrl?: string;
};

type ArtistBasicInfo = {
  id: string;
  name: string;
};

// ============================================================================
// Legacy Data Cleanup
// ============================================================================

// Clear rawData from tracks using pagination (cursor stored in DB)
export const clearLegacyRawData = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ cleared: number; done: boolean }> => {
    const size = args.batchSize ?? 100;
    const key = 'clear-legacy-rawdata';

    // Get cursor from DB
    const progress = await ctx.db
      .query('backfillProgress')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();

    // Use Convex pagination - seeks efficiently
    const result = await ctx.db
      .query('spotifyTracksCanonical')
      .order('asc')
      .paginate({
        numItems: size,
        cursor: (progress?.cursorStr as any) ?? null,
      });

    if (result.page.length === 0 || result.isDone) {
      if (progress) await ctx.db.delete(progress._id);
      return { cleared: 0, done: true };
    }

    // Clear rawData on each track
    for (const track of result.page) {
      if (track.rawData || track.hasRawData !== undefined) {
        await ctx.db.patch(track._id, { rawData: undefined, hasRawData: undefined });
      }
    }

    // Save cursor
    if (progress) {
      await ctx.db.patch(progress._id, { cursorStr: result.continueCursor, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('backfillProgress', { key, cursor: 0, cursorStr: result.continueCursor, updatedAt: Date.now() });
    }

    return { cleared: result.page.length, done: result.isDone };
  },
});

// Clear rawData from artists
export const clearLegacyArtistRawData = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ cleared: number; done: boolean }> => {
    const size = args.batchSize ?? 100;
    const key = 'clear-legacy-artist-rawdata';

    const progress = await ctx.db
      .query('backfillProgress')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();

    const result = await ctx.db
      .query('spotifyArtists')
      .order('asc')
      .paginate({
        numItems: size,
        cursor: (progress?.cursorStr as any) ?? null,
      });

    if (result.page.length === 0 || result.isDone) {
      if (progress) await ctx.db.delete(progress._id);
      return { cleared: 0, done: true };
    }

    for (const artist of result.page) {
      if (artist.rawData) {
        await ctx.db.patch(artist._id, { rawData: undefined });
      }
    }

    if (progress) {
      await ctx.db.patch(progress._id, { cursorStr: result.continueCursor, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('backfillProgress', { key, cursor: 0, cursorStr: result.continueCursor, updatedAt: Date.now() });
    }

    return { cleared: result.page.length, done: result.isDone };
  },
});

// Clear trackData from legacy spotifyTracks table
export const clearLegacyTracksTrackData = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ cleared: number; done: boolean }> => {
    const size = args.batchSize ?? 100;
    const key = 'clear-legacy-tracks-trackdata';

    const progress = await ctx.db
      .query('backfillProgress')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();

    const result = await ctx.db
      .query('spotifyTracks')
      .order('asc')
      .paginate({
        numItems: size,
        cursor: (progress?.cursorStr as any) ?? null,
      });

    if (result.page.length === 0 || result.isDone) {
      if (progress) await ctx.db.delete(progress._id);
      return { cleared: 0, done: true };
    }

    for (const track of result.page) {
      if (track.trackData) {
        await ctx.db.patch(track._id, { trackData: undefined });
      }
    }

    if (progress) {
      await ctx.db.patch(progress._id, { cursorStr: result.continueCursor, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('backfillProgress', { key, cursor: 0, cursorStr: result.continueCursor, updatedAt: Date.now() });
    }

    return { cleared: result.page.length, done: result.isDone };
  },
});

// Clear rawData from albums
export const clearLegacyAlbumRawData = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ cleared: number; done: boolean }> => {
    const size = args.batchSize ?? 100;
    const key = 'clear-legacy-album-rawdata';

    const progress = await ctx.db
      .query('backfillProgress')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();

    const result = await ctx.db
      .query('spotifyAlbums')
      .order('asc')
      .paginate({
        numItems: size,
        cursor: (progress?.cursorStr as any) ?? null,
      });

    if (result.page.length === 0 || result.isDone) {
      if (progress) await ctx.db.delete(progress._id);
      return { cleared: 0, done: true };
    }

    for (const album of result.page) {
      if (album.rawData) {
        await ctx.db.patch(album._id, { rawData: undefined });
      }
    }

    if (progress) {
      await ctx.db.patch(progress._id, { cursorStr: result.continueCursor, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('backfillProgress', { key, cursor: 0, cursorStr: result.continueCursor, updatedAt: Date.now() });
    }

    return { cleared: result.page.length, done: result.isDone };
  },
});

// Clear trackData from categorizations
export const clearLegacyCategorizationTrackData = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ cleared: number; done: boolean }> => {
    const size = args.batchSize ?? 100;
    const key = 'clear-legacy-categorization-trackdata';

    const progress = await ctx.db
      .query('backfillProgress')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();

    const result = await ctx.db
      .query('spotifySongCategorizations')
      .order('asc')
      .paginate({
        numItems: size,
        cursor: (progress?.cursorStr as any) ?? null,
      });

    if (result.page.length === 0 || result.isDone) {
      if (progress) await ctx.db.delete(progress._id);
      return { cleared: 0, done: true };
    }

    for (const cat of result.page) {
      if (cat.trackData) {
        await ctx.db.patch(cat._id, { trackData: undefined });
      }
    }

    if (progress) {
      await ctx.db.patch(progress._id, { cursorStr: result.continueCursor, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('backfillProgress', { key, cursor: 0, cursorStr: result.continueCursor, updatedAt: Date.now() });
    }

    return { cleared: result.page.length, done: result.isDone };
  },
});

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
    .query('spotifyTracksCanonical')
    .withIndex('by_spotifyTrackId', (q) =>
      q.eq('spotifyTrackId', data.spotifyTrackId),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      trackName: data.trackName,
      artistName: data.artistName,
      artistIds: data.artistIds,
      albumName: data.albumName,
      albumImageUrl: data.albumImageUrl,
      spotifyAlbumId: data.spotifyAlbumId,
      durationMs: data.durationMs,
      trackNumber: data.trackNumber,
      isExplicit: data.isExplicit,
      previewUrl: data.previewUrl,
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert('spotifyTracksCanonical', {
    spotifyTrackId: data.spotifyTrackId,
    trackName: data.trackName,
    artistName: data.artistName,
    artistIds: data.artistIds,
    albumName: data.albumName,
    albumImageUrl: data.albumImageUrl,
    spotifyAlbumId: data.spotifyAlbumId,
    durationMs: data.durationMs,
    trackNumber: data.trackNumber,
    isExplicit: data.isExplicit,
    previewUrl: data.previewUrl,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Helper to upsert basic artist info (just ID and name).
 * Used when processing tracks - we get full artist details later if needed.
 */
async function upsertArtistBasic(ctx: MutationCtx, artist: ArtistBasicInfo) {
  const now = Date.now();

  const existing = await ctx.db
    .query('spotifyArtists')
    .withIndex('by_spotifyArtistId', (q) =>
      q.eq('spotifyArtistId', artist.id),
    )
    .first();

  if (existing) {
    // Only update name if it changed
    if (existing.name !== artist.name) {
      await ctx.db.patch(existing._id, { name: artist.name, updatedAt: now });
    }
    return existing._id;
  }

  return await ctx.db.insert('spotifyArtists', {
    spotifyArtistId: artist.id,
    name: artist.name,
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
      artists?: Array<{ id: string; name: string }>;
    };
    return {
      durationMs: trackData.duration_ms,
      trackNumber: trackData.track_number,
      isExplicit: trackData.explicit,
      previewUrl: trackData.preview_url ?? undefined,
      artists: trackData.artists ?? [],
      artistIds: trackData.artists?.map((a) => a.id) ?? [],
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
      .query('spotifyConnections')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
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

    return await ctx.db.insert('spotifyConnections', {
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
      .query('spotifyConnections')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
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
      .query('spotifyConnections')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    if (!connection) {
      throw new Error('No Spotify connection found');
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
      .query('spotifyConnections')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
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
      .query('spotifyPlaylists')
      .withIndex('by_spotifyPlaylistId', (q) =>
        q.eq('spotifyPlaylistId', args.spotifyPlaylistId),
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

    return await ctx.db.insert('spotifyPlaylists', {
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
      .query('spotifyPlaylists')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect();
  },
});

export const getActivePlaylists = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('spotifyPlaylists')
      .withIndex('by_userId_active', (q) =>
        q.eq('userId', args.userId).eq('isActive', true),
      )
      .collect();
  },
});

export const updatePlaylistDescription = mutation({
  args: {
    playlistId: v.id('spotifyPlaylists'),
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
    playlistId: v.id('spotifyPlaylists'),
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
  args: { playlistId: v.id('spotifyPlaylists') },
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
    
    // Upsert artists from track data
    if (extraFields.artists) {
      for (const artist of extraFields.artists) {
        await upsertArtistBasic(ctx, artist);
      }
    }
    
    const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
      spotifyTrackId: args.trackId,
      trackName: args.trackName,
      artistName: args.artistName,
      artistIds: extraFields.artistIds,
      albumName: args.albumName,
      albumImageUrl: args.albumImageUrl,
      ...extraFields,
    });

    // Check if this track was already categorized (for re-categorization)
    const existing = await ctx.db
      .query('spotifySongCategorizations')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
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
      categorizationId = await ctx.db.insert('spotifySongCategorizations', {
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
      .query('userTracks')
      .withIndex('by_userId_spotifyTrackId', (q) =>
        q.eq('userId', args.userId).eq('spotifyTrackId', args.trackId),
      )
      .first();

    if (existingUserTrack) {
      await ctx.db.patch(existingUserTrack._id, {
        lastCategorizedAt: now,
        lastSeenAt: Math.max(existingUserTrack.lastSeenAt, now),
      });
    } else {
      await ctx.db.insert('userTracks', {
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
      .query('spotifySongCategorizations')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', args.userId))
      .order('desc');

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
          .query('spotifyTracksCanonical')
          .withIndex('by_spotifyTrackId', (q) => q.eq('spotifyTrackId', id))
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
      const trackId = cat.spotifyTrackId ?? cat.trackId ?? '';
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
          trackName: cat.trackName ?? 'Unknown Track',
          artistName: cat.artistName ?? 'Unknown Artist',
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
      .query('spotifySongCategorizations')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
      .first();

    if (!categorization) return null;

    // Fetch canonical track
    const canonicalTrack = await ctx.db
      .query('spotifyTracksCanonical')
      .withIndex('by_spotifyTrackId', (q) =>
        q.eq('spotifyTrackId', args.trackId),
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
      .query('spotifySongCategorizations')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect();

    const term = args.searchTerm.toLowerCase();
    const filtered = all.filter(
      (cat) =>
        cat.userInput.toLowerCase().includes(term) ||
        (cat.trackName ?? '').toLowerCase().includes(term) ||
        (cat.artistName ?? '').toLowerCase().includes(term),
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
          .query('spotifyTracksCanonical')
          .withIndex('by_spotifyTrackId', (q) => q.eq('spotifyTrackId', id))
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
      const trackId = cat.spotifyTrackId ?? cat.trackId ?? '';
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
          trackName: cat.trackName ?? 'Unknown Track',
          artistName: cat.artistName ?? 'Unknown Artist',
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
      
      // Upsert artists from track data
      if (extraFields.artists) {
        for (const artist of extraFields.artists) {
          await upsertArtistBasic(ctx, artist);
        }
      }
      
      const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
        spotifyTrackId: item.trackId,
        trackName: item.trackName,
        artistName: item.artistName,
        artistIds: extraFields.artistIds,
        albumName: item.albumName,
        albumImageUrl: item.albumImageUrl,
        spotifyAlbumId: item.spotifyAlbumId,
        ...extraFields,
      });

      // Write to new userTracks table (normalized)
      const existingUserTrack = await ctx.db
        .query('userTracks')
        .withIndex('by_userId_spotifyTrackId', (q) =>
          q.eq('userId', args.userId).eq('spotifyTrackId', item.trackId),
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
        await ctx.db.insert('userTracks', {
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
      
      // Upsert artists from track data
      if (extraFields.artists) {
        for (const artist of extraFields.artists) {
          await upsertArtistBasic(ctx, artist);
        }
      }
      
      const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
        spotifyTrackId: item.trackId,
        trackName: item.trackName,
        artistName: item.artistName,
        artistIds: extraFields.artistIds,
        albumName: item.albumName,
        albumImageUrl: item.albumImageUrl,
        spotifyAlbumId: item.spotifyAlbumId,
        ...extraFields,
      });

      // Write to new userTracks table (normalized)
      const existingUserTrack = await ctx.db
        .query('userTracks')
        .withIndex('by_userId_spotifyTrackId', (q) =>
          q.eq('userId', args.userId).eq('spotifyTrackId', item.trackId),
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
        await ctx.db.insert('userTracks', {
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
      .query('userTracks')
      .withIndex('by_userId_lastPlayedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
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
          .query('spotifyAlbums')
          .withIndex('by_spotifyAlbumId', (q) => q.eq('spotifyAlbumId', id))
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
          trackName: 'Unknown Track',
          artistName: 'Unknown Artist',
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
      .query('userTracks')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
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
        trackName: 'Unknown Track',
        artistName: 'Unknown Artist',
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
      .query('userTracks')
      .withIndex('by_userId_spotifyTrackId', (q) =>
        q.eq('userId', args.userId).eq('spotifyTrackId', args.trackId),
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
      .query('spotifyPendingSuggestions')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
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
    return await ctx.db.insert('spotifyPendingSuggestions', {
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
      .query('spotifyPendingSuggestions')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
      .first();
  },
});

export const clearPendingSuggestions = mutation({
  args: {
    trackId: v.string(),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query('spotifyPendingSuggestions')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
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
    return await ctx.db.insert('spotifySyncLogs', {
      userId: args.userId,
      syncType: args.syncType,
      rawResponse: args.rawResponse,
      status: 'pending',
      createdAt: Date.now(),
    });
  },
});

export const updateSyncLogStatus = mutation({
  args: {
    syncLogId: v.id('spotifySyncLogs'),
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
      .query('spotifySyncLogs')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
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
    return await ctx.db.insert('spotifySyncRuns', args);
  },
});

export const getRecentSyncRuns = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query('spotifySyncRuns')
      .withIndex('by_userId_startedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
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
      .query('spotifySyncRuns')
      .withIndex('by_userId_startedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
      .first();
  },
});

export const getAllConnections = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('spotifyConnections').collect();
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
      .query('spotifyAlbums')
      .withIndex('by_spotifyAlbumId', (q) =>
        q.eq('spotifyAlbumId', args.spotifyAlbumId),
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

    return await ctx.db.insert('spotifyAlbums', {
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
    artistIds: v.optional(v.array(v.string())),
    albumName: v.optional(v.string()),
    albumImageUrl: v.optional(v.string()),
    spotifyAlbumId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    trackNumber: v.optional(v.number()),
    isExplicit: v.optional(v.boolean()),
    previewUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query('spotifyTracksCanonical')
      .withIndex('by_spotifyTrackId', (q) =>
        q.eq('spotifyTrackId', args.spotifyTrackId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        trackName: args.trackName,
        artistName: args.artistName,
        artistIds: args.artistIds,
        albumName: args.albumName,
        albumImageUrl: args.albumImageUrl,
        spotifyAlbumId: args.spotifyAlbumId,
        durationMs: args.durationMs,
        trackNumber: args.trackNumber,
        isExplicit: args.isExplicit,
        previewUrl: args.previewUrl,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('spotifyTracksCanonical', {
      spotifyTrackId: args.spotifyTrackId,
      trackName: args.trackName,
      artistName: args.artistName,
      artistIds: args.artistIds,
      albumName: args.albumName,
      albumImageUrl: args.albumImageUrl,
      spotifyAlbumId: args.spotifyAlbumId,
      durationMs: args.durationMs,
      trackNumber: args.trackNumber,
      isExplicit: args.isExplicit,
      previewUrl: args.previewUrl,
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
      .query('spotifyTracksCanonical')
      .withIndex('by_spotifyTrackId', (q) =>
        q.eq('spotifyTrackId', args.spotifyTrackId),
      )
      .first();
  },
});

// Get all canonical tracks (for backfill scripts)
export const getAllCanonicalTracks = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query('spotifyTracksCanonical').collect();
	},
});

export const getCanonicalTracksPage = query({
	args: {
		cursor: v.optional(v.string()),
		numItems: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const result = await ctx.db
			.query('spotifyTracksCanonical')
			.order('asc')
			.paginate({
				numItems: args.numItems ?? 200,
				cursor: (args.cursor as any) ?? null,
			});

		return {
			page: result.page,
			continueCursor: result.continueCursor,
			isDone: result.isDone,
		};
	},
});

export const getBackfillProgress = query({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('backfillProgress')
			.withIndex('by_key', (q) => q.eq('key', args.key))
			.first();
	},
});

export const setBackfillProgress = mutation({
	args: {
		key: v.string(),
		cursorStr: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('backfillProgress')
			.withIndex('by_key', (q) => q.eq('key', args.key))
			.first();

		if (!args.cursorStr) {
			if (existing) {
				await ctx.db.delete(existing._id);
			}
			return;
		}

		if (existing) {
			await ctx.db.patch(existing._id, {
				cursorStr: args.cursorStr,
				updatedAt: Date.now(),
			});
			return;
		}

		await ctx.db.insert('backfillProgress', {
			key: args.key,
			cursor: 0,
			cursorStr: args.cursorStr,
			updatedAt: Date.now(),
		});
	},
});

export const bulkUpdateCanonicalTrackArtists = mutation({
	args: {
		updates: v.array(
			v.object({
				spotifyTrackId: v.string(),
				artistIds: v.array(v.string()),
				artistName: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		let updated = 0;
		let notFound = 0;
		let artistNameUpdated = 0;

		for (const update of args.updates) {
			const existing = await ctx.db
				.query('spotifyTracksCanonical')
				.withIndex('by_spotifyTrackId', (q) =>
					q.eq('spotifyTrackId', update.spotifyTrackId),
				)
				.first();

			if (!existing) {
				notFound++;
				continue;
			}

			const patch: {
				artistIds: string[];
				artistName?: string;
				updatedAt: number;
			} = {
				artistIds: update.artistIds,
				updatedAt: now,
			};

			if (update.artistName) {
				patch.artistName = update.artistName;
				artistNameUpdated++;
			}

			await ctx.db.patch(existing._id, patch);
			updated++;
		}

		return { updated, notFound, artistNameUpdated };
	},
});

export const backfillCanonicalTrackArtistIds = action({
	args: {
		batchSize: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		scanned: number;
		missing: number;
		updated: number;
		artistRowsUpserted: number;
		spotifyErrors: number;
		done: boolean;
	}> => {
		const batchSize = args.batchSize ?? 200;
		const key = 'backfill-canonical-artist-ids';

		const progress = await ctx.runQuery(api.spotify.getBackfillProgress, {
			key,
		});

		const pageResult = await ctx.runQuery(api.spotify.getCanonicalTracksPage, {
			cursor: progress?.cursorStr ?? undefined,
			numItems: batchSize,
		});

		if (pageResult.page.length === 0) {
			if (progress) {
				await ctx.runMutation(api.spotify.setBackfillProgress, {
					key,
					cursorStr: undefined,
				});
			}
			return {
				scanned: 0,
				missing: 0,
				updated: 0,
				artistRowsUpserted: 0,
				spotifyErrors: 0,
				done: true,
			};
		}

		const missingTracks = pageResult.page.filter(
			(track) => !track.artistIds || track.artistIds.length === 0,
		);

		if (missingTracks.length === 0) {
			await ctx.runMutation(api.spotify.setBackfillProgress, {
				key,
				cursorStr: pageResult.isDone ? undefined : pageResult.continueCursor,
			});
			return {
				scanned: pageResult.page.length,
				missing: 0,
				updated: 0,
				artistRowsUpserted: 0,
				spotifyErrors: 0,
				done: pageResult.isDone,
			};
		}

		const userId = process.env.SPOTIFY_SYNC_USER_ID;
		if (!userId) {
			throw new Error('SPOTIFY_SYNC_USER_ID not configured');
		}

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
			const clientId = process.env.SPOTIFY_CLIENT_ID;
			const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

			if (!clientId || !clientSecret) {
				throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
			}

			const tokenResponse = await fetch(
				'https://accounts.spotify.com/api/token',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
					},
					body: new URLSearchParams({
						grant_type: 'refresh_token',
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

		type SpotifyTrack = {
			id: string;
			name: string;
			artists: Array<{ id: string; name: string }>;
		};

		const missingTrackIds = missingTracks.map((track) => track.spotifyTrackId);
		const missingTrackMap = new Map(
			missingTracks.map((track) => [track.spotifyTrackId, track]),
		);

		const updates: Array<{
			spotifyTrackId: string;
			artistIds: string[];
			artistName?: string;
		}> = [];
		const artistMap = new Map<string, { spotifyArtistId: string; name: string }>();
		let spotifyErrors = 0;

		for (let i = 0; i < missingTrackIds.length; i += 50) {
			const batch = missingTrackIds.slice(i, i + 50);
			const response = await fetch(
				`https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				},
			);

			if (!response.ok) {
				spotifyErrors++;
				continue;
			}

			const data = (await response.json()) as {
				tracks: Array<SpotifyTrack | null>;
			};

			for (const track of data.tracks ?? []) {
				if (!track) continue;
				const artistIds = track.artists.map((artist) => artist.id);
				if (artistIds.length === 0) continue;

				const existing = missingTrackMap.get(track.id);
				if (!existing) continue;

				let artistName: string | undefined;
				const existingName = existing.artistName?.trim();
				if (!existingName || existingName === 'Unknown Artist') {
					const artistNames = track.artists.map((artist) => artist.name);
					if (artistNames.length > 0) {
						artistName = artistNames.join(', ');
					}
				}

				updates.push({
					spotifyTrackId: track.id,
					artistIds,
					...(artistName ? { artistName } : {}),
				});

				for (const artist of track.artists) {
					if (!artist.id) continue;
					if (!artistMap.has(artist.id)) {
						artistMap.set(artist.id, {
							spotifyArtistId: artist.id,
							name: artist.name,
						});
					}
				}
			}
		}

		let updated = 0;
		if (updates.length > 0) {
			const updateResult = await ctx.runMutation(
				api.spotify.bulkUpdateCanonicalTrackArtists,
				{ updates },
			);
			updated = updateResult.updated;
		}

		let artistRowsUpserted = 0;
		if (artistMap.size > 0) {
			const upsertResult = await ctx.runMutation(
				api.rooleases.bulkUpsertArtists,
				{ artists: Array.from(artistMap.values()) },
			);
			artistRowsUpserted = upsertResult.added + upsertResult.updated;
		}

		await ctx.runMutation(api.spotify.setBackfillProgress, {
			key,
			cursorStr: pageResult.isDone ? undefined : pageResult.continueCursor,
		});

		return {
			scanned: pageResult.page.length,
			missing: missingTracks.length,
			updated,
			artistRowsUpserted,
			spotifyErrors,
			done: pageResult.isDone,
		};
	},
});

export const getAlbumBySpotifyId = query({
	args: { spotifyAlbumId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
      .query('spotifyAlbums')
      .withIndex('by_spotifyAlbumId', (q) =>
        q.eq('spotifyAlbumId', args.spotifyAlbumId),
      )
      .first();
  },
});

export const getAllAlbums = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const query = ctx.db.query('spotifyAlbums').withIndex('by_createdAt');

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
    albumId: v.id('spotifyAlbums'),
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
      .query('userAlbumListens')
      .withIndex('by_userId_albumId', (q) =>
        q.eq('userId', args.userId).eq('albumId', args.albumId),
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
      return { recorded: false, reason: 'overlapping_listen' };
    }

    // Create the listen event
    await ctx.db.insert('userAlbumListens', {
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
      .query('userAlbums')
      .withIndex('by_userId_albumId', (q) =>
        q.eq('userId', args.userId).eq('albumId', args.albumId),
      )
      .first();

    if (existingUserAlbum) {
      await ctx.db.patch(existingUserAlbum._id, {
        lastListenedAt: now,
        listenCount: existingUserAlbum.listenCount + 1,
      });
    } else {
      await ctx.db.insert('userAlbums', {
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
      .query('spotifyAlbums')
      .withIndex('by_spotifyAlbumId', (q) =>
        q.eq('spotifyAlbumId', args.spotifyAlbumId),
      )
      .first();

    if (!album) {
      throw new Error(
        `Album not found in database: ${args.spotifyAlbumId}. Please ensure album is fetched first.`,
      );
    }

    // 2. Check for duplicate listens at the same timestamp
    const existingListens = await ctx.db
      .query('userAlbumListens')
      .withIndex('by_userId_albumId', (q) =>
        q.eq('userId', args.userId).eq('albumId', album._id),
      )
      .collect();

    const isDuplicate = existingListens.some(
      (listen) => listen.listenedAt === args.listenedAt,
    );

    if (isDuplicate) {
      return { recorded: false, reason: 'duplicate_listen' };
    }

    // 3. Create the listen event
    await ctx.db.insert('userAlbumListens', {
      userId: args.userId,
      albumId: album._id,
      listenedAt: args.listenedAt,
      earliestPlayedAt: args.listenedAt,
      latestPlayedAt: args.listenedAt,
      trackIds: [],
      source: 'manual',
    });

    // 4. Upsert userAlbums record
    const existingUserAlbum = await ctx.db
      .query('userAlbums')
      .withIndex('by_userId_albumId', (q) =>
        q.eq('userId', args.userId).eq('albumId', album._id),
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
      await ctx.db.insert('userAlbums', {
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
      .query('userAlbums')
      .withIndex('by_userId_lastListenedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
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
      .query('userAlbumListens')
      .withIndex('by_userId_listenedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
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
    listenId: v.id('userAlbumListens'),
  },
  handler: async (ctx, args) => {
    // Get the listen to find the associated userAlbum
    const listen = await ctx.db.get(args.listenId);
    if (!listen) return;

    // Delete the listen
    await ctx.db.delete(args.listenId);

    // Update the userAlbums count
    const userAlbum = await ctx.db
      .query('userAlbums')
      .withIndex('by_userId_albumId', (q) =>
        q.eq('userId', listen.userId).eq('albumId', listen.albumId),
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
          .query('userAlbumListens')
          .withIndex('by_userId_albumId', (q) =>
            q.eq('userId', listen.userId).eq('albumId', listen.albumId),
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
      .query('spotifyTracksCanonical')
      .withIndex('by_spotifyAlbumId', (q) =>
        q.eq('spotifyAlbumId', args.spotifyAlbumId),
      )
      .collect();

    if (canonicalTracks.length === 0) {
      return [];
    }

    // Get the user's tracks that match these canonical tracks
    const userTracks = await Promise.all(
      canonicalTracks.map((ct) =>
        ctx.db
          .query('userTracks')
          .withIndex('by_userId_spotifyTrackId', (q) =>
            q.eq('userId', args.userId).eq('spotifyTrackId', ct.spotifyTrackId),
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
          trackName: 'Unknown Track',
          artistName: 'Unknown Artist',
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
				artists: v.array(
					v.object({
						id: v.string(),
						name: v.string(),
					}),
				),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		let addedCount = 0;

		for (const track of args.tracks) {
			const artistIds = track.artists.map((artist) => artist.id);

			for (const artist of track.artists) {
				await upsertArtistBasic(ctx, artist);
			}

			// Dual-write: Upsert to canonical table first
			const canonicalTrackId = await upsertCanonicalTrackInternal(ctx, {
				spotifyTrackId: track.trackId,
				trackName: track.trackName,
				artistName: track.artistName,
				artistIds,
				albumName: args.albumName,
				albumImageUrl: args.albumImageUrl,
				spotifyAlbumId: args.spotifyAlbumId,
			});

      // Write to new userTracks table (normalized)
      const existingUserTrack = await ctx.db
        .query('userTracks')
        .withIndex('by_userId_spotifyTrackId', (q) =>
          q.eq('userId', args.userId).eq('spotifyTrackId', track.trackId),
        )
        .first();

      if (!existingUserTrack) {
        await ctx.db.insert('userTracks', {
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
    userAlbumId: v.id('userAlbums'),
    rating: v.number(), // 1-15
    position: v.number(), // Float for ordering
  },
  handler: async (ctx, args) => {
    // Get current album to capture previous rating
    const userAlbum = await ctx.db.get(args.userAlbumId);
    if (!userAlbum) throw new Error('Album not found');

    // Only record history if the rating actually changed
    if (userAlbum.rating !== args.rating) {
      const historyId = await ctx.db.insert('ratingHistory', {
        userId: userAlbum.userId,
        userAlbumId: args.userAlbumId,
        albumId: userAlbum.albumId,
        rating: args.rating,
        previousRating: userAlbum.rating,
        ratedAt: Date.now(),
      });
      console.log('Created rating history:', historyId, {
        from: userAlbum.rating,
        to: args.rating,
      });
    } else {
      console.log('Rating unchanged, skipping history:', args.rating);
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
      .query('ratingHistory')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect();

    console.log('Rating history entries:', history.length);

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
    console.log(
      'Returning timestamps for albums:',
      Object.keys(latestByAlbum).length,
    );
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
      .query('userAlbums')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
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
    const tracks = await ctx.db.query('userTracks').collect();
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
          trackName: canonical?.trackName ?? 'Unknown',
          artistName: canonical?.artistName ?? 'Unknown',
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

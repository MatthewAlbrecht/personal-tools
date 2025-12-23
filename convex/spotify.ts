import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

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
        q.eq('spotifyPlaylistId', args.spotifyPlaylistId)
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
        q.eq('userId', args.userId).eq('isActive', true)
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
      })
    ),
    finalSelections: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if this track was already categorized (for re-categorization)
    const existing = await ctx.db
      .query('spotifySongCategorizations')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
      .first();

    if (existing) {
      // Update existing categorization
      await ctx.db.patch(existing._id, {
        userInput: args.userInput,
        aiSuggestions: args.aiSuggestions,
        finalSelections: args.finalSelections,
        trackData: args.trackData,
      });
      return existing._id;
    }

    return await ctx.db.insert('spotifySongCategorizations', {
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
      createdAt: Date.now(),
    });
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
      .query('spotifySongCategorizations')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
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
      .query('spotifySongCategorizations')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect();

    const term = args.searchTerm.toLowerCase();
    return all.filter(
      (cat) =>
        cat.userInput.toLowerCase().includes(term) ||
        cat.trackName.toLowerCase().includes(term) ||
        cat.artistName.toLowerCase().includes(term)
    );
  },
});

// ============================================================================
// Save for Later
// ============================================================================

export const saveForLater = mutation({
  args: {
    userId: v.string(),
    trackId: v.string(),
    trackName: v.string(),
    artistName: v.string(),
    albumName: v.optional(v.string()),
    albumImageUrl: v.optional(v.string()),
    trackData: v.optional(v.string()), // JSON stringified SpotifyTrack
  },
  handler: async (ctx, args) => {
    // Check if already saved
    const existing = await ctx.db
      .query('spotifySavedForLater')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert('spotifySavedForLater', {
      userId: args.userId,
      trackId: args.trackId,
      trackName: args.trackName,
      artistName: args.artistName,
      albumName: args.albumName,
      albumImageUrl: args.albumImageUrl,
      trackData: args.trackData,
      savedAt: Date.now(),
    });
  },
});

export const removeSavedForLater = mutation({
  args: {
    trackId: v.string(),
  },
  handler: async (ctx, args) => {
    const saved = await ctx.db
      .query('spotifySavedForLater')
      .withIndex('by_trackId', (q) => q.eq('trackId', args.trackId))
      .first();

    if (saved) {
      await ctx.db.delete(saved._id);
    }
  },
});

export const getSavedForLater = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('spotifySavedForLater')
      .withIndex('by_userId_savedAt', (q) => q.eq('userId', args.userId))
      .order('desc')
      .collect();
  },
});

export const getSavedTrackIds = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const saved = await ctx.db
      .query('spotifySavedForLater')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect();
    return new Set(saved.map((s) => s.trackId));
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
      })
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

export const getCategorizedTrackIds = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const categorized = await ctx.db
      .query('spotifySongCategorizations')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect();
    return categorized.map((c) => c.trackId);
  },
});

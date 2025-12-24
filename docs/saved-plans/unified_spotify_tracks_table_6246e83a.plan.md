# Unified Spotify Tracks Table

## Schema Changes

Add new table to [convex/schema.ts](convex/schema.ts):

```typescript
spotifyTracks: defineTable({
  userId: v.string(),
  trackId: v.string(), // Spotify track ID
  trackName: v.string(),
  artistName: v.string(),
  albumName: v.optional(v.string()),
  albumImageUrl: v.optional(v.string()),
  trackData: v.optional(v.string()), // JSON stringified SpotifyTrack
  sources: v.array(v.string()), // ['recentlyPlayed', 'liked', 'savedForLater']
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  lastPlayedAt: v.optional(v.number()), // Last seen in recently played
  lastLikedAt: v.optional(v.number()),  // Last seen in liked songs
  savedForLaterAt: v.optional(v.number()), // When user explicitly saved
})
  .index('by_userId', ['userId'])
  .index('by_trackId', ['trackId'])
  .index('by_userId_trackId', ['userId', 'trackId'])
  .index('by_userId_lastPlayedAt', ['userId', 'lastPlayedAt'])
  .index('by_userId_lastLikedAt', ['userId', 'lastLikedAt'])
  .index('by_userId_savedForLaterAt', ['userId', 'savedForLaterAt'])
```

Remove `spotifySavedForLater` table after migration.

## Convex Functions

Add to [convex/spotify.ts](convex/spotify.ts):

- `upsertTracksFromSource`: Batch upsert tracks from a given source (recentlyPlayed/liked), updating timestamps and sources array
- `saveTrackForLater` / `unsaveTrackForLater`: Toggle savedForLater source and timestamp
- `getTracksBySource`: Query tracks by source with pagination, ordered by relevant timestamp
- `getSavedForLaterTracks`: Query tracks with savedForLaterAt set
- `getTrackIds`: Return Set of trackIds for a given source (for UI deduplication)

Remove old `spotifySavedForLater` mutations/queries.

## Page Logic Updates

In [src/app/spotify-playlister/page.tsx](src/app/spotify-playlister/page.tsx):

- After fetching recent tracks from Spotify API, call `upsertTracksFromSource` mutation
- After fetching liked tracks from Spotify API, call `upsertTracksFromSource` mutation  
- Query stored tracks from Convex (full history) instead of only displaying API response
- Update save-for-later handlers to use new mutations
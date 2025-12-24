---
name: Unified Spotify Tracks (No SaveForLater)
overview: Unify encountered Spotify tracks into a single per-user table tracking last seen timestamps for recently played and liked sources, removing the saved-for-later feature entirely.
todos:
  - id: schema-spotifyTracks
    content: Add spotifyTracks table (per-user, per-track) with timestamp fields + indexes; remove spotifySavedForLater
    status: pending
  - id: convex-upserts
    content: Implement upsertTracksFromRecentlyPlayed and upsertTracksFromLiked using by_userId_trackId lookups
    status: pending
  - id: convex-queries
    content: Add Convex queries for RecentlyPlayed and Liked history returning JSON arrays
    status: pending
  - id: remove-saveforlater-ui
    content: Remove SaveForLater UI and Convex functions; remove any saved-track filtering that depended on it
    status: pending
  - id: page-wiring
    content: Update spotify-playlister page to upsert after Spotify fetch and render from Convex queries (tabs remain separate)
    status: pending
---

# Unified Spotify Tracks (No SaveForLater)

## Goals

- Persist “have I seen this track before + when was last time?” across sessions.
- Keep separate UI tabs (RecentlyPlayed / Liked) but each tab can show full history, not just the last 50 from Spotify.
- **Remove SaveForLater entirely** (schema, Convex functions, UI).

## Key Design Decisions

- **One row per (userId, trackId)**: canonical per-user track record.
- “Source membership” is derived from timestamps:
- `lastPlayedAt` present ⇒ seen in recently played
- `lastLikedAt` present ⇒ seen in liked songs
- **Use Spotify timestamps**:
- Recently played: Spotify `played_at`
- Liked songs: Spotify `added_at`
- Maintain `lastSeenAt = max(lastPlayedAt, lastLikedAt)` for consistent overall ordering.
- **Multi-user safe lookups**: all upserts must query by `(userId, trackId)` (never global `trackId`).
- **Convex return types stay JSON**: queries return arrays; client can compute `Set(trackId)`.

## Schema Changes

Update [convex/schema.ts](convex/schema.ts):

- **Add** `spotifyTracks` table:
```typescript
spotifyTracks: defineTable({
  userId: v.string(),
  trackId: v.string(),

  // denormalized display fields
  trackName: v.string(),
  artistName: v.string(),
  albumName: v.optional(v.string()),
  albumImageUrl: v.optional(v.string()),
  trackData: v.optional(v.string()), // JSON stringified SpotifyTrack

  // timestamps (Unix ms)
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  lastPlayedAt: v.optional(v.number()),
  lastLikedAt: v.optional(v.number()),
})
  .index('by_userId', ['userId'])
  .index('by_userId_trackId', ['userId', 'trackId'])
  .index('by_userId_lastSeenAt', ['userId', 'lastSeenAt'])
```




- **Remove** `spotifySavedForLater` table.

## Convex Functions

Update [convex/spotify.ts](convex/spotify.ts):

### Upsert from Spotify sources

- `upsertTracksFromRecentlyPlayed({ userId, items })`
- upsert `(userId, trackId)`
- set `lastPlayedAt = max(existing.lastPlayedAt, Date.parse(item.played_at))`
- set `lastSeenAt = max(lastSeenAt, lastPlayedAt, lastLikedAt)`
- `upsertTracksFromLiked({ userId, items })`
- set `lastLikedAt = max(existing.lastLikedAt, Date.parse(item.added_at))`
- update `lastSeenAt`

Implementation detail:

- Use `by_userId_trackId` for lookups.
- Idempotent updates; repeated refreshes only advance timestamps.

### Queries for UI

- `getRecentlyPlayedTracks({ userId, limit, cursor })`:
- filter: `lastPlayedAt` present
- order: by `lastPlayedAt` desc (or fall back to `lastSeenAt` if optional ordering becomes awkward)
- `getLikedTracksHistory({ userId, limit, cursor })`:
- filter: `lastLikedAt` present
- order similarly
- Optional: `getAllEncounteredTracks({ userId, limit, cursor })` ordered by `lastSeenAt` for a unified “everything” view later.

Return arrays (JSON).

## API / Page Wiring

Update [src/app/spotify-playlister/page.tsx](src/app/spotify-playlister/page.tsx):

- Keep existing Spotify fetch routes:
- `/api/spotify/recent-tracks`
- `/api/spotify/liked-tracks`
- On refresh/fetch:
- fetch from Spotify API
- call the appropriate Convex upsert mutation with returned items
- UI displays from Convex queries (persisted state), not directly from the API payload

## Remove SaveForLater Feature

Delete/strip:

- Convex functions: `saveForLater`, `removeSavedForLater`, `getSavedForLater`, `getSavedTrackIds`.
- UI handlers/buttons/components that call those.
- Any filtering logic that depends on saved-for-later IDs.

(If you still want an “exclude already categorized” behavior, keep using `spotifySongCategorizations` track IDs.)
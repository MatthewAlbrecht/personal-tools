---
name: Unified Spotify Tracks (OptionB)
overview: Unify encountered Spotify tracks into a single per-user table that records last-seen timestamps by source (recently played, liked, saved-for-later), enabling persistent history and safe multi-user behavior.
todos:
  - id: schema-spotifyTracks
    content: Add spotifyTracks table (per-user, per-track) with timestamp fields + indexes; remove spotifySavedForLater after migration
    status: pending
  - id: convex-upserts
    content: Implement upsertTracksFromRecentlyPlayed and upsertTracksFromLiked using by_userId_trackId lookups
    status: pending
  - id: convex-saveforlater
    content: Replace save/remove saved-for-later with saveTrackForLater/unsaveTrackForLater operating on spotifyTracks
    status: pending
  - id: convex-queries
    content: Add Convex queries for RecentlyPlayed/Liked/SavedForLater lists returning JSON arrays
    status: pending
  - id: page-wiring
    content: Update spotify-playlister page to upsert after Spotify fetch and render from Convex queries (tabs remain separate)
    status: pending
  - id: migration
    content: Migrate existing spotifySavedForLater rows into spotifyTracks; remove legacy table + functions
    status: pending
---

# Unified Spotify Tracks (OptionB)

## Goals

- Persist “have I seen this track before + when was last time?” across sessions.
- Keep separate UI tabs (RecentlyPlayed / Liked) but each tab can show full history, not just the last 50 from Spotify.
- Merge existing SaveForLater into the same unified model.

## Key Design Decisions

- **One row per (userId, trackId)**: canonical per-user track record.
- **No `sources: string[]` field**: derive “source membership” from timestamps:
  - `lastPlayedAt` present ⇒ seen in recently played
  - `lastLikedAt` present ⇒ seen in liked songs
  - `savedForLaterAt` present ⇒ user explicitly saved
- **Use Spotify timestamps**:
  - Recently played: Spotify `played_at`
  - Liked songs: Spotify `added_at`
  - Also maintain `lastSeenAt = max(lastPlayedAt, lastLikedAt, savedForLaterAt)` for a consistent “most recent overall” ordering.
- **Multi-user safe lookups**: all upserts and deletes must query by `(userId, trackId)` (never global `trackId`).
- **Convex return types stay JSON**: queries return arrays; build `Set` on the client if needed.

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
  savedForLaterAt: v.optional(v.number()),
})
  .index('by_userId', ['userId'])
  .index('by_userId_trackId', ['userId', 'trackId'])
  .index('by_userId_lastSeenAt', ['userId', 'lastSeenAt'])
```

Notes:
- Prefer the required `lastSeenAt` index for ordering; optional-field indexes can be added later if needed.

- **Remove** `spotifySavedForLater` table after migration.

## Convex Functions

Update [convex/spotify.ts](convex/spotify.ts):

### Upsert from Spotify sources

- **Add** `upsertTracksFromRecentlyPlayed({ userId, items })`
  - For each item: upsert `(userId, trackId)`
  - Set `lastPlayedAt = max(existing.lastPlayedAt, Date.parse(item.played_at))`
  - Update `lastSeenAt`
- **Add** `upsertTracksFromLiked({ userId, items })`
  - Use `Date.parse(item.added_at)` as `lastLikedAt` candidate
  - Update `lastSeenAt`

Implementation detail:
- Use `by_userId_trackId` to find existing rows.
- Keep updates idempotent.

### Save for later (merged)

- **Replace** existing `saveForLater` / `removeSavedForLater` with:
  - `saveTrackForLater({ userId, track, savedAt })` sets `savedForLaterAt` and updates `lastSeenAt`
  - `unsaveTrackForLater({ userId, trackId })` clears `savedForLaterAt`

### Queries for UI

- `getRecentlyPlayedTracks({ userId, limit, cursor })`:
  - filter: `lastPlayedAt` present
  - order: by `lastPlayedAt` desc (if optional ordering becomes awkward, order by `lastSeenAt` and filter client-side as a first iteration)
- `getLikedTracks({ userId, limit, cursor })`:
  - filter: `lastLikedAt` present
  - order similarly
- `getSavedForLaterTracks({ userId })`:
  - filter: `savedForLaterAt` present

Return arrays of track docs; client can compute `Set(trackId)` as needed.

## API / Page Wiring

Update [src/app/spotify-playlister/page.tsx](src/app/spotify-playlister/page.tsx):

- Keep the current Spotify API fetch routes:
  - `/api/spotify/recent-tracks`
  - `/api/spotify/liked-tracks`
- On refresh/fetch:
  - fetch from Spotify API
  - call the appropriate Convex upsert mutation with the returned items
  - UI displays from Convex queries (canonical persisted state), not directly from the API payload

Update the recent/liked components as needed to consume Convex-backed lists.

## Migration

Add a one-time migration script/mutation to move existing rows from `spotifySavedForLater` → `spotifyTracks`:

- For each saved row:
  - upsert `(userId, trackId)`
  - set `savedForLaterAt = savedAt`
  - set `firstSeenAt`/`lastSeenAt` accordingly

After verifying counts, remove old table + old queries/mutations.

## Rollout Checks

- Verify saving/removing “for later” only affects the current user.
- Verify refresh pulls latest 50 from Spotify, but the UI shows the full persisted history.
- Verify idempotency: refreshing repeatedly doesn’t create duplicates and only advances timestamps.

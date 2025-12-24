---
name: CanonicalTracks+UserTrackStats
overview: Store Spotify track metadata once (canonical) and store per-user encounter timestamps separately, enabling persistent recently played + liked history without duplicating track data and without cross-user leakage.
todos:
  - id: schema
    content: Add spotifyTracks + spotifyUserTracks tables; remove spotifySavedForLater
    status: pending
  - id: convex-upserts
    content: Implement upsertTracksFromRecentlyPlayed and upsertTracksFromLiked writing to both tables (canonical + per-user)
    status: pending
  - id: convex-queries
    content: Implement getRecentlyPlayedHistory and getLikedHistory that return merged display data
    status: pending
  - id: remove-saveforlater
    content: Remove SaveForLater Convex functions + UI usages
    status: pending
  - id: page-wiring
    content: Update spotify-playlister page to upsert after Spotify fetch and render from Convex history queries
    status: pending
---

# Canonical Tracks + User Track Stats

## Goals

- Persist “have I encountered this track before + when was last time?” across sessions.
- Keep separate UI tabs (RecentlyPlayed / Liked) that can show full history, not just Spotify’s last 50.
- Remove SaveForLater entirely.

## Data Model

### Canonical track metadata (shared)

- `spotifyTracks` (one row per Spotify `trackId`)
- Stores display fields + optional `trackData` JSON.

### Per-user encounter stats

- `spotifyUserTracks` (one row per `(userId, trackId)`)
- Stores timestamps:
  - `firstSeenAt`
  - `lastSeenAt = max(lastPlayedAt, lastLikedAt)`
  - `lastPlayedAt` (from Spotify `played_at`)
  - `lastLikedAt` (from Spotify `added_at`)

This keeps metadata deduped while keeping history private and correct per user.

## Schema Changes

Update [convex/schema.ts](convex/schema.ts):

### Add `spotifyTracks`

```typescript
spotifyTracks: defineTable({
  trackId: v.string(),
  trackName: v.string(),
  artistName: v.string(),
  albumName: v.optional(v.string()),
  albumImageUrl: v.optional(v.string()),
  trackData: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index('by_trackId', ['trackId'])
```

### Add `spotifyUserTracks`

```typescript
spotifyUserTracks: defineTable({
  userId: v.string(),
  trackId: v.string(),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  lastPlayedAt: v.optional(v.number()),
  lastLikedAt: v.optional(v.number()),
})
  .index('by_userId_trackId', ['userId', 'trackId'])
  .index('by_userId_lastSeenAt', ['userId', 'lastSeenAt'])
```

### Remove SaveForLater

- Remove `spotifySavedForLater` table.

## Convex Functions

Update [convex/spotify.ts](convex/spotify.ts):

### Upserts

- `upsertTracksFromRecentlyPlayed({ userId, items })`
  - For each item:
    - Upsert canonical `spotifyTracks` by `trackId`
    - Upsert `spotifyUserTracks` by `(userId, trackId)`
      - `playedAtMs = Date.parse(item.played_at)`
      - `lastPlayedAt = max(existing.lastPlayedAt, playedAtMs)`
      - `firstSeenAt = min(existing.firstSeenAt, playedAtMs)` (or set on insert)
      - `lastSeenAt = max(lastPlayedAt, lastLikedAt)`

- `upsertTracksFromLiked({ userId, items })`
  - For each item:
    - Upsert canonical `spotifyTracks`
    - Upsert `spotifyUserTracks`
      - `likedAtMs = Date.parse(item.added_at)`
      - `lastLikedAt = max(existing.lastLikedAt, likedAtMs)`
      - Update `firstSeenAt`/`lastSeenAt`

**Multi-user safety**: all `spotifyUserTracks` lookups use `by_userId_trackId`.

### Queries

- `getRecentlyPlayedHistory({ userId, limit, cursor })`
  - primary ordering: `lastPlayedAt` desc
  - join with `spotifyTracks` for display

- `getLikedHistory({ userId, limit, cursor })`
  - ordering: `lastLikedAt` desc
  - join with `spotifyTracks`

Implementation note: Convex doesn’t support server-side joins; pattern is:
- query `spotifyUserTracks` for IDs + timestamps
- fetch corresponding `spotifyTracks` (by `trackId`) and merge in the handler

Return JSON arrays (no `Set`).

## UI / Page Wiring

Update [src/app/spotify-playlister/page.tsx](src/app/spotify-playlister/page.tsx):

- Keep existing Spotify fetch routes:
  - `/api/spotify/recent-tracks`
  - `/api/spotify/liked-tracks`
- On refresh:
  - fetch from Spotify
  - call `upsertTracksFromRecentlyPlayed` / `upsertTracksFromLiked`
  - render tabs from Convex history queries (not direct API payload)

## Remove SaveForLater

- Remove Convex functions and UI elements related to SaveForLater:
  - mutations/queries (`saveForLater`, `removeSavedForLater`, `getSavedForLater`, `getSavedTrackIds`)
  - any buttons/filters in components that depended on them

## Rollout Checks

- Refresh repeatedly: no duplicates; timestamps only move forward.
- Cross-user: one user’s history never affects another’s.
- UI tabs: show persisted history beyond 50 after a few refreshes.
